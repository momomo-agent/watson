/**
 * WorkspaceManager — Application Layer
 *
 * Bridges domain (ChatSession) with infrastructure (Claw, MCP, ToolRunner).
 * Uses workspace-db for per-workspace persistence.
 */

import { ChatSession } from '../domain/chat-session'
import { GroupChat, type GroupConfig, type GroupParticipant } from '../domain/group-chat'
import { McpManager } from '../infrastructure/mcp-manager'
import { AgentManager } from '../infrastructure/agent-manager'
import { CodingAgentManager } from '../infrastructure/coding-agent-manager'
import { CodingAgentExecutor } from '../infrastructure/coding-agent-executor'
import { createClawLLMStream, createGroupLLMStream, warmupTools } from '../infrastructure/claw-bridge'
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

      // Warmup: pre-load likely tools based on workspace context (fire-and-forget)
      warmupTools(this.path, this.mcpManager).catch(() => {})

      // Load persisted messages from per-workspace DB
      const saved = db.loadMessages(this.path, sessionId)
      session.messages = saved.map(m => {
        // Recover interrupted messages: streaming/pending/tool_calling → cancelled on restart
        const status = ['streaming', 'pending', 'tool_calling'].includes(m.status)
          ? 'cancelled'
          : m.status
        return {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp,
        status: status as any,
        error: m.error,
        toolCalls: m.toolCalls,
        agentId: m.agentId,
        timing: m.metadata?.timing,
      }})

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
          metadata: message.timing ? { timing: message.timing } : undefined,
        })
        db.touchSession(this.path, sessionId)
      })

      this.sessions.set(sessionId, session)
    }
    return this.sessions.get(sessionId)!
  }

  /**
   * Send a message in group mode.
   * Creates a GroupChat pipeline, runs it, and pushes produced messages into the session.
   */
  async sendGroupMessage(
    sessionId: string,
    userMessage: string,
    options?: { signal?: AbortSignal },
  ): Promise<void> {
    const session = this.getOrCreateSession(sessionId)
    return session.enqueue(() => this._sendGroupMessageImpl(session, userMessage, options))
  }

  private async _sendGroupMessageImpl(
    session: ChatSession,
    userMessage: string,
    options?: { signal?: AbortSignal },
  ): Promise<void> {
    const agents = this.agentManager.listAgents()
    const defaultAgent = this.agentManager.getDefaultAgent()

    // Build group config from agent manager
    const orchestrator: GroupParticipant = {
      id: defaultAgent.id,
      name: defaultAgent.name,
      description: defaultAgent.description,
      avatar: defaultAgent.avatar,
      color: defaultAgent.color,
      systemPrompt: defaultAgent.systemPrompt,
    }

    const participants: GroupParticipant[] = agents
      .filter(a => a.id !== defaultAgent.id)
      .map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        avatar: a.avatar,
        color: a.color,
        systemPrompt: a.systemPrompt,
        tools: a.tools,
      }))

    // If no other participants, fall back to single-agent
    if (participants.length === 0) {
      await session.sendMessage(userMessage)
      return
    }

    const config: GroupConfig = {
      orchestrator,
      participants,
      maxDelegateRounds: 3,
    }

    // Create stream factory for group chat
    const createStream = (agentId: string | null, overrideTools?: any[]) => {
      return createGroupLLMStream(
        this.path,
        this.mcpManager,
        this.agentManager,
        agentId,
        overrideTools,
      )
    }

    const groupChat = new GroupChat(config, createStream)

    // Add user message to session
    const userMsg = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      role: 'user' as const,
      content: userMessage,
      timestamp: Date.now(),
      status: 'complete' as const,
    }
    session.messages.push(userMsg)
    session.emit('persist', userMsg)
    session.emit('update', session.getUpdateEvent())

    // Wire group chat events to session
    groupChat.on('message:start', (msg) => {
      session.messages.push(msg)
      session.emit('persist', msg)
      session.emit('update', session.getUpdateEvent())
    })

    groupChat.on('message:update', (msg) => {
      session.emit('persist', msg)
      session.emit('update', session.getUpdateEvent())
    })

    groupChat.on('message', (msg) => {
      // Final message — ensure it's in the array if not already (from message:start)
      if (!session.messages.find(m => m.id === msg.id)) {
        session.messages.push(msg)
      }
      session.emit('persist', msg)
      session.emit('update', session.getUpdateEvent())
    })

    // Build session summary from recent messages (lightweight)
    const recentMsgs = session.messages.slice(-6)
    const summary = recentMsgs.length > 1
      ? recentMsgs
          .filter(m => m.role !== 'system')
          .map(m => `${m.senderName || m.role}: ${m.content.slice(0, 100)}`)
          .join('\n')
      : undefined

    // Run pipeline
    await groupChat.handleMessage(userMessage, summary, options?.signal)
  }
}
