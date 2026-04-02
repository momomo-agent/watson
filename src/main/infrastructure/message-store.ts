import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync } from 'fs'

export interface Message {
  id: string
  workspaceId: string
  role: string
  content: string
  status: string
  createdAt: number
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
        workspace_id TEXT,
        role TEXT,
        content TEXT,
        status TEXT,
        created_at INTEGER
      )
    `)
  }

  save(message: Message) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages (id, workspace_id, role, content, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(message.id, message.workspaceId, message.role, message.content, message.status, message.createdAt)
  }

  load(workspaceId: string): Message[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages WHERE workspace_id = ? ORDER BY created_at ASC
    `)
    const rows = stmt.all(workspaceId) as any[]
    return rows.map(row => ({
      id: row.id,
      workspaceId: row.workspace_id,
      role: row.role,
      content: row.content,
      status: row.status,
      createdAt: row.created_at
    }))
  }

  clear(workspaceId: string) {
    const stmt = this.db.prepare('DELETE FROM messages WHERE workspace_id = ?')
    stmt.run(workspaceId)
  }

  close() {
    this.db.close()
  }
}
