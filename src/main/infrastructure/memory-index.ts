// memory-index.ts — FTS5 + Vector hybrid search for Watson
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import Database from 'better-sqlite3'

let db: Database.Database | null = null
let dbPath: string | null = null

// ── DB Init ──
export function getDb(workspaceDir: string): Database.Database {
  const newDbPath = path.join(workspaceDir, '.watson', 'memory-index.db')
  
  if (db && dbPath === newDbPath) return db
  
  if (db) {
    try { db.close() } catch {}
  }
  
  fs.mkdirSync(path.dirname(newDbPath), { recursive: true })
  db = new Database(newDbPath)
  db.pragma('journal_mode = WAL')
  dbPath = newDbPath

  // Load sqlite-vec
  try {
    const sqliteVec = require('sqlite-vec')
    sqliteVec.load(db)
  } catch (e) {
    console.warn('[memory-index] sqlite-vec not available:', (e as Error).message)
  }

  initTables(db)
  return db
}

function initTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL
    )
  `)
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      text TEXT NOT NULL,
      embedding BLOB,
      FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE
    )
  `)
  
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_path)`)

  // FTS5
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, content=chunks, content_rowid=id)`)
  } catch (e) {
    console.warn('[memory-index] FTS5 init error:', (e as Error).message)
  }

  // Vector table
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(embedding float[384], chunk_id integer)`)
  } catch (e) {
    console.warn('[memory-index] vec0 table not created:', (e as Error).message)
  }
}

// ── File scanning ──
export function collectMemoryFiles(workspaceDir: string): string[] {
  const files: string[] = []
  const memoryMd = path.join(workspaceDir, 'MEMORY.md')
  if (fs.existsSync(memoryMd)) files.push('MEMORY.md')
  
  const memDir = path.join(workspaceDir, 'memory')
  if (fs.existsSync(memDir)) {
    const walk = (dir: string, prefix: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), prefix + entry.name + '/')
        } else if (entry.name.endsWith('.md')) {
          files.push(prefix + entry.name)
        }
      }
    }
    walk(memDir, 'memory/')
  }
  return files
}

function fileHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
}

// ── Chunking ──
const CHUNK_SIZE = 20
interface Chunk {
  startLine: number
  endLine: number
  text: string
}

function chunkText(text: string): Chunk[] {
  const lines = text.split('\n')
  const chunks: Chunk[] = []
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, lines.length)
    chunks.push({
      startLine: i + 1,
      endLine: end,
      text: lines.slice(i, end).join('\n')
    })
  }
  return chunks
}

// ── Indexing ──
export function indexFile(workspaceDir: string, relPath: string): void {
  const db = getDb(workspaceDir)
  const absPath = path.join(workspaceDir, relPath)
  
  if (!fs.existsSync(absPath)) {
    db.prepare('DELETE FROM files WHERE path = ?').run(relPath)
    db.prepare('DELETE FROM chunks WHERE file_path = ?').run(relPath)
    return
  }
  
  const content = fs.readFileSync(absPath, 'utf8')
  const hash = fileHash(content)
  const stat = fs.statSync(absPath)

  const existing = db.prepare('SELECT hash FROM files WHERE path = ?').get(relPath) as { hash: string } | undefined
  if (existing?.hash === hash) return

  db.prepare('DELETE FROM chunks WHERE file_path = ?').run(relPath)
  db.prepare('INSERT OR REPLACE INTO files (path, hash, mtime, size) VALUES (?, ?, ?, ?)').run(relPath, hash, stat.mtimeMs, stat.size)

  const chunks = chunkText(content)
  const insertChunk = db.prepare('INSERT INTO chunks (file_path, start_line, end_line, text, embedding) VALUES (?, ?, ?, ?, ?)')

  for (const chunk of chunks) {
    insertChunk.run(relPath, chunk.startLine, chunk.endLine, chunk.text, null)
  }

  // Rebuild FTS
  try {
    const rows = db.prepare('SELECT id, text FROM chunks WHERE file_path = ?').all(relPath) as Array<{ id: number, text: string }>
    for (const row of rows) {
      db.prepare('INSERT INTO chunks_fts(rowid, text) VALUES (?, ?)').run(row.id, row.text)
    }
  } catch {}
}

export function buildIndex(workspaceDir: string): number {
  const files = collectMemoryFiles(workspaceDir)
  for (const file of files) {
    indexFile(workspaceDir, file)
  }
  return files.length
}

// ── Search ──
export interface SearchResult {
  path: string
  startLine: number
  endLine: number
  score: number
  snippet: string
  source: 'fts' | 'vector' | 'hybrid'
}

export function search(workspaceDir: string, query: string, maxResults = 10): SearchResult[] {
  const db = getDb(workspaceDir)
  const results = new Map<number, SearchResult>()

  // FTS5 search
  try {
    const ftsQuery = query.split(/\s+/).filter(Boolean).map(w => `"${w}"`).join(' OR ')
    const ftsRows = db.prepare(`
      SELECT c.id, c.file_path, c.start_line, c.end_line, c.text, rank AS score
      FROM chunks_fts f JOIN chunks c ON c.id = f.rowid
      WHERE chunks_fts MATCH ?
      ORDER BY rank LIMIT ?
    `).all(ftsQuery, maxResults * 2) as Array<{
      id: number
      file_path: string
      start_line: number
      end_line: number
      text: string
      score: number
    }>
    
    for (const r of ftsRows) {
      results.set(r.id, {
        path: r.file_path,
        startLine: r.start_line,
        endLine: r.end_line,
        score: Math.abs(r.score),
        snippet: r.text.slice(0, 200),
        source: 'fts'
      })
    }
  } catch {}

  return [...results.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
}

export function closeDb(): void {
  if (db) {
    try { db.close() } catch {}
    db = null
    dbPath = null
  }
}
