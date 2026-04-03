// memory-index.ts — FTS5 + Vector hybrid search for Watson
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import Database from 'better-sqlite3'

let db: Database.Database | null = null
let dbPath: string | null = null
let embeddingProvider: EmbeddingProvider | null = null

interface EmbeddingProvider {
  id: string
  dims: number
  embed: (text: string) => Promise<number[]>
  embedBatch: (texts: string[]) => Promise<number[][]>
}

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
      model TEXT,
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

// ── Embedding Provider ──
export async function initEmbeddingProvider(config?: { apiKey?: string; baseUrl?: string }): Promise<void> {
  // Fallback to OpenAI-compatible API
  if (config?.apiKey) {
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1'
    const model = 'text-embedding-3-small'
    embeddingProvider = {
      id: 'openai',
      dims: 1536,
      embed: async (text: string) => {
        const res = await fetch(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, input: text }),
          signal: AbortSignal.timeout(10000),
        })
        const data = await res.json()
        return data.data?.[0]?.embedding || []
      },
      embedBatch: async (texts: string[]) => {
        const res = await fetch(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, input: texts }),
          signal: AbortSignal.timeout(30000),
        })
        const data = await res.json()
        return (data.data || []).sort((a: any, b: any) => a.index - b.index).map((d: any) => d.embedding)
      }
    }
    console.log('[memory-index] OpenAI embedding provider ready')
  } else {
    console.warn('[memory-index] No embedding provider configured, using FTS5 only')
  }
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
export async function indexFile(workspaceDir: string, relPath: string): Promise<void> {
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
  const insertChunk = db.prepare('INSERT INTO chunks (file_path, start_line, end_line, text, embedding, model) VALUES (?, ?, ?, ?, ?, ?)')

  for (const chunk of chunks) {
    let embedding: Buffer | null = null
    let model: string | null = null
    
    if (embeddingProvider && chunk.text.trim()) {
      try {
        const vec = await embeddingProvider.embed(chunk.text)
        embedding = Buffer.from(new Float32Array(vec).buffer)
        model = embeddingProvider.id
      } catch (e) {
        console.warn(`[memory-index] Embedding failed for ${relPath}:${chunk.startLine}:`, (e as Error).message)
      }
    }
    
    insertChunk.run(relPath, chunk.startLine, chunk.endLine, chunk.text, embedding, model)
  }

  // Rebuild FTS
  try {
    const rows = db.prepare('SELECT id, text FROM chunks WHERE file_path = ?').all(relPath) as Array<{ id: number, text: string }>
    for (const row of rows) {
      db.prepare('INSERT INTO chunks_fts(rowid, text) VALUES (?, ?)').run(row.id, row.text)
    }
  } catch {}

  // Insert into vector table
  if (embeddingProvider) {
    try {
      const rows = db.prepare('SELECT id, embedding FROM chunks WHERE file_path = ? AND embedding IS NOT NULL').all(relPath) as Array<{ id: number, embedding: Buffer }>
      for (const row of rows) {
        db.prepare('INSERT INTO chunks_vec(embedding, chunk_id) VALUES (?, ?)').run(row.embedding, row.id)
      }
    } catch {}
  }
}

export async function buildIndex(workspaceDir: string, config?: { apiKey?: string; baseUrl?: string }): Promise<number> {
  await initEmbeddingProvider(config)
  const files = collectMemoryFiles(workspaceDir)
  for (const file of files) {
    await indexFile(workspaceDir, file)
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

export async function search(workspaceDir: string, query: string, maxResults = 10): Promise<SearchResult[]> {
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

  // Vector search (if embedding available)
  if (embeddingProvider) {
    try {
      const qVec = await embeddingProvider.embed(query)
      const qBuf = Buffer.from(new Float32Array(qVec).buffer)
      const vecRows = db.prepare(`
        SELECT chunk_id, distance FROM chunks_vec
        WHERE embedding MATCH ? ORDER BY distance LIMIT ?
      `).all(qBuf, maxResults * 2) as Array<{ chunk_id: number; distance: number }>
      
      for (const vr of vecRows) {
        const chunk = db.prepare('SELECT file_path, start_line, end_line, text FROM chunks WHERE id = ?').get(vr.chunk_id) as {
          file_path: string
          start_line: number
          end_line: number
          text: string
        } | undefined
        
        if (!chunk) continue
        
        const cosineScore = 1 - vr.distance // distance → similarity
        const existing = results.get(vr.chunk_id)
        
        if (existing) {
          existing.score = existing.score + cosineScore * 2 // boost hybrid matches
          existing.source = 'hybrid'
        } else {
          results.set(vr.chunk_id, {
            path: chunk.file_path,
            startLine: chunk.start_line,
            endLine: chunk.end_line,
            score: cosineScore,
            snippet: chunk.text.slice(0, 200),
            source: 'vector'
          })
        }
      }
    } catch (e) {
      console.warn('[memory-index] Vector search error:', (e as Error).message)
    }
  }

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
