// Direct test of tool implementations
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const workspacePath = '/tmp/watson-test'
mkdirSync(workspacePath, { recursive: true })

// Test 1: file_edit logic
console.log('=== Test 1: file_edit ===')
const testFile = resolve(workspacePath, 'test.txt')
writeFileSync(testFile, 'Hello World\nThis is a test\n', 'utf8')

const content = readFileSync(testFile, 'utf8')
const old_text = 'Hello World'
const new_text = 'Hello Watson'
const idx = content.indexOf(old_text)

if (idx === -1) {
  console.log('❌ old_text not found')
} else {
  const secondIdx = content.indexOf(old_text, idx + 1)
  if (secondIdx !== -1) {
    console.log('❌ Multiple matches found')
  } else {
    const newContent = content.slice(0, idx) + new_text + content.slice(idx + old_text.length)
    writeFileSync(testFile, newContent, 'utf8')
    console.log('✅ File edited')
    console.log('Content:', readFileSync(testFile, 'utf8'))
  }
}

// Test 2: process manager
console.log('\n=== Test 2: process manager ===')
import * as pm from './src/main/infrastructure/process-manager.js'

const sessionId = pm.startBackground('echo "test" && sleep 1 && echo "done"', workspacePath)
console.log('✅ Started:', sessionId)

console.log('List:', pm.listSessions())

await new Promise(r => setTimeout(r, 500))
console.log('Poll:', pm.poll(sessionId))

await new Promise(r => setTimeout(r, 1000))
console.log('Final poll:', pm.poll(sessionId))

// Test 3: web_fetch logic
console.log('\n=== Test 3: web_fetch ===')
try {
  const response = await fetch('https://example.com', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(15000)
  })
  
  if (response.ok) {
    const html = await response.text()
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    
    console.log('✅ Fetched:', text.slice(0, 100))
  }
} catch (error) {
  console.log('❌ Fetch failed:', error.message)
}

console.log('\n=== All tests completed ===')
