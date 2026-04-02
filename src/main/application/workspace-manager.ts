import { ChatSession, type LLMStreamFn } from '../domain/chat-session'
import { EnhancedLLMClient } from '../infrastructure/enhanced-llm-client'
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
      // Application layer creates the LLM stream function
      // and injects it into Domain layer (ChatSession)
      const llmStream = this.createLLMStream()
      this.sessions.set(sessionId, new ChatSession(sessionId, this.path, llmStream))
    }
    return this.sessions.get(sessionId)!
  }

  private createLLMStream(): LLMStreamFn {
    const workspacePath = this.path
    const mcpManager = this.mcpManager
    return async function* (messages, signal) {
      const config = loadConfig(workspacePath)
      
      // 合并内置工具和 MCP 工具
      const tools = [...BUILTIN_TOOLS]
      if (mcpManager) {
        tools.push(...mcpManager.listTools())
      }
      
      const stream = EnhancedLLMClient.streamChatWithRetry({
        messages,
        signal,
        provider: config.provider,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        tools
      }, 2)
      yield* stream
    }
  }
}
