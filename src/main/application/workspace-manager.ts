/**
 * WorkspaceManager — Application Layer
 *
 * Bridges domain (ChatSession) with infrastructure (Claw, MCP, ToolRunner).
 * Uses workspace-db for per-workspace persistence.
 */

import { ChatSession } from '../domain/chat-session'
import { McpManager } from '../infrastructure/mcp-manager'
import { AgentManager } from '../infrastructure/agent-manager'
import { CodingAgentManager } from '../infrastructure/coding-agent-manager'
import { CodingAgentExecutor } from '../infrastructure/coding-agent-executor'
import { createClawLLMStream } from '../infrastructure/claw-bridge'
import * as db from '../infrastructure/workspace-db'
import type { AgentConfig } from '../infrastructure/agent-manager'

export class WorkspaceManager {
  private workspaces = new Map<string, Workspace>()
  private mcpManager: McpManager | null = null
  private codingAgentManager = new CodingAgentManager()

  setMcpManager(manager: McpManager) {
    this.mcpManager = manager
  }

  getCodingAgentManager(): CodingAgentManager {
    return this.codingAgentManager
  }

  getOrCreate(workspacePath: string): Workspace {
    if (!this.workspaces.has(workspacePath)) {
      this.workspaces.set(workspacePath, new Workspace(workspacePath, this.mcpManager, this.codingAgentManager))
    }
    return this.workspaces.get(workspacePath)!
  }

  list(): Workspace[] {
    return Array.from(this.workspaces.values())
  }
}

export class Workspace {
  path: string
  sessions = new Map<string, ChatSession>()
  private mcpManager: McpManager | null
  private agentManager: AgentManager
  private codingAgentManager: CodingAgentManager

  constructor(path: string, mcpManager: McpManager | null = null, codingAgentManager: CodingAgentManager) {
    this.path = path
    this.mcpManager = mcpManager
    this.agentManager = new AgentManager(path)
    this.codingAgentManager = codingAgentManager
  }

  getAgentManager(): AgentManager {
    return this.agentManager
  }

  /** Route message to coding agent (Claude Code, etc.) */
  async routeToCodingAgent(
    agentConfig: AgentConfig,
    message: string,
    options: { sessionId: string; signal?: AbortSignal; onToken?: (text: string) => void }
  ): Promise<string> {
    if (!agentConfig.codingAgentId) throw new Error('Agent does not have a coding agent ID')

    const codingConfig = this.codingAgentManager.getConfig(agentConfig.codingAgentId)
    if (!codingConfig) throw new Error(`Coding agent '${agentConfig.codingAgentId}' not found`)
    if (!this.codingAgentManager.isAvailable(agentConfig.codingAgentId)) {
      throw new Error(`Coding agent '${agentConfig.codingAgentId}' is not available`)
    }

    const binPath = this.codingAgentManager.getBinPath(agentConfig.codingAgentId)
    const executor = new CodingAgentExecutor()
    return executor.execute(codingConfig, message, binPath, {
      cwd: this.path,
      signal: options.signal,
      onToken: options.onToken,
    })
  }

  getOrCreateSession(sessionId: string): ChatSession {
    if (!this.sessions.has(sessionId)) {
      const llmStream = createClawLLMStream(this.path, this.mcpManager, this.agentManager)
      const session = new ChatSession(sessionId, this.path, llmStream)

      // Load persisted messages from per-workspace DB
      const saved = db.loadMessages(this.path, sessionId)
      session.messages = saved.map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp,
        status: m.status as any,
        error: m.error,
        toolCalls: m.toolCalls,
        agentId: m.agentId,
      }))

      // Ensure session record exists
      if (!db.getSession(this.path, sessionId)) {
        db.createSession(this.path, sessionId, 'New Chat')
      }

      // Wire persistence — save to per-workspace DB
      session.on('persist', (message) => {
        db.saveMessage(this.path, {
          id: message.id,
          sessionId,
          role: message.role,
          content: message.content,
          timestamp: message.timestamp,
          status: message.status,
          toolCalls: message.toolCalls,
          error: message.error,
          agentId: message.agentId,
        })
        db.touchSession(this.path, sessionId)
      })

      this.sessions.set(sessionId, session)
    }
    return this.sessions.get(sessionId)!
  }
}
