/**
 * WorkspaceManager — Application Layer
 *
 * Bridges domain (ChatSession) with infrastructure (LLM, ErrorRecovery, MCP, ToolRunner).
 * Injects dependencies via constructor/factory pattern.
 *
 * MOMO-34: Now injects ToolRunner.execute as the toolExecutor for the agentic tool loop.
 */

import { ChatSession, type LLMStreamFn, type ErrorRecoveryCallbacks, type ToolExecutorFn } from '../domain/chat-session'
import { EnhancedLLMClient, type ProviderConfig } from '../infrastructure/enhanced-llm-client'
import { ErrorRecovery } from '../infrastructure/error-recovery'
import { ToolRunner } from '../infrastructure/tool-runner'
import { loadConfig } from '../infrastructure/config'
import { McpManager } from '../infrastructure/mcp-manager'
import { BUILTIN_TOOLS } from '../infrastructure/tools'
import { buildSystemPrompt } from '../infrastructure/prompt-builder'
import { MessageStore } from '../infrastructure/message-store'

const messageStore = new MessageStore()

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

  constructor(path: string, mcpManager: McpManager | null = null) {
    this.path = path
    this.mcpManager = mcpManager
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
        timestamp: m.createdAt,
        status: m.status as any,
        error: m.error,
        errorCategory: m.errorCategory,
        toolCalls: m.toolCalls
      }))
      
      // Wire persistence handler
      session.on('persist', (message) => {
        messageStore.save({
          id: message.id,
          sessionId,
          workspaceId: this.path,
          role: message.role,
          content: message.content,
          status: message.status,
          createdAt: message.timestamp,
          toolCalls: message.toolCalls,
          error: message.error,
          errorCategory: message.errorCategory
        })
      })
      
      this.sessions.set(sessionId, session)
    }
    return this.sessions.get(sessionId)!
  }

  private createLLMStream(): LLMStreamFn {
    const workspacePath = this.path
    const mcpManager = this.mcpManager
    return async function* (messages, signal) {
      const config = loadConfig(workspacePath)

      // Merge built-in tools and MCP tools
      const tools = [...BUILTIN_TOOLS]
      if (mcpManager) {
        tools.push(...mcpManager.listTools())
      }

      // Build system prompt from workspace files + tools
      const systemPrompt = buildSystemPrompt(workspacePath, tools)

      // Use the resilient streaming method with retry + failover
      const stream = EnhancedLLMClient.streamChatWithRetry(
        {
          messages,
          signal,
          provider: config.provider,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.model,
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
