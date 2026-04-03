/**
 * WorkspaceManager — Application Layer
 *
 * Bridges domain (ChatSession) with infrastructure (LLM, ErrorRecovery, MCP, ToolRunner).
 * Injects dependencies via constructor/factory pattern.
 *
 * MOMO-34: Now injects ToolRunner.execute as the toolExecutor for the agentic tool loop.
 * MOMO-50: Multi-agent support via AgentManager.
 * MOMO-51: Uses shared messageStore/sessionStore from persistence-handlers for SQLite persistence.
 */

import { ChatSession, type LLMStreamFn, type ErrorRecoveryCallbacks, type ToolExecutorFn } from '../domain/chat-session'
import { EnhancedLLMClient, type ProviderConfig } from '../infrastructure/enhanced-llm-client'
import { ErrorRecovery } from '../infrastructure/error-recovery'
import { ToolRunner } from '../infrastructure/tool-runner'
import { loadConfig } from '../infrastructure/config'
import { McpManager } from '../infrastructure/mcp-manager'
import { BUILTIN_TOOLS } from '../infrastructure/tools'
import { buildSystemPrompt } from '../infrastructure/prompt-builder'
import { messageStore, sessionStore } from './persistence-handlers'
import { AgentManager, type AgentConfig } from '../infrastructure/agent-manager'

export class WorkspaceManager {
  private workspaces = new Map<string, Workspace>()
  private mcpManager: McpManager | null = null

  setMcpManager(manager: McpManager) {
    this.mcpManager = manager
    // Wire MCP manager into ToolRunner
    ToolRunner.setMcpManager(manager)
  }

  getOrCreate(workspacePath: string): Workspace {
    if (!this.workspaces.has(workspacePath)) {
      this.workspaces.set(workspacePath, new Workspace(workspacePath, this.mcpManager))
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

  constructor(path: string, mcpManager: McpManager | null = null) {
    this.path = path
    this.mcpManager = mcpManager
    this.agentManager = new AgentManager(path)
  }

  getAgentManager(): AgentManager {
    return this.agentManager
  }

  getOrCreateSession(sessionId: string): ChatSession {
    if (!this.sessions.has(sessionId)) {
      const config = loadConfig(this.path)
      const llmStream = this.createLLMStream()
      const recovery = this.createErrorRecovery(config.model)
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

  private createLLMStream(): LLMStreamFn {
    const workspacePath = this.path
    const mcpManager = this.mcpManager
    const agentManager = this.agentManager
    return async function* (messages, signal) {
      const config = loadConfig(workspacePath)

      // MOMO-50: Check if the last assistant message has an agentId
      // If so, use that agent's configuration
      let agentConfig: AgentConfig | undefined
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant' && (messages[i] as any).agentId) {
          agentConfig = agentManager.getAgent((messages[i] as any).agentId)
          break
        }
      }

      // Merge agent config with workspace config
      const provider = agentConfig?.provider || config.provider
      const apiKey = agentConfig?.apiKey || config.apiKey
      const baseUrl = agentConfig?.baseUrl || config.baseUrl
      const model = agentConfig?.model || config.model

      // Merge built-in tools and MCP tools
      let tools = [...BUILTIN_TOOLS]
      if (mcpManager) {
        tools.push(...mcpManager.listTools())
      }

      // Filter tools if agent has tool restrictions
      if (agentConfig?.tools && agentConfig.tools.length > 0) {
        const allowedTools = new Set(agentConfig.tools)
        tools = tools.filter(t => allowedTools.has(t.name))
      }

      // Build system prompt from workspace files + tools + agent-specific prompt
      let systemPrompt = buildSystemPrompt(workspacePath, tools)
      if (agentConfig?.systemPrompt) {
        systemPrompt = `${agentConfig.systemPrompt}\n\n${systemPrompt}`
      }

      // Use the resilient streaming method with retry + failover
      const stream = EnhancedLLMClient.streamChatWithRetry(
        {
          messages,
          signal,
          provider,
          apiKey,
          baseUrl,
          model,
          system: systemPrompt,
          tools,
        },
        2, // maxRetries
        {
          onRetry: (event) => {
            console.log(
              `[workspace] LLM retry: attempt ${event.attempt}/${event.maxAttempts} — ${event.reason}`
            )
          },
          onError: (classified) => {
            console.log(
              `[workspace] LLM error classified: ${classified.category} — ${classified.short}`
            )
          },
        }
      )
      yield* stream
    }
  }

  /**
   * Create tool executor function that delegates to ToolRunner.
   * This wires the infrastructure layer (ToolRunner) into the domain layer (ChatSession)
   * without the domain knowing about ToolRunner directly.
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

  /**
   * Create error recovery callbacks for a chat session.
   * Wires the ErrorRecovery infrastructure into the domain layer
   * without the domain knowing about infrastructure details.
   */
  private createErrorRecovery(model?: string): ErrorRecoveryCallbacks {
    const recovery = new ErrorRecovery({
      model,
      maxRetries: 3,
      onRecovery: (event) => {
        console.log(`[error-recovery] ${event.type}: ${event.detail}`)
      },
    })

    return {
      prepareMessages: async (messages) => {
        return recovery.prepareMessages(messages)
      },

      handleError: (err) => {
        return recovery.handleError(err)
      },

      checkToolCall: (toolName, params) => {
        return recovery.checkToolCall(toolName, params)
      },

      recordToolOutcome: (toolName, params, result, error) => {
        recovery.recordToolOutcome(toolName, params, result, error)
      },
    }
  }
}
