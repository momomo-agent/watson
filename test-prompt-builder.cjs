/**
 * Test: System Prompt Builder
 * Verify that buildSystemPrompt reads workspace files and injects tools
 */

const { buildSystemPrompt } = require('./src/main/infrastructure/prompt-builder.ts')
const path = require('path')

const workspacePath = path.join(__dirname, '.watson')
const tools = [
  { name: 'file_read', description: 'Read file contents' },
  { name: 'shell_exec', description: 'Execute shell command' }
]

const prompt = buildSystemPrompt(workspacePath, tools)

console.log('=== System Prompt ===')
console.log(prompt)
console.log('\n=== Checks ===')
console.log('✓ Contains SOUL.md:', prompt.includes('Watson'))
console.log('✓ Contains AGENTS.md:', prompt.includes('Memory'))
console.log('✓ Contains tools:', prompt.includes('file_read'))
console.log('✓ Contains workspace path:', prompt.includes(workspacePath))
