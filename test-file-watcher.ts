/**
 * Test for FileWatcher (MOMO-55)
 *
 * Verifies debouncing, batch processing, and event deduplication.
 * Run: npx tsx test-file-watcher.ts
 */

import { FileWatcher, type FileChangeBatch } from './src/main/infrastructure/file-watcher'
import fs from 'fs'
import path from 'path'
import os from 'os'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Wait for the next batch event, with timeout */
function waitForBatch(watcher: FileWatcher, timeoutMs = 2000): Promise<FileChangeBatch> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for batch')), timeoutMs)
    watcher.once('batch', (batch: FileChangeBatch) => {
      clearTimeout(timer)
      resolve(batch)
    })
  })
}

let passed = 0
let failed = 0
function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++
    console.log(`  ✅ ${msg}`)
  } else {
    failed++
    console.log(`  ❌ ${msg}`)
  }
}

async function test() {
  // Create temp workspace
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watson-fw-test-'))
  const memoryDir = path.join(tmpDir, 'memory', 'timeline')
  fs.mkdirSync(memoryDir, { recursive: true })
  fs.writeFileSync(path.join(tmpDir, 'MEMORY.md'), '# Memory\n')

  console.log(`Temp workspace: ${tmpDir}\n`)

  const watcher = new FileWatcher(tmpDir, { debounceMs: 200 })

  watcher.on('error', (err) => {
    console.error('[error]', err)
  })

  watcher.start()

  // Wait for ready
  await new Promise<void>(resolve => {
    if (watcher.ready) resolve()
    else watcher.once('ready', resolve)
  })

  // ── Test 1: Single file change ──
  console.log('Test 1: Single file change')
  const batch1P = waitForBatch(watcher)
  fs.writeFileSync(path.join(tmpDir, 'MEMORY.md'), '# Memory\n\nUpdated content')
  const batch1 = await batch1P
  assert(batch1.toIndex.length === 1, `toIndex has 1 file (got ${batch1.toIndex.length})`)
  assert(batch1.toIndex[0] === 'MEMORY.md', `file is MEMORY.md (got ${batch1.toIndex[0]})`)
  assert(batch1.toRemove.length === 0, `toRemove is empty`)

  // ── Test 2: Rapid changes (debounce deduplicates) ──
  console.log('\nTest 2: Rapid changes (debounce)')
  const batch2P = waitForBatch(watcher)
  const testFile = path.join(memoryDir, '2026-04-04.md')
  fs.writeFileSync(testFile, 'line 1')
  await sleep(50)
  fs.writeFileSync(testFile, 'line 1\nline 2')
  await sleep(50)
  fs.writeFileSync(testFile, 'line 1\nline 2\nline 3')
  const batch2 = await batch2P
  assert(batch2.toIndex.length === 1, `debounced to 1 file (got ${batch2.toIndex.length})`)
  assert(batch2.toIndex[0] === 'memory/timeline/2026-04-04.md', `correct path (got ${batch2.toIndex[0]})`)

  // ── Test 3: Multiple files in one batch ──
  console.log('\nTest 3: Multiple files in one batch')
  const batch3P = waitForBatch(watcher)
  const file2 = path.join(memoryDir, '2026-04-03.md')
  fs.writeFileSync(testFile, 'updated again')
  fs.writeFileSync(file2, 'another file')
  const batch3 = await batch3P
  assert(batch3.toIndex.length === 2, `2 files indexed (got ${batch3.toIndex.length})`)

  // ── Test 4: File deletion ──
  console.log('\nTest 4: File deletion')
  const batch4P = waitForBatch(watcher)
  fs.unlinkSync(file2)
  const batch4 = await batch4P
  assert(batch4.toRemove.length === 1, `1 file removed (got ${batch4.toRemove.length})`)
  assert(batch4.toRemove[0] === 'memory/timeline/2026-04-03.md', `correct removed path`)

  // ── Test 5: Non-md files are ignored ──
  console.log('\nTest 5: Non-md files ignored')
  let gotUnexpectedBatch = false
  const unexpectedHandler = () => { gotUnexpectedBatch = true }
  watcher.on('batch', unexpectedHandler)
  fs.writeFileSync(path.join(memoryDir, 'notes.txt'), 'not markdown')
  fs.writeFileSync(path.join(memoryDir, 'data.json'), '{}')
  await sleep(600)
  watcher.off('batch', unexpectedHandler)
  assert(!gotUnexpectedBatch, 'no batch for non-md files')

  // ── Test 6: New file in memory subdir ──
  console.log('\nTest 6: New file in memory subdir')
  const newSubDir = path.join(tmpDir, 'memory', 'lessons')
  fs.mkdirSync(newSubDir, { recursive: true })
  const batch6P = waitForBatch(watcher)
  fs.writeFileSync(path.join(newSubDir, 'lesson-1.md'), '# Lesson 1')
  const batch6 = await batch6P
  assert(batch6.toIndex.length === 1, `new subdir file indexed`)
  assert(batch6.toIndex[0] === 'memory/lessons/lesson-1.md', `correct path (got ${batch6.toIndex[0]})`)

  // Cleanup
  await watcher.stop()
  assert(!watcher.isWatching, 'watcher stopped')
  fs.rmSync(tmpDir, { recursive: true, force: true })

  console.log(`\n${'─'.repeat(40)}`)
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

test().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})
