/**
 * WorkspaceManager — Application Layer
 *
 * Bridges domain (ChatSession) with infrastructure (LLM, ErrorRecovery, MCP).
 * Injects dependencies via constructor/factory pattern.
 */

import { ChatSession, type LLMStreamFn, type ErrorRecoveryCallbacks } from '../domain/chat-session'
import { EnhancedLLMClient, type ProviderConfig } from '../infrastructure/enhanced-llm-client'
import { ErrorRecovery } from '../infrastructure/error-recovery'
import { loadConfig } from '../infrastructure/config'
import { McpManager } from '../infrastructure/mcp-manager'
import { BUILTIN_TOOLS } from '../infrastructure/tools'

export class WorkspaceManager {
  private workspaces = new Map<string, Workspace>()
  private mcpManager: McpManager | null = null

  setMcpManager(manager: McpManager) {
    this.mcpManager = manager
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
      this.sessions.set(sessionId, new ChatSession(sessionId, this.path, llmStream, recovery))
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

      // Use the resilient streaming method with retry + failover
      const stream = EnhancedLLMClient.streamChatWithRetry(
        {
          messages,
          signal,
          provider: config.provider,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.model,
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
