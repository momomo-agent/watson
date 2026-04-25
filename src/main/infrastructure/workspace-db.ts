/**
 * Workspace DB — Per-workspace SQLite (sessions + messages in one DB)
 *
 * Aligned with Paw's session-store.js:
 * - DB lives at <workspace>/.watson/sessions.db
 * - sessions + messages tables in same DB
 * - Foreign key: messages.session_id → sessions.id (CASCADE delete)
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'

// ── Types ──

export interface SessionRow {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  mode: string
  statusLevel: string
  statusText: string
  participants: string[]
}

export interface MessageRow {
  id: string
  sessionId: string
  role: string
  content: string
  timestamp: number
  status: string
  toolCalls?: any[]
  error?: string
  agentId?: string
  metadata?: Record<string, any>
}

// ── DB Cache (one DB per workspace path) ──

const dbCache = new Map<string, Database.Database>()

function getDb(wsPath: string): Database.Database {
  const dbPath = join(wsPath, '.watson', 'sessions.db')
  if (dbCache.has(dbPath)) return dbCache.get(dbPath)!

  mkdirSync(join(wsPath, '.watson'), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  ensureSchema(db)
  dbCache.set(dbPath, db)
  return db
}

function ensureSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      mode TEXT DEFAULT 'chat',
      status_level TEXT DEFAULT 'idle',
      status_text TEXT DEFAULT '',
      participants TEXT DEFAULT '[]',
      last_message TEXT DEFAULT ''
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      timestamp INTEGER NOT NULL,
      status TEXT DEFAULT 'complete',
      tool_calls TEXT,
      error TEXT,
      agent_id TEXT,
      metadata TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp)`)
  // Migration: add last_message if missing
  const cols = (db.prepare("PRAGMA table_info(sessions)").all() as any[]).map((c: any) => c.name)
  if (!cols.includes('last_message')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN last_message TEXT DEFAULT ''`)
  }
}

// ── Sessions ──

export function createSession(wsPath: string, id: string, title: string, opts?: { mode?: string; participants?: string[] }): SessionRow {
  const db = getDb(wsPath)
  const now = Date.now()
  db.prepare(`
    INSERT OR IGNORE INTO sessions (id, title, created_at, updated_at, mode, participants)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, title, now, now, opts?.mode || 'chat', JSON.stringify(opts?.participants || []))
  return { id, title, createdAt: now, updatedAt: now, mode: opts?.mode || 'chat', statusLevel: 'idle', statusText: '', participants: opts?.participants || [] }
}

export function getSession(wsPath: string, id: string): SessionRow | null {
  const db = getDb(wsPath)
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mode: row.mode || 'chat',
    statusLevel: row.status_level || 'idle',
    statusText: row.status_text || '',
    participants: parseJson(row.participants, []),
  }
}

export function listSessions(wsPath: string): SessionRow[] {
  const db = getDb(wsPath)
  const rows = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all() as any[]
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessage: row.last_message || '',
    mode: row.mode || 'chat',
    statusLevel: row.status_level || 'idle',
    statusText: row.status_text || '',
    participants: parseJson(row.participants, []),
  }))
}

export function touchSession(wsPath: string, id: string, lastMessage?: string): void {
  if (lastMessage !== undefined) {
    getDb(wsPath).prepare('UPDATE sessions SET updated_at = ?, last_message = ? WHERE id = ?').run(Date.now(), lastMessage, id)
  } else {
    getDb(wsPath).prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), id)
  }
}

export function renameSession(wsPath: string, id: string, title: string): void {
  getDb(wsPath).prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), id)
}

export function deleteSession(wsPath: string, id: string): void {
  // CASCADE deletes messages too
  getDb(wsPath).prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

// ── Messages ──

export function saveMessage(wsPath: string, msg: MessageRow): void {
  getDb(wsPath).prepare(`
    INSERT OR REPLACE INTO messages (id, session_id, role, content, timestamp, status, tool_calls, error, agent_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    msg.id,
    msg.sessionId,
    msg.role,
    msg.content,
    msg.timestamp,
    msg.status || 'complete',
    msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
    msg.error || null,
    msg.agentId || null,
    msg.metadata ? JSON.stringify(msg.metadata) : null,
  )
}

export function loadMessages(wsPath: string, sessionId: string): MessageRow[] {
  const rows = getDb(wsPath).prepare(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC'
  ).all(sessionId) as any[]
  return rows.map(row => ({
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    timestamp: row.timestamp,
    status: row.status,
    toolCalls: parseJson(row.tool_calls, undefined),
    error: row.error || undefined,
    agentId: row.agent_id || undefined,
    metadata: parseJson(row.metadata, undefined),
  }))
}

export function clearMessages(wsPath: string, sessionId: string): void {
  getDb(wsPath).prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
}

// ── Lifecycle ──

export function closeAll(): void {
  for (const db of dbCache.values()) {
    try { db.close() } catch {}
  }
  dbCache.clear()
}

// ── Helpers ──

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) } catch { return fallback }
}
