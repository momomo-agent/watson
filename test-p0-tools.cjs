// Test P0 tools: file_edit, process, web_fetch
const { ToolRunner } = require('./dist-electron/main/index.js')
const fs = require('fs')
const path = require('path')

const workspacePath = '/tmp/watson-test'
fs.mkdirSync(workspacePath, { recursive: true })

async function test() {
  console.log('=== Testing P0 Tools ===\n')
  
  // Test 1: file_edit
  console.log('1. Testing file_edit...')
  const testFile = path.join(workspacePath, 'test.txt')
  fs.writeFileSync(testFile, 'Hello World\nThis is a test\n', 'utf8')
  
  const editResult = await ToolRunner.execute(
    { name: 'file_edit', input: { path: 'test.txt', old_text: 'Hello World', new_text: 'Hello Watson' } },
    { signal: new AbortController().signal, workspacePath }
  )
  console.log('Edit result:', editResult)
  console.log('File content:', fs.readFileSync(testFile, 'utf8'))
  
  // Test 2: process (background + list + poll + kill)
  console.log('\n2. Testing process...')
  const bgResult = await ToolRunner.execute(
    { name: 'shell_exec', input: { command: 'sleep 3 && echo done', background: true } },
    { signal: new AbortController().signal, workspacePath }
  )
  console.log('Background start:', bgResult)
  
  const sessionId = bgResult.output?.match(/bg-[a-z0-9-]+/)?.[0]
  if (sessionId) {
    const listResult = await ToolRunner.execute(
      { name: 'process', input: { action: 'list' } },
      { signal: new AbortController().signal, workspacePath }
    )
    console.log('Process list:', listResult.output?.slice(0, 200))
    
    await new Promise(r => setTimeout(r, 1000))
    
    const pollResult = await ToolRunner.execute(
      { name: 'process', input: { action: 'poll', sessionId } },
      { signal: new AbortController().signal, workspacePath }
    )
    console.log('Poll result:', pollResult.output?.slice(0, 200))
    
    const killResult = await ToolRunner.execute(
      { name: 'process', input: { action: 'kill', sessionId } },
      { signal: new AbortController().signal, workspacePath }
    )
    console.log('Kill result:', killResult)
  }
  
  // Test 3: web_fetch
  console.log('\n3. Testing web_fetch...')
  const fetchResult = await ToolRunner.execute(
    { name: 'web_fetch', input: { url: 'https://example.com', maxChars: 500 } },
    { signal: new AbortController().signal, workspacePath }
  )
  console.log('Fetch result:', fetchResult.success ? 'OK' : 'FAIL')
  console.log('Content preview:', fetchResult.output?.slice(0, 100))
  
  console.log('\n=== All tests completed ===')
}

test().catch(console.error)
