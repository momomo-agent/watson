import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import type { Message } from '../domain/chat-session'

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'watson.db')
    db = new Database(dbPath)
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_session ON messages(session_id);
    `)
  }
  return db
}

export class Storage {
  static async saveMessages(sessionId: string, messages: Message[]): Promise<void> {
    const db = getDb()
    const insert = db.prepare('INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)')
    const deleteOld = db.prepare('DELETE FROM messages WHERE session_id = ?')
    
    db.transaction(() => {
      deleteOld.run(sessionId)
      for (const msg of messages) {
        insert.run(sessionId, msg.role, msg.content, msg.timestamp)
      }
    })()
  }

  static async loadMessages(sessionId: string): Promise<Message[]> {
    const db = getDb()
    const rows = db.prepare('SELECT role, content, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp').all(sessionId) as Array<{role: string, content: string, timestamp: number}>
    return rows.map(r => ({ role: r.role as 'user' | 'assistant', content: r.content, timestamp: r.timestamp }))
  }
}
