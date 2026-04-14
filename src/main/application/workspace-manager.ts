/**
 * WorkspaceManager — Application Layer
 *
 * Bridges domain (ChatSession) with infrastructure (Claw, MCP, ToolRunner).
 * Injects dependencies via constructor/factory pattern.
 *
 * MOMO-34: Now injects ToolRunner.execute as the toolExecutor for the agentic tool loop.
 * MOMO-50: Multi-agent support via AgentManager.
 * MOMO-51: Uses shared messageStore/sessionStore from persistence-handlers for SQLite persistence.
 * MOMO-60: Replaced EnhancedLLMClient + ErrorRecovery with agentic-core (claw-bridge).
 *          agenticAsk now handles: streaming, tool loop, loop detection, failover, eager execution.
 */

import { ChatSession, type LLMStreamFn, type ErrorRecoveryCallbacks, type ToolExecutorFn } from '../domain/chat-session'
import { ToolRunner } from '../infrastructure/tool-runner'
import { loadConfig } from '../infrastructure/config'
import { McpManager } from '../infrastructure/mcp-manager'
import { buildSystemPrompt } from '../infrastructure/prompt-builder'
import { messageStore, sessionStore } from './persistence-handlers'
import { AgentManager, type AgentConfig } from '../infrastructure/agent-manager'
import { CodingAgentManager, type CodingAgentConfig } from '../infrastructure/coding-agent-manager'
import { CodingAgentExecutor } from '../infrastructure/coding-agent-executor'
import { createClawLLMStream } from '../infrastructure/claw-bridge'

export class WorkspaceManager {
  private workspaces = new Map<string, Workspace>()
  private mcpManager: McpManager | null = null
  private codingAgentManager = new CodingAgentManager()

  setMcpManager(manager: McpManager) {
    this.mcpManager = manager
    // Wire MCP manager into ToolRunner
    ToolRunner.setMcpManager(manager)
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

  /**
   * MOMO-52: Route message to coding agent.
   * Returns a streaming response from the coding agent.
   */
  async routeToCodingAgent(
    agentConfig: AgentConfig,
    message: string,
    options: { sessionId: string; signal?: AbortSignal; onToken?: (text: string) => void }
  ): Promise<string> {
    if (!agentConfig.codingAgentId) {
      throw new Error('Agent does not have a coding agent ID')
    }

    const codingConfig = this.codingAgentManager.getConfig(agentConfig.codingAgentId)
    if (!codingConfig) {
      throw new Error(`Coding agent '${agentConfig.codingAgentId}' not found`)
    }

    if (!this.codingAgentManager.isAvailable(agentConfig.codingAgentId)) {
      throw new Error(`Coding agent '${agentConfig.codingAgentId}' is not available`)
    }

    const binPath = this.codingAgentManager.getBinPath(agentConfig.codingAgentId)
    const executor = new CodingAgentExecutor()

    try {
      const result = await executor.execute(codingConfig, message, binPath, {
        cwd: this.path,
        signal: options.signal,
        onToken: options.onToken,
      })
      return result
    } catch (err: any) {
      throw new Error(`Coding agent error: ${err.message}`)
    }
  }

  getOrCreateSession(sessionId: string): ChatSession {
    if (!this.sessions.has(sessionId)) {
      const config = loadConfig(this.path)
      // MOMO-60: Use claw-bridge for LLM streaming + tool loop
      const llmStream = createClawLLMStream(this.path, this.mcpManager, this.agentManager)
      // Tool loop is now handled by agenticAsk inside claw-bridge,
      // so recovery and toolExecutor are no longer needed by ChatSession.
      // Pass noop for backward compat until ChatSession is simplified.
      const recovery: ErrorRecoveryCallbacks = {
        prepareMessages: async (msgs) => msgs,
        handleError: () => ({
          classified: { short: 'handled', detail: 'handled by claw', category: 'unknown', retryable: false },
          action: 'abort' as const,
          retryDelayMs: 0,
        }),
        checkToolCall: () => ({ blocked: false, warning: false }),
        recordToolOutcome: () => {},
      }
      const toolExecutor = this.createToolExecutor()
      const session = new ChatSession(sessionId, this.path, llmStream, recovery, toolExecutor)
      
      // Load persisted messages
      const savedMessages = messageStore.load(sessionId, this.path)
      session.messages = savedMessages.map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp || m.createdAt,
        status: m.status as any,
        error: m.error,
        errorCategory: m.errorCategory,
        toolCalls: m.toolCalls,
        agentId: m.agentId // MOMO-50: Load agent ID
      }))
      
      // MOMO-51: Ensure session exists in SessionStore
      const existingSession = sessionStore.getSession(sessionId)
      if (!existingSession) {
        sessionStore.createSession(sessionId, 'New Chat', { participants: [this.path] })
      }
      
      // Wire persistence handler — persist both message and session timestamp
      session.on('persist', (message) => {
        messageStore.save({
          id: message.id,
          sessionId,
          workspaceId: this.path,
          role: message.role,
          content: message.content,
          status: message.status,
          createdAt: message.timestamp,
          timestamp: message.timestamp,
          toolCalls: message.toolCalls,
          error: message.error,
          errorCategory: message.errorCategory,
          agentId: message.agentId // MOMO-50: Persist agent ID
        })
        
        // MOMO-51: Touch session updated_at on every message persist
        sessionStore.touchSession(sessionId)
      })
      
      this.sessions.set(sessionId, session)
    }
    return this.sessions.get(sessionId)!
  }

  /**
   * Create tool executor function that delegates to ToolRunner.
   * Still needed for coding agent routing (MOMO-52) which bypasses the claw tool loop.
   */
  private createToolExecutor(): ToolExecutorFn {
    const workspacePath = this.path
    return async (tool, options) => {
      return ToolRunner.execute(
        { name: tool.name, input: tool.input },
        { signal: options.signal, workspacePath: options.workspacePath || workspacePath }
      )
    }
  }
}
