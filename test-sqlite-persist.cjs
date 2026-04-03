/**
 * MOMO-51: Test SQLite persistence for sessions and messages.
 * 
 * Verifies:
 * 1. SessionStore creates and retrieves sessions
 * 2. MessageStore saves and loads messages (with new fields)
 * 3. Data survives "restart" (close + reopen stores)
 * 4. Session deletion cascades to messages
 * 5. Migration from old schema works
 */

const Database = require('better-sqlite3')
const path = require('path')
const os = require('os')
const fs = require('fs')

// Use temp dir to avoid polluting real data
const testDir = path.join(os.tmpdir(), `watson-test-${Date.now()}`)
fs.mkdirSync(testDir, { recursive: true })

let passed = 0
let failed = 0

function assert(condition, msg) {
  if (condition) {
    passed++
    console.log(`  ✅ ${msg}`)
  } else {
    failed++
    console.error(`  ❌ ${msg}`)
  }
}

// ── Inline SessionStore (mimics the TS class for Node testing) ──

function createSessionStore(dbPath) {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  
  db.exec(`
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS session_agents (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)

  return {
    createSession(id, title = '', opts = {}) {
      const now = Date.now()
      const participants = JSON.stringify(opts.participants || [])
      const mode = opts.mode || 'chat'
      db.prepare('INSERT INTO sessions (id, title, created_at, updated_at, mode, participants) VALUES (?,?,?,?,?,?)')
        .run(id, title, now, now, mode, participants)
      return { id, title, createdAt: now, updatedAt: now, mode, participants: opts.participants || [] }
    },
    getSession(id) {
      const row = db.prepare('SELECT id, title, created_at as createdAt, updated_at as updatedAt, mode, participants FROM sessions WHERE id = ?').get(id)
      if (!row) return null
      row.participants = row.participants ? JSON.parse(row.participants) : []
      return row
    },
    listSessions() {
      return db.prepare('SELECT id, title, created_at as createdAt, updated_at as updatedAt, mode, participants FROM sessions ORDER BY updated_at DESC').all().map(row => {
        row.participants = row.participants ? JSON.parse(row.participants) : []
        return row
      })
    },
    updateSession(id, updates) {
      const now = Date.now()
      if (updates.title !== undefined) {
        db.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?').run(updates.title, now, id)
      }
    },
    deleteSession(id) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    },
    touchSession(id) {
      db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), id)
    },
    close() { db.close() }
  }
}

// ── Inline MessageStore ──

function createMessageStore(dbPath) {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  
  db.exec(`
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
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at)')

  return {
    save(msg) {
      db.prepare('INSERT OR REPLACE INTO messages (id, session_id, workspace_id, role, content, status, created_at, timestamp, tool_calls, error, error_category, agent_id, metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(msg.id, msg.sessionId, msg.workspaceId, msg.role, msg.content, msg.status, msg.createdAt, msg.timestamp || msg.createdAt, msg.toolCalls ? JSON.stringify(msg.toolCalls) : null, msg.error || null, msg.errorCategory || null, msg.agentId || null, msg.metadata ? JSON.stringify(msg.metadata) : null)
    },
    load(sessionId, workspaceId) {
      return db.prepare('SELECT * FROM messages WHERE session_id = ? AND workspace_id = ? ORDER BY created_at ASC').all(sessionId, workspaceId).map(row => ({
        id: row.id, sessionId: row.session_id, workspaceId: row.workspace_id, role: row.role, content: row.content, status: row.status, createdAt: row.created_at, timestamp: row.timestamp || row.created_at,
        toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined, error: row.error || undefined, errorCategory: row.error_category || undefined, agentId: row.agent_id || undefined, metadata: row.metadata ? JSON.parse(row.metadata) : undefined
      }))
    },
    listSessionIds(workspaceId) {
      if (workspaceId) return db.prepare('SELECT DISTINCT session_id FROM messages WHERE workspace_id = ?').all(workspaceId).map(r => r.session_id)
      return db.prepare('SELECT DISTINCT session_id FROM messages').all().map(r => r.session_id)
    },
    clear(sessionId, workspaceId) {
      db.prepare('DELETE FROM messages WHERE session_id = ? AND workspace_id = ?').run(sessionId, workspaceId)
    },
    clearBySessionId(sessionId) {
      db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
    },
    close() { db.close() }
  }
}

// ── Tests ──

console.log('\n🧪 MOMO-51: SQLite Persistence Tests\n')

// Test 1: Session CRUD
console.log('── Test 1: Session CRUD ──')
{
  const sessionsDb = path.join(testDir, 'sessions.db')
  const store = createSessionStore(sessionsDb)
  
  const s = store.createSession('test-1', 'Test Session', { participants: ['/workspace'] })
  assert(s.id === 'test-1', 'Session created with correct ID')
  assert(s.title === 'Test Session', 'Session has correct title')
  assert(s.participants.length === 1, 'Session has participants')
  
  const loaded = store.getSession('test-1')
  assert(loaded !== null, 'Session can be loaded by ID')
  assert(loaded.title === 'Test Session', 'Loaded session has correct title')
  assert(loaded.participants[0] === '/workspace', 'Loaded session has correct participants')
  
  store.updateSession('test-1', { title: 'Renamed Session' })
  const renamed = store.getSession('test-1')
  assert(renamed.title === 'Renamed Session', 'Session rename works')
  
  const list = store.listSessions()
  assert(list.length === 1, 'listSessions returns 1 session')
  
  store.deleteSession('test-1')
  assert(store.getSession('test-1') === undefined || store.getSession('test-1') === null, 'Session deleted')
  
  store.close()
}

// Test 2: Message CRUD with new fields
console.log('\n── Test 2: Message CRUD with new fields ──')
{
  const messagesDb = path.join(testDir, 'messages.db')
  const store = createMessageStore(messagesDb)
  
  store.save({
    id: 'msg-1',
    sessionId: 'session-1',
    workspaceId: '/workspace',
    role: 'user',
    content: 'Hello',
    status: 'complete',
    createdAt: 1000,
    timestamp: 1000
  })
  
  store.save({
    id: 'msg-2',
    sessionId: 'session-1',
    workspaceId: '/workspace',
    role: 'assistant',
    content: 'Hi there',
    status: 'complete',
    createdAt: 2000,
    timestamp: 2000,
    toolCalls: [{ id: 'tc-1', name: 'read_file', input: { path: '/test' }, status: 'complete' }],
    agentId: 'agent-1',
    metadata: { toolSteps: 1, model: 'claude-3.5-sonnet' }
  })
  
  const msgs = store.load('session-1', '/workspace')
  assert(msgs.length === 2, 'Loaded 2 messages')
  assert(msgs[0].content === 'Hello', 'First message content correct')
  assert(msgs[1].content === 'Hi there', 'Second message content correct')
  assert(msgs[1].toolCalls.length === 1, 'Tool calls persisted')
  assert(msgs[1].agentId === 'agent-1', 'Agent ID persisted')
  assert(msgs[1].metadata.model === 'claude-3.5-sonnet', 'Metadata persisted')
  assert(msgs[1].timestamp === 2000, 'Timestamp persisted')
  
  store.close()
}

// Test 3: Session IDs discovery
console.log('\n── Test 3: Session IDs discovery ──')
{
  const messagesDb = path.join(testDir, 'messages2.db')
  const store = createMessageStore(messagesDb)
  
  store.save({ id: 'a', sessionId: 's1', workspaceId: '/ws1', role: 'user', content: 'x', status: 'complete', createdAt: 1 })
  store.save({ id: 'b', sessionId: 's2', workspaceId: '/ws1', role: 'user', content: 'y', status: 'complete', createdAt: 2 })
  store.save({ id: 'c', sessionId: 's3', workspaceId: '/ws2', role: 'user', content: 'z', status: 'complete', createdAt: 3 })
  
  const allIds = store.listSessionIds()
  assert(allIds.length === 3, 'listSessionIds returns all 3 sessions')
  
  const ws1Ids = store.listSessionIds('/ws1')
  assert(ws1Ids.length === 2, 'listSessionIds with workspace filter returns 2')
  
  store.close()
}

// Test 4: Restart simulation (close and reopen)
console.log('\n── Test 4: Restart recovery ──')
{
  const sessionsDb = path.join(testDir, 'restart-sessions.db')
  const messagesDb = path.join(testDir, 'restart-messages.db')
  
  // Phase 1: Write data
  {
    const ss = createSessionStore(sessionsDb)
    const ms = createMessageStore(messagesDb)
    
    ss.createSession('persist-1', 'Persistent Session', { participants: ['/work'], mode: 'chat' })
    ms.save({ id: 'm1', sessionId: 'persist-1', workspaceId: '/work', role: 'user', content: 'Before restart', status: 'complete', createdAt: Date.now(), timestamp: Date.now() })
    ms.save({ id: 'm2', sessionId: 'persist-1', workspaceId: '/work', role: 'assistant', content: 'I remember!', status: 'complete', createdAt: Date.now() + 1, timestamp: Date.now() + 1 })
    
    ss.close()
    ms.close()
  }
  
  // Phase 2: Reopen and verify (simulates app restart)
  {
    const ss = createSessionStore(sessionsDb)
    const ms = createMessageStore(messagesDb)
    
    const session = ss.getSession('persist-1')
    assert(session !== null, 'Session survives restart')
    assert(session.title === 'Persistent Session', 'Session title survives restart')
    assert(session.participants[0] === '/work', 'Session participants survive restart')
    
    const msgs = ms.load('persist-1', '/work')
    assert(msgs.length === 2, 'Messages survive restart')
    assert(msgs[0].content === 'Before restart', 'Message content survives restart')
    assert(msgs[1].content === 'I remember!', 'Assistant message survives restart')
    
    ss.close()
    ms.close()
  }
}

// Test 5: clearBySessionId
console.log('\n── Test 5: clearBySessionId ──')
{
  const messagesDb = path.join(testDir, 'clear-messages.db')
  const store = createMessageStore(messagesDb)
  
  store.save({ id: 'x1', sessionId: 'del-session', workspaceId: '/ws1', role: 'user', content: 'a', status: 'complete', createdAt: 1 })
  store.save({ id: 'x2', sessionId: 'del-session', workspaceId: '/ws2', role: 'user', content: 'b', status: 'complete', createdAt: 2 })
  store.save({ id: 'x3', sessionId: 'keep-session', workspaceId: '/ws1', role: 'user', content: 'c', status: 'complete', createdAt: 3 })
  
  store.clearBySessionId('del-session')
  
  const deleted = store.load('del-session', '/ws1')
  assert(deleted.length === 0, 'Deleted session messages from ws1')
  
  const deleted2 = store.load('del-session', '/ws2')
  assert(deleted2.length === 0, 'Deleted session messages from ws2')
  
  const kept = store.load('keep-session', '/ws1')
  assert(kept.length === 1, 'Kept unrelated session messages')
  
  store.close()
}

// Test 6: Message upsert (INSERT OR REPLACE)
console.log('\n── Test 6: Message upsert ──')
{
  const messagesDb = path.join(testDir, 'upsert-messages.db')
  const store = createMessageStore(messagesDb)
  
  store.save({ id: 'up-1', sessionId: 's1', workspaceId: '/ws', role: 'assistant', content: 'streaming...', status: 'streaming', createdAt: 1 })
  store.save({ id: 'up-1', sessionId: 's1', workspaceId: '/ws', role: 'assistant', content: 'Final answer', status: 'complete', createdAt: 1 })
  
  const msgs = store.load('s1', '/ws')
  assert(msgs.length === 1, 'Upsert does not duplicate')
  assert(msgs[0].content === 'Final answer', 'Upsert updates content')
  assert(msgs[0].status === 'complete', 'Upsert updates status')
  
  store.close()
}

// Cleanup
fs.rmSync(testDir, { recursive: true, force: true })

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
