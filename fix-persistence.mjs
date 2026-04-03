#!/usr/bin/env node
/**
 * Fix Watson SQLite Persistence (MOMO-51)
 * 
 * Manually run migrations and initialize missing tables.
 */

import { execSync } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'

const messagesDb = join(homedir(), '.watson', 'messages.db')
const sessionsDb = join(homedir(), '.watson', 'sessions.db')

function sql(db, query) {
  try {
    const result = execSync(`sqlite3 "${db}" "${query}"`, { encoding: 'utf8' })
    return { success: true, output: result.trim() }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

console.log('🔧 Fixing Watson SQLite Persistence\n')
console.log('='.repeat(60))

// Fix 1: Add missing columns to messages table
console.log('\n📝 Fix 1: Add missing columns to messages table')
console.log('-'.repeat(60))

const migrations = [
  { col: 'agent_id', sql: 'ALTER TABLE messages ADD COLUMN agent_id TEXT' },
  { col: 'timestamp', sql: 'ALTER TABLE messages ADD COLUMN timestamp INTEGER' },
  { col: 'metadata', sql: 'ALTER TABLE messages ADD COLUMN metadata TEXT' }
]

migrations.forEach(({ col, sql: query }) => {
  const result = sql(messagesDb, query)
  if (result.success) {
    console.log(`✅ Added column: ${col}`)
  } else if (result.error.includes('duplicate column')) {
    console.log(`⏭️  Column already exists: ${col}`)
  } else {
    console.log(`❌ Failed to add ${col}: ${result.error}`)
  }
})

// Fix 2: Add index
console.log('\n📊 Fix 2: Add performance index')
console.log('-'.repeat(60))

const indexResult = sql(messagesDb, 
  'CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at)'
)
if (indexResult.success) {
  console.log('✅ Created idx_messages_session')
} else {
  console.log(`❌ Failed to create index: ${indexResult.error}`)
}

// Fix 3: Initialize sessions table
console.log('\n🗄️  Fix 3: Initialize sessions table')
console.log('-'.repeat(60))

const sessionsSchema = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  mode TEXT DEFAULT 'chat',
  status_level TEXT DEFAULT 'idle',
  status_text TEXT DEFAULT '',
  participants TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS session_agents (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_agents_session ON session_agents(session_id);
`

const sessionsResult = sql(sessionsDb, sessionsSchema)
if (sessionsResult.success) {
  console.log('✅ Created sessions table')
  console.log('✅ Created session_agents table')
  console.log('✅ Created idx_session_agents_session')
} else {
  console.log(`❌ Failed to create sessions tables: ${sessionsResult.error}`)
}

// Fix 4: Enable WAL mode for better concurrency
console.log('\n⚡ Fix 4: Enable WAL mode')
console.log('-'.repeat(60))

const walMessages = sql(messagesDb, 'PRAGMA journal_mode = WAL')
const walSessions = sql(sessionsDb, 'PRAGMA journal_mode = WAL')

console.log(`messages.db: ${walMessages.success ? '✅ WAL enabled' : '❌ Failed'}`)
console.log(`sessions.db: ${walSessions.success ? '✅ WAL enabled' : '❌ Failed'}`)

// Verify fixes
console.log('\n✅ Verification')
console.log('-'.repeat(60))

const messagesCols = sql(messagesDb, 'PRAGMA table_info(messages)')
const sessionsTable = sql(sessionsDb, '.tables')

const hasAgentId = messagesCols.output.includes('agent_id')
const hasTimestamp = messagesCols.output.includes('timestamp')
const hasMetadata = messagesCols.output.includes('metadata')
const hasSessions = sessionsTable.output.includes('sessions')

console.log(`messages.agent_id: ${hasAgentId ? '✅' : '❌'}`)
console.log(`messages.timestamp: ${hasTimestamp ? '✅' : '❌'}`)
console.log(`messages.metadata: ${hasMetadata ? '✅' : '❌'}`)
console.log(`sessions table: ${hasSessions ? '✅' : '❌'}`)

console.log('\n' + '='.repeat(60))
if (hasAgentId && hasTimestamp && hasMetadata && hasSessions) {
  console.log('✅ All fixes applied successfully!')
  console.log('\n💡 Next: Run test-persistence.mjs to verify')
} else {
  console.log('❌ Some fixes failed. Check errors above.')
}
