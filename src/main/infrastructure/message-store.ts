import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync } from 'fs'

export interface Message {
  id: string
  sessionId: string
  workspaceId: string
  role: string
  content: string
  status: string
  createdAt: number
  toolCalls?: any[]
  error?: string
  errorCategory?: string
}

export class MessageStore {
  private db: Database.Database

  constructor() {
    const configDir = join(homedir(), '.watson')
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
    
    this.db = new Database(join(configDir, 'messages.db'))
    this.init()
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        workspace_id TEXT,
        role TEXT,
        content TEXT,
        status TEXT,
        created_at INTEGER,
        tool_calls TEXT,
        error TEXT,
        error_category TEXT
      )
    `)
  }

  save(message: Message) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages (id, session_id, workspace_id, role, content, status, created_at, tool_calls, error, error_category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      message.id,
      message.sessionId,
      message.workspaceId,
      message.role,
      message.content,
      message.status,
      message.createdAt,
      message.toolCalls ? JSON.stringify(message.toolCalls) : null,
      message.error || null,
      message.errorCategory || null
    )
  }

  load(sessionId: string, workspaceId: string): Message[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages WHERE session_id = ? AND workspace_id = ? ORDER BY created_at ASC
    `)
    const rows = stmt.all(sessionId, workspaceId) as any[]
    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      workspaceId: row.workspace_id,
      role: row.role,
      content: row.content,
      status: row.status,
      createdAt: row.created_at,
      toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
      error: row.error || undefined,
      errorCategory: row.error_category || undefined
    }))
  }

  clear(sessionId: string, workspaceId: string) {
    const stmt = this.db.prepare('DELETE FROM messages WHERE session_id = ? AND workspace_id = ?')
    stmt.run(sessionId, workspaceId)
  }

  close() {
    this.db.close()
  }
}
