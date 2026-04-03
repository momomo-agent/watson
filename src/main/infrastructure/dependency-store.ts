/**
 * DependencyStore — SQLite backend for skill dependency installation tracking
 * 
 * Tracks installation status, timestamps, versions, and error history for each dependency.
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync } from 'fs'

export interface DependencyRecord {
  id: string
  skillName: string
  kind: 'npm' | 'pip' | 'brew' | 'go' | 'uv'
  identifier: string // package name, formula, or module
  status: 'pending' | 'installing' | 'installed' | 'failed'
  version?: string
  installedAt?: number
  lastAttemptAt?: number
  attemptCount: number
  lastError?: string
  bins?: string[] // Expected binary names
}

export class DependencyStore {
  private db: Database.Database

  constructor() {
    const configDir = join(homedir(), '.watson')
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
    
    this.db = new Database(join(configDir, 'dependencies.db'))
    this.db.pragma('journal_mode = WAL')
    this.init()
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dependencies (
        id TEXT PRIMARY KEY,
        skill_name TEXT NOT NULL,
        kind TEXT NOT NULL,
        identifier TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        version TEXT,
        installed_at INTEGER,
        last_attempt_at INTEGER,
        attempt_count INTEGER DEFAULT 0,
        last_error TEXT,
        bins TEXT,
        UNIQUE(skill_name, kind, identifier)
      )
    `)

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_dependencies_skill ON dependencies(skill_name)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_dependencies_status ON dependencies(status)`)
  }

  // ── CRUD Operations ──

  upsertDependency(record: Omit<DependencyRecord, 'id'>): DependencyRecord {
    const id = this._generateId(record.skillName, record.kind, record.identifier)
    const existing = this.getDependency(id)
    
    if (existing) {
      this.updateDependency(id, record)
      return { id, ...record }
    }
    
    this.db.prepare(`
      INSERT INTO dependencies (
        id, skill_name, kind, identifier, status, version, 
        installed_at, last_attempt_at, attempt_count, last_error, bins
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      record.skillName,
      record.kind,
      record.identifier,
      record.status,
      record.version || null,
      record.installedAt || null,
      record.lastAttemptAt || null,
      record.attemptCount,
      record.lastError || null,
      record.bins ? JSON.stringify(record.bins) : null
    )
    
    return { id, ...record }
  }

  getDependency(id: string): DependencyRecord | null {
    const row = this.db.prepare(`
      SELECT id, skill_name as skillName, kind, identifier, status, version,
             installed_at as installedAt, last_attempt_at as lastAttemptAt,
             attempt_count as attemptCount, last_error as lastError, bins
      FROM dependencies WHERE id = ?
    `).get(id) as any
    
    if (!row) return null
    
    return {
      ...row,
      bins: row.bins ? JSON.parse(row.bins) : undefined
    }
  }

  listDependencies(skillName?: string): DependencyRecord[] {
    const query = skillName
      ? 'SELECT * FROM dependencies WHERE skill_name = ? ORDER BY last_attempt_at DESC'
      : 'SELECT * FROM dependencies ORDER BY last_attempt_at DESC'
    
    const stmt = skillName ? this.db.prepare(query).bind(skillName) : this.db.prepare(query)
    const rows = stmt.all() as any[]
    
    return rows.map(row => ({
      id: row.id,
      skillName: row.skill_name,
      kind: row.kind,
      identifier: row.identifier,
      status: row.status,
      version: row.version,
      installedAt: row.installed_at,
      lastAttemptAt: row.last_attempt_at,
      attemptCount: row.attempt_count,
      lastError: row.last_error,
      bins: row.bins ? JSON.parse(row.bins) : undefined
    }))
  }

  updateDependency(id: string, updates: Partial<DependencyRecord>) {
    const fields: string[] = []
    const values: any[] = []
    
    if (updates.status !== undefined) {
      fields.push('status = ?')
      values.push(updates.status)
    }
    
    if (updates.version !== undefined) {
      fields.push('version = ?')
      values.push(updates.version)
    }
    
    if (updates.installedAt !== undefined) {
      fields.push('installed_at = ?')
      values.push(updates.installedAt)
    }
    
    if (updates.lastAttemptAt !== undefined) {
      fields.push('last_attempt_at = ?')
      values.push(updates.lastAttemptAt)
    }
    
    if (updates.attemptCount !== undefined) {
      fields.push('attempt_count = ?')
      values.push(updates.attemptCount)
    }
    
    if (updates.lastError !== undefined) {
      fields.push('last_error = ?')
      values.push(updates.lastError)
    }
    
    if (updates.bins !== undefined) {
      fields.push('bins = ?')
      values.push(JSON.stringify(updates.bins))
    }
    
    if (fields.length === 0) return
    
    values.push(id)
    this.db.prepare(`UPDATE dependencies SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  deleteDependency(id: string) {
    this.db.prepare('DELETE FROM dependencies WHERE id = ?').run(id)
  }

  deleteSkillDependencies(skillName: string) {
    this.db.prepare('DELETE FROM dependencies WHERE skill_name = ?').run(skillName)
  }

  // ── Status Queries ──

  isInstalled(skillName: string, kind: string, identifier: string): boolean {
    const id = this._generateId(skillName, kind, identifier)
    const record = this.getDependency(id)
    return record?.status === 'installed'
  }

  getFailedDependencies(skillName?: string): DependencyRecord[] {
    const query = skillName
      ? "SELECT * FROM dependencies WHERE skill_name = ? AND status = 'failed'"
      : "SELECT * FROM dependencies WHERE status = 'failed'"
    
    const stmt = skillName ? this.db.prepare(query).bind(skillName) : this.db.prepare(query)
    const rows = stmt.all() as any[]
    
    return rows.map(row => ({
      id: row.id,
      skillName: row.skill_name,
      kind: row.kind,
      identifier: row.identifier,
      status: row.status,
      version: row.version,
      installedAt: row.installed_at,
      lastAttemptAt: row.last_attempt_at,
      attemptCount: row.attempt_count,
      lastError: row.last_error,
      bins: row.bins ? JSON.parse(row.bins) : undefined
    }))
  }

  // ── Helpers ──

  private _generateId(skillName: string, kind: string, identifier: string): string {
    return `${skillName}:${kind}:${identifier}`
  }

  close() {
    this.db.close()
  }
}
