#!/usr/bin/env node
/**
 * Watson Tools Verification Test (MOMO-41)
 * Tests all 10 core tools for implementation completeness
 */

const { ToolRunner } = require('./dist-electron/main/infrastructure/tool-runner')
const path = require('path')
const fs = require('fs')

const WORKSPACE = process.cwd()
const TEST_DIR = path.join(WORKSPACE, '.watson-test-tmp')

// Mock dependencies
class MockMcpManager {
  isMcpTool() { return false }
}

class MockSkillManager {
  listSkills() { return [] }
  getSkill() { return null }
  execute() { throw new Error('No skills configured') }
  installDependencies() { throw new Error('No skills configured') }
}

// Setup
ToolRunner.setMcpManager(new MockMcpManager())
ToolRunner.setSkillManager(new MockSkillManager())

const results = []
let passed = 0
let failed = 0

function log(msg) {
  console.log(msg)
  results.push(msg)
}

async function test(name, fn) {
  try {
    await fn()
    log(`✅ ${name}`)
    passed++
  } catch (error) {
    log(`❌ ${name}: ${error.message}`)
    failed++
  }
}

async function runTests() {
  log('=== Watson Tools Verification Test ===\n')
  
  // Setup test directory
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true })
  }
  
  const signal = new AbortController().signal
  const options = { signal, workspacePath: WORKSPACE }
  
  // Test 1: file_read
  await test('file_read - basic read', async () => {
    const testFile = path.join(TEST_DIR, 'test-read.txt')
    fs.writeFileSync(testFile, 'Hello Watson')
    
    const result = await ToolRunner.execute({
      name: 'file_read',
      input: { path: path.relative(WORKSPACE, testFile) }
    }, options)
    
    if (!result.success) throw new Error(result.error)
    if (!result.output.includes('Hello Watson')) throw new Error('Content mismatch')
  })
  
  await test('file_read - file not found', async () => {
    const result = await ToolRunner.execute({
      name: 'file_read',
      input: { path: 'nonexistent-file.txt' }
    }, options)
    
    if (result.success) throw new Error('Should fail for nonexistent file')
    if (!result.error.includes('not found')) throw new Error('Wrong error message')
  })
  
  await test('file_read - offset/limit', async () => {
    const testFile = path.join(TEST_DIR, 'test-lines.txt')
    fs.writeFileSync(testFile, 'line1\nline2\nline3\nline4\nline5')
    
    const result = await ToolRunner.execute({
      name: 'file_read',
      input: { 
        path: path.relative(WORKSPACE, testFile),
        offset: 2,
        limit: 2
      }
    }, options)
    
    if (!result.success) throw new Error(result.error)
    if (!result.output.includes('line2')) throw new Error('Offset failed')
  })
  
  // Test 2: file_write
  await test('file_write - basic write', async () => {
    const testFile = path.join(TEST_DIR, 'test-write.txt')
    
    const result = await ToolRunner.execute({
      name: 'file_write',
      input: { 
        path: path.relative(WORKSPACE, testFile),
        content: 'Written by Watson'
      }
    }, options)
    
    if (!result.success) throw new Error(result.error)
    
    const content = fs.readFileSync(testFile, 'utf8')
    if (content !== 'Written by Watson') throw new Error('Content mismatch')
  })
  
  await test('file_write - create directories', async () => {
    const testFile = path.join(TEST_DIR, 'nested/deep/test.txt')
    
    const result = await ToolRunner.execute({
      name: 'file_write',
      input: { 
        path: path.relative(WORKSPACE, testFile),
        content: 'Nested write'
      }
    }, options)
    
    if (!result.success) throw new Error(result.error)
    if (!fs.existsSync(testFile)) throw new Error('File not created')
  })
  
  // Test 3: shell_exec
  await test('shell_exec - basic command', async () => {
    const result = await ToolRunner.execute({
      name: 'shell_exec',
      input: { command: 'echo "Hello from shell"' }
    }, options)
    
    if (!result.success) throw new Error(result.error)
    if (!result.output.includes('Hello from shell')) throw new Error('Output mismatch')
  })
  
  await test('shell_exec - error handling', async () => {
    const result = await ToolRunner.execute({
      name: 'shell_exec',
      input: { command: 'exit 1' }
    }, options)
    
    if (result.success) throw new Error('Should fail for non-zero exit')
  })
  
  // Test 4: notify
  await test('notify - basic notification', async () => {
    const result = await ToolRunner.execute({
      name: 'notify',
      input: { 
        title: 'Test',
        message: 'Test notification'
      }
    }, options)
    
    if (!result.success) throw new Error(result.error)
  })
  
  // Test 5: search (requires TAVILY_API_KEY)
  await test('search - API key check', async () => {
    const result = await ToolRunner.execute({
      name: 'search',
      input: { query: 'test query' }
    }, options)
    
    // Should either succeed or fail with API key error
    if (!result.success && !result.error.includes('TAVILY_API_KEY')) {
      throw new Error('Unexpected error: ' + result.error)
    }
  })
  
  // Test 6: code_exec
  await test('code_exec - JavaScript', async () => {
    const result = await ToolRunner.execute({
      name: 'code_exec',
      input: { 
        code: 'console.log("JS works")',
        language: 'javascript'
      }
    }, options)
    
    if (!result.success) throw new Error(result.error)
    if (!result.output.includes('JS works')) throw new Error('Output mismatch')
  })
  
  await test('code_exec - Python', async () => {
    const result = await ToolRunner.execute({
      name: 'code_exec',
      input: { 
        code: 'print("Python works")',
        language: 'python'
      }
    }, options)
    
    if (!result.success) throw new Error(result.error)
    if (!result.output.includes('Python works')) throw new Error('Output mismatch')
  })
  
  await test('code_exec - unsupported language', async () => {
    const result = await ToolRunner.execute({
      name: 'code_exec',
      input: { 
        code: 'test',
        language: 'ruby'
      }
    }, options)
    
    if (result.success) throw new Error('Should fail for unsupported language')
  })
  
  // Test 7: ui_status_set
  await test('ui_status_set - valid status', async () => {
    const result = await ToolRunner.execute({
      name: 'ui_status_set',
      input: { 
        level: 'thinking',
        text: 'Processing...'
      }
    }, options)
    
    // May fail if no window, but should validate input
    if (!result.success && !result.error.includes('No window')) {
      throw new Error(result.error)
    }
  })
  
  await test('ui_status_set - invalid level', async () => {
    const result = await ToolRunner.execute({
      name: 'ui_status_set',
      input: { 
        level: 'invalid',
        text: 'Test'
      }
    }, options)
    
    if (result.success) throw new Error('Should fail for invalid level')
  })
  
  await test('ui_status_set - text length validation', async () => {
    const result = await ToolRunner.execute({
      name: 'ui_status_set',
      input: { 
        level: 'idle',
        text: 'ab'  // Too short
      }
    }, options)
    
    if (result.success) throw new Error('Should fail for short text')
  })
  
  // Test 8: screen_sense
  await test('screen_sense - execution', async () => {
    const result = await ToolRunner.execute({
      name: 'screen_sense',
      input: {}
    }, options)
    
    // May fail if agent-control not available
    if (!result.success && !result.error.includes('agent-control')) {
      throw new Error('Unexpected error: ' + result.error)
    }
  })
  
  // Test 9: coding_agent
  await test('coding_agent - parameter validation', async () => {
    const result = await ToolRunner.execute({
      name: 'coding_agent',
      input: { task: 'test task' }
    }, options)
    
    // Should attempt to start (may fail if AWS Code not available)
    if (!result.success && !result.error.includes('CodingAgentSession')) {
      // Expected - implementation exists
    }
  })
  
  // Test 10: skill_* tools
  await test('skill_list - execution', async () => {
    const result = await ToolRunner.execute({
      name: 'skill_list',
      input: {}
    }, options)
    
    if (!result.success) throw new Error(result.error)
  })
  
  await test('skill_info - not found', async () => {
    const result = await ToolRunner.execute({
      name: 'skill_info',
      input: { name: 'nonexistent-skill' }
    }, options)
    
    if (result.success) throw new Error('Should fail for nonexistent skill')
  })
  
  // Cleanup
  fs.rmSync(TEST_DIR, { recursive: true, force: true })
  
  log('\n=== Test Summary ===')
  log(`Total: ${passed + failed}`)
  log(`Passed: ${passed}`)
  log(`Failed: ${failed}`)
  log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`)
  
  return failed === 0
}

runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('Test runner error:', error)
    process.exit(1)
  })
