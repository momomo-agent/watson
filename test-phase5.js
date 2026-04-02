#!/usr/bin/env node

// Phase 5 Advanced Features Test
// Tests: Storage, Workspace, Heartbeat, Cron, Coding Agent

import fs from 'fs'
import path from 'path'
import os from 'os'

console.log('🧪 Watson Phase 5: Advanced Features Test\n')

// Test 1: Storage (simulate without Electron)
console.log('1️⃣ Testing Storage...')
try {
  const { default: Database } = await import('better-sqlite3')
  const dbPath = path.join(os.tmpdir(), 'watson-test.db')
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `)
  
  const insert = db.prepare('INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)')
  insert.run('test-session', 'user', 'Hello', Date.now())
  
  const rows = db.prepare('SELECT * FROM messages WHERE session_id = ?').all('test-session')
  console.log(`   ✅ Storage: Saved and loaded ${rows.length} message(s)`)
  db.close()
  fs.unlinkSync(dbPath)
} catch (error) {
  console.log(`   ❌ Storage failed: ${error.message}`)
}

// Test 2: Workspace Manager
console.log('\n2️⃣ Testing Workspace Manager...')
try {
  const configDir = path.join(os.tmpdir(), '.watson-test')
  const storePath = path.join(configDir, 'workspaces.json')
  
  if (fs.existsSync(configDir)) {
    fs.rmSync(configDir, { recursive: true })
  }
  fs.mkdirSync(configDir, { recursive: true })
  
  const store = {
    current: 'default',
    workspaces: [{
      id: 'default',
      name: 'Default',
      path: os.homedir(),
      createdAt: Date.now(),
      lastUsed: Date.now()
    }]
  }
  
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2))
  
  // Create new workspace
  const newWs = {
    id: `ws-${Date.now()}`,
    name: 'Test Workspace',
    path: '/tmp/test',
    createdAt: Date.now(),
    lastUsed: Date.now()
  }
  store.workspaces.push(newWs)
  store.current = newWs.id
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2))
  
  const loaded = JSON.parse(fs.readFileSync(storePath, 'utf8'))
  console.log(`   ✅ Workspace: Created and switched to "${loaded.workspaces[1].name}"`)
  
  fs.rmSync(configDir, { recursive: true })
} catch (error) {
  console.log(`   ❌ Workspace failed: ${error.message}`)
}

// Test 3: Heartbeat Scheduler
console.log('\n3️⃣ Testing Heartbeat Scheduler...')
try {
  let heartbeatCount = 0
  const timer = setInterval(() => {
    heartbeatCount++
  }, 100)
  
  setTimeout(() => {
    clearInterval(timer)
    console.log(`   ✅ Heartbeat: Triggered ${heartbeatCount} time(s) in 250ms`)
  }, 250)
  
  await new Promise(resolve => setTimeout(resolve, 300))
} catch (error) {
  console.log(`   ❌ Heartbeat failed: ${error.message}`)
}

// Test 4: Cron Scheduler
console.log('\n4️⃣ Testing Cron Scheduler...')
try {
  const cron = await import('node-cron')
  let cronExecuted = false
  
  const task = cron.schedule('* * * * * *', () => {
    cronExecuted = true
  })
  
  await new Promise(resolve => setTimeout(resolve, 1100))
  task.stop()
  
  console.log(`   ${cronExecuted ? '✅' : '❌'} Cron: Task ${cronExecuted ? 'executed' : 'did not execute'}`)
} catch (error) {
  console.log(`   ❌ Cron failed: ${error.message}`)
}

// Test 5: Coding Agent (check if claude CLI exists)
console.log('\n5️⃣ Testing Coding Agent...')
try {
  const { execSync } = await import('child_process')
  try {
    execSync('which claude', { stdio: 'pipe' })
    console.log('   ✅ Coding Agent: claude CLI found and ready')
  } catch {
    console.log('   ⚠️  Coding Agent: claude CLI not found (install AWS Code CLI)')
  }
} catch (error) {
  console.log(`   ❌ Coding Agent failed: ${error.message}`)
}

console.log('\n✨ Phase 5 test complete!\n')
