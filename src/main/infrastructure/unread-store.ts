/**
 * UnreadStore — In-memory unread message count tracker
 *
 * MOMO-56: Tracks unread counts per session.
 * Persisted to SQLite so counts survive restart.
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync } from 'fs'

export class UnreadStore {
  private db: Database.Database
  private counts: Map<string, number> = new Map()

  constructor() {
    const configDir = join(homedir(), '.watson')
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }

    this.db = new Database(join(configDir, 'sessions.db'))
    this.db.pragma('journal_mode = WAL')
    this.init()
  }

  private init() {
    // Add unread_count column to sessions table if it doesn't exist
    try {
      this.db.exec(`ALTER TABLE sessions ADD COLUMN unread_count INTEGER DEFAULT 0`)
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) {
        console.warn('[unread-store] migration warning:', e.message)
      }
    }

    // Load existing counts into memory
    try {
      const rows = this.db.prepare(
        'SELECT id, unread_count FROM sessions WHERE unread_count > 0'
      ).all() as any[]
      for (const row of rows) {
        this.counts.set(row.id, row.unread_count || 0)
      }
    } catch {
      // Table might not exist yet on first run — that's fine
    }
  }

  /**
   * Increment unread count for a session.
   * Returns the new count.
   */
  increment(sessionId: string): number {
    const current = this.counts.get(sessionId) || 0
    const next = current + 1
    this.counts.set(sessionId, next)
    this.persist(sessionId, next)
    return next
  }

  /**
   * Clear unread count for a session (user opened it).
   */
  clear(sessionId: string): void {
    if (this.counts.has(sessionId)) {
      this.counts.delete(sessionId)
      this.persist(sessionId, 0)
    }
  }

  /**
   * Get unread count for a specific session.
   */
  get(sessionId: string): number {
    return this.counts.get(sessionId) || 0
  }

  /**
   * Get all unread counts as a map { sessionId: count }.
   */
  getAll(): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [id, count] of this.counts) {
      if (count > 0) {
        result[id] = count
      }
    }
    return result
  }

  /**
   * Get total unread count across all sessions.
   */
  getTotal(): number {
    let total = 0
    for (const count of this.counts.values()) {
      total += count
    }
    return total
  }

  private persist(sessionId: string, count: number) {
    try {
      this.db.prepare(
        'UPDATE sessions SET unread_count = ? WHERE id = ?'
      ).run(count, sessionId)
    } catch (e: any) {
      console.warn('[unread-store] persist failed:', e.message)
    }
  }

  close() {
    this.db.close()
  }
}
