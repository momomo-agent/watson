#!/usr/bin/env node
/**
 * Test Watson SQLite Persistence (MOMO-51)
 * 
 * Minimal test without better-sqlite3 version issues.
 * Uses sqlite3 CLI for verification.
 */

import { execSync } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'

const messagesDb = join(homedir(), '.watson', 'messages.db')
const sessionsDb = join(homedir(), '.watson', 'sessions.db')

function sql(db, query) {
  try {
    return execSync(`sqlite3 "${db}" "${query}"`, { encoding: 'utf8' }).trim()
  } catch (e) {
    return `ERROR: ${e.message}`
  }
}

console.log('🧪 Watson SQLite Persistence Test (MOMO-51)\n')
console.log('=' .repeat(60))

// Test 1: Check database files exist
console.log('\n📁 Test 1: Database Files')
console.log('-'.repeat(60))
console.log(`messages.db: ${messagesDb}`)
console.log(`sessions.db: ${sessionsDb}`)

const messagesExists = sql(messagesDb, 'SELECT 1')
const sessionsExists = sql(sessionsDb, 'SELECT 1')

console.log(`messages.db accessible: ${!messagesExists.includes('ERROR') ? '✅' : '❌'}`)
console.log(`sessions.db accessible: ${!sessionsExists.includes('ERROR') ? '✅' : '❌'}`)

// Test 2: Check table schemas
console.log('\n📋 Test 2: Table Schemas')
console.log('-'.repeat(60))

const messagesTables = sql(messagesDb, '.tables')
const sessionsTables = sql(sessionsDb, '.tables')

console.log(`messages.db tables: ${messagesTables || '(none)'}`)
console.log(`sessions.db tables: ${sessionsTables || '(none)'}`)

if (messagesTables.includes('messages')) {
  console.log('\n✅ messages table exists')
  const schema = sql(messagesDb, '.schema messages')
  console.log('Schema preview:', schema.substring(0, 200) + '...')
} else {
  console.log('\n❌ messages table missing')
}

if (sessionsTables.includes('sessions')) {
  console.log('\n✅ sessions table exists')
} else {
  console.log('\n❌ sessions table missing - SessionStore.init() not called')
}

// Test 3: Check required columns
console.log('\n🔍 Test 3: Column Verification')
console.log('-'.repeat(60))

const messagesSchema = sql(messagesDb, 'PRAGMA table_info(messages)')
const requiredCols = ['id', 'session_id', 'workspace_id', 'role', 'content', 'status', 'created_at', 'agent_id', 'timestamp', 'metadata']

console.log('messages table columns:')
console.log(messagesSchema)

requiredCols.forEach(col => {
  const has = messagesSchema.includes(col)
  console.log(`  ${has ? '✅' : '❌'} ${col}`)
})

// Test 4: Check indexes
console.log('\n📊 Test 4: Indexes')
console.log('-'.repeat(60))

const indexes = sql(messagesDb, "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='messages'")
console.log(`messages indexes: ${indexes || '(none)'}`)

if (indexes.includes('idx_messages_session')) {
  console.log('✅ idx_messages_session exists')
} else {
  console.log('❌ idx_messages_session missing')
}

// Test 5: Insert test data
console.log('\n💾 Test 5: Data Persistence')
console.log('-'.repeat(60))

const testSessionId = 'test-' + Date.now()
const testMessageId = 'msg-' + Date.now()
const now = Date.now()

console.log(`Creating test session: ${testSessionId}`)

// Try to insert a test message
const insertResult = sql(messagesDb, 
  `INSERT INTO messages (id, session_id, workspace_id, role, content, status, created_at) 
   VALUES ('${testMessageId}', '${testSessionId}', 'test-workspace', 'user', 'Test message', 'complete', ${now}); 
   SELECT changes();`
)

if (insertResult === '1') {
  console.log('✅ Test message inserted')
  
  // Verify it can be read back
  const readBack = sql(messagesDb, `SELECT id, content FROM messages WHERE id='${testMessageId}'`)
  if (readBack.includes(testMessageId)) {
    console.log('✅ Test message retrieved')
  } else {
    console.log('❌ Failed to retrieve test message')
  }
  
  // Clean up
  sql(messagesDb, `DELETE FROM messages WHERE id='${testMessageId}'`)
  console.log('✅ Test message cleaned up')
} else {
  console.log('❌ Failed to insert test message:', insertResult)
}

// Summary
console.log('\n' + '='.repeat(60))
console.log('📊 Summary')
console.log('='.repeat(60))

const issues = []

if (!messagesTables.includes('messages')) issues.push('messages table missing')
if (!sessionsTables.includes('sessions')) issues.push('sessions table missing')
if (!messagesSchema.includes('agent_id')) issues.push('agent_id column missing')
if (!messagesSchema.includes('timestamp')) issues.push('timestamp column missing')
if (!messagesSchema.includes('metadata')) issues.push('metadata column missing')
if (!indexes.includes('idx_messages_session')) issues.push('idx_messages_session missing')

if (issues.length === 0) {
  console.log('✅ All checks passed')
} else {
  console.log(`❌ Found ${issues.length} issue(s):`)
  issues.forEach(issue => console.log(`   - ${issue}`))
}

console.log('\n💡 Next steps:')
if (!sessionsTables.includes('sessions')) {
  console.log('   - SessionStore needs to be initialized (run Watson app)')
}
if (issues.some(i => i.includes('column missing'))) {
  console.log('   - MessageStore migrations need to run')
}
console.log('   - Create actual sessions/messages in Watson to test persistence')
console.log('   - Restart Watson to verify data survives restart')
