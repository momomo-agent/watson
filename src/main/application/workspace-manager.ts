import { ChatSession, type LLMStreamFn } from '../domain/chat-session'
import { EnhancedLLMClient } from '../infrastructure/enhanced-llm-client'
import { loadConfig } from '../infrastructure/config'

export class WorkspaceManager {
  private workspaces = new Map<string, Workspace>()

  getOrCreate(workspacePath: string): Workspace {
    if (!this.workspaces.has(workspacePath)) {
      this.workspaces.set(workspacePath, new Workspace(workspacePath))
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

  constructor(path: string) {
    this.path = path
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
    return async function* (messages, signal) {
      const config = loadConfig(workspacePath)
      const stream = EnhancedLLMClient.streamChatWithRetry({
        messages,
        signal,
        provider: config.provider,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
      }, 2)
      yield* stream
    }
  }
}
