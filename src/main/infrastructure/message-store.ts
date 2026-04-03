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
  timestamp?: number
  toolCalls?: any[]
  error?: string
  errorCategory?: string
  agentId?: string // MOMO-50: Multi-agent support
  metadata?: Record<string, any>
}

export class MessageStore {
  private db: Database.Database

  constructor() {
    const configDir = join(homedir(), '.watson')
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
    
    this.db = new Database(join(configDir, 'messages.db'))
    this.db.pragma('journal_mode = WAL')
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
        timestamp INTEGER,
        tool_calls TEXT,
        error TEXT,
        error_category TEXT,
        agent_id TEXT,
        metadata TEXT
      )
    `)
    
    // Migrations: add columns if missing
    const migrations = [
      `ALTER TABLE messages ADD COLUMN timestamp INTEGER`,
      `ALTER TABLE messages ADD COLUMN metadata TEXT`
    ]
    for (const sql of migrations) {
      try { 
        this.db.exec(sql) 
      } catch (e: any) {
        if (e.message && !e.message.includes('duplicate column')) {
          console.warn('[message-store] migration warning:', e.message)
        }
      }
    }

    // Add index for session lookups
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at)`)
  }

  save(message: Message) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages (id, session_id, workspace_id, role, content, status, created_at, timestamp, tool_calls, error, error_category, agent_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      message.id,
      message.sessionId,
      message.workspaceId,
      message.role,
      message.content,
      message.status,
      message.createdAt,
      message.timestamp || message.createdAt,
      message.toolCalls ? JSON.stringify(message.toolCalls) : null,
      message.error || null,
      message.errorCategory || null,
      message.agentId || null,
      message.metadata ? JSON.stringify(message.metadata) : null
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
      timestamp: row.timestamp || row.created_at,
      toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
      error: row.error || undefined,
      errorCategory: row.error_category || undefined,
      agentId: row.agent_id || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }))
  }

  /**
   * List all distinct session IDs that have messages stored.
   * Used for discovering sessions on startup.
   */
  listSessionIds(workspaceId?: string): string[] {
    if (workspaceId) {
      const rows = this.db.prepare(
        'SELECT DISTINCT session_id FROM messages WHERE workspace_id = ?'
      ).all(workspaceId) as any[]
      return rows.map(r => r.session_id)
    }
    const rows = this.db.prepare('SELECT DISTINCT session_id FROM messages').all() as any[]
    return rows.map(r => r.session_id)
  }

  clear(sessionId: string, workspaceId: string) {
    const stmt = this.db.prepare('DELETE FROM messages WHERE session_id = ? AND workspace_id = ?')
    stmt.run(sessionId, workspaceId)
  }

  /**
   * Clear all messages for a session regardless of workspace.
   * Used when deleting a session entirely.
   */
  clearBySessionId(sessionId: string) {
    this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
  }

  close() {
    this.db.close()
  }
}
