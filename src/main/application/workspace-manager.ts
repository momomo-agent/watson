import { ChatSession } from '../domain/chat-session'

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
      this.sessions.set(sessionId, new ChatSession(sessionId, this.path))
    }
    return this.sessions.get(sessionId)!
  }
}
