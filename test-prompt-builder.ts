/**
 * Test: System Prompt Builder (MOMO-35)
 * Validates workspace file reading, tool injection, and prompt format
 */

import { buildSystemPrompt } from './src/main/infrastructure/prompt-builder'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Create test workspace
const testDir = path.join(os.tmpdir(), 'watson-test-' + Date.now())
fs.mkdirSync(testDir, { recursive: true })

// Write test workspace files
fs.writeFileSync(path.join(testDir, 'SOUL.md'), '# Test Soul\nI am a test assistant.')
fs.writeFileSync(path.join(testDir, 'AGENTS.md'), '# Test Agents\nAgent guidelines here.')
fs.writeFileSync(path.join(testDir, 'USER.md'), '# Test User\nUser: TestUser')

// Mock tools
const testTools = [
  { name: 'read_file', description: 'Read file contents' },
  { name: 'write_file', description: 'Write to file' },
  { name: 'exec_command', description: 'Execute shell command' }
]

console.log('🧪 Testing System Prompt Builder...\n')

// Test 1: Build prompt with tools
const prompt = buildSystemPrompt(testDir, testTools)

// Verify structure
const checks = {
  'Contains identity': prompt.includes('You are Watson'),
  'Contains tool list': prompt.includes('Available Tools'),
  'Contains all 3 tools': testTools.every(t => prompt.includes(t.name) && prompt.includes(t.description)),
  'Contains workspace path': prompt.includes(testDir),
  'Contains SOUL.md': prompt.includes('Test Soul'),
  'Contains AGENTS.md': prompt.includes('Test Agents'),
  'Contains USER.md': prompt.includes('Test User'),
  'Contains runtime info': prompt.includes('Runtime') && prompt.includes(os.hostname())
}

console.log('✅ Verification Results:\n')
Object.entries(checks).forEach(([test, pass]) => {
  console.log(`${pass ? '✅' : '❌'} ${test}`)
})

const allPassed = Object.values(checks).every(v => v)

if (allPassed) {
  console.log('\n🎉 All tests passed!')
  console.log('\n📋 Sample prompt structure:')
  console.log(prompt.split('\n').slice(0, 30).join('\n'))
  console.log('\n... (truncated)')
} else {
  console.log('\n❌ Some tests failed!')
  process.exit(1)
}

// Cleanup
fs.rmSync(testDir, { recursive: true })
