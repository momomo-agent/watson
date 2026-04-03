/**
 * SessionStore — SQLite backend for session persistence
 * 
 * Manages sessions table with metadata (title, timestamps, mode, status, participants).
 * Aligned with paw's session-store.js architecture.
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync } from 'fs'

export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  mode?: string
  statusLevel?: string
  statusText?: string
  participants?: string[]
}

export interface SessionAgent {
  id: string
  sessionId: string
  name: string
  role: string
  createdAt: number
}

export class SessionStore {
  private db: Database.Database

  constructor() {
    const configDir = join(homedir(), '.watson')
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
    
    this.db = new Database(join(configDir, 'sessions.db'))
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.init()
  }

  private init() {
    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        mode TEXT DEFAULT 'chat',
        status_level TEXT DEFAULT 'idle',
        status_text TEXT DEFAULT '',
        participants TEXT DEFAULT '[]'
      )
    `)

    // Session agents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_agents (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_session_agents_session ON session_agents(session_id)`)
  }

  // ── Session CRUD ──

  createSession(id: string, title: string = '', options: { participants?: string[], mode?: string } = {}): Session {
    const now = Date.now()
    const participants = JSON.stringify(options.participants || [])
    const mode = options.mode || 'chat'
    
    this.db.prepare(`
      INSERT INTO sessions (id, title, created_at, updated_at, mode, participants)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, title, now, now, mode, participants)
    
    return {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      mode,
      participants: options.participants || []
    }
  }

  getSession(id: string): Session | null {
    const row = this.db.prepare(`
      SELECT id, title, created_at as createdAt, updated_at as updatedAt, 
             mode, status_level as statusLevel, status_text as statusText, participants
      FROM sessions WHERE id = ?
    `).get(id) as any
    
    if (!row) return null
    
    return {
      ...row,
      participants: this._parseParticipants(row.participants)
    }
  }

  listSessions(options: { workspaceId?: string } = {}): Session[] {
    const rows = this.db.prepare(`
      SELECT id, title, created_at as createdAt, updated_at as updatedAt,
             mode, status_level as statusLevel, status_text as statusText, participants
      FROM sessions ORDER BY updated_at DESC
    `).all() as any[]
    
    const sessions = rows.map(row => ({
      ...row,
      participants: this._parseParticipants(row.participants)
    }))
    
    if (options.workspaceId) {
      return sessions.filter(s => s.participants?.includes(options.workspaceId))
    }
    
    return sessions
  }

  updateSession(id: string, updates: Partial<Session>) {
    const now = Date.now()
    const fields: string[] = ['updated_at = ?']
    const values: any[] = [now]
    
    if (updates.title !== undefined) {
      fields.push('title = ?')
      values.push(updates.title)
    }
    
    if (updates.mode !== undefined) {
      fields.push('mode = ?')
      values.push(updates.mode)
    }
    
    if (updates.statusLevel !== undefined) {
      fields.push('status_level = ?')
      values.push(updates.statusLevel)
    }
    
    if (updates.statusText !== undefined) {
      fields.push('status_text = ?')
      values.push(updates.statusText)
    }
    
    if (updates.participants !== undefined) {
      fields.push('participants = ?')
      values.push(JSON.stringify(updates.participants))
    }
    
    values.push(id)
    
    this.db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  deleteSession(id: string) {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
  }

  touchSession(id: string) {
    this.db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), id)
  }

  // ── Session Agents CRUD ──

  createSessionAgent(sessionId: string, name: string, role: string = ''): SessionAgent {
    const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
    const now = Date.now()
    
    this.db.prepare(`
      INSERT INTO session_agents (id, session_id, name, role, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, sessionId, name, role, now)
    
    return { id, sessionId, name, role, createdAt: now }
  }

  listSessionAgents(sessionId: string): SessionAgent[] {
    return this.db.prepare(`
      SELECT id, session_id as sessionId, name, role, created_at as createdAt
      FROM session_agents WHERE session_id = ? ORDER BY created_at
    `).all(sessionId) as SessionAgent[]
  }

  getSessionAgent(agentId: string): SessionAgent | null {
    return this.db.prepare(`
      SELECT id, session_id as sessionId, name, role, created_at as createdAt
      FROM session_agents WHERE id = ?
    `).get(agentId) as SessionAgent | null
  }

  deleteSessionAgent(agentId: string): boolean {
    const result = this.db.prepare('DELETE FROM session_agents WHERE id = ?').run(agentId)
    return result.changes > 0
  }

  findSessionAgentByName(sessionId: string, name: string): SessionAgent | null {
    return this.db.prepare(`
      SELECT id, session_id as sessionId, name, role, created_at as createdAt
      FROM session_agents WHERE session_id = ? AND name = ?
    `).get(sessionId, name) as SessionAgent | null
  }

  // ── Helpers ──

  private _parseParticipants(raw: string): string[] {
    if (!raw) return []
    try {
      return JSON.parse(raw)
    } catch {
      return []
    }
  }

  close() {
    this.db.close()
  }
}
