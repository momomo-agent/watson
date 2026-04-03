// Simple verification of P0 tools implementation
const fs = require('fs')
const path = require('path')

console.log('=== Verifying P0 Tools Implementation ===\n')

// 1. Check tools.ts has the 3 new tools
console.log('1. Checking tools.ts...')
const toolsContent = fs.readFileSync('./src/main/infrastructure/tools.ts', 'utf8')
const hasFileEdit = toolsContent.includes("name: 'file_edit'")
const hasProcess = toolsContent.includes("name: 'process'")
const hasWebFetch = toolsContent.includes("name: 'web_fetch'")

console.log('  file_edit:', hasFileEdit ? '✅' : '❌')
console.log('  process:', hasProcess ? '✅' : '❌')
console.log('  web_fetch:', hasWebFetch ? '✅' : '❌')

// 2. Check tool-runner.ts has implementations
console.log('\n2. Checking tool-runner.ts...')
const runnerContent = fs.readFileSync('./src/main/infrastructure/tool-runner.ts', 'utf8')
const hasFileEditCase = runnerContent.includes("case 'file_edit':")
const hasProcessCase = runnerContent.includes("case 'process':")
const hasWebFetchCase = runnerContent.includes("case 'web_fetch':")
const hasFileEditMethod = runnerContent.includes('private static async fileEdit')
const hasProcessMethod = runnerContent.includes('private static async process')
const hasWebFetchMethod = runnerContent.includes('private static async webFetch')

console.log('  file_edit case:', hasFileEditCase ? '✅' : '❌')
console.log('  file_edit method:', hasFileEditMethod ? '✅' : '❌')
console.log('  process case:', hasProcessCase ? '✅' : '❌')
console.log('  process method:', hasProcessMethod ? '✅' : '❌')
console.log('  web_fetch case:', hasWebFetchCase ? '✅' : '❌')
console.log('  web_fetch method:', hasWebFetchMethod ? '✅' : '❌')

// 3. Check process-manager.ts exists
console.log('\n3. Checking process-manager.ts...')
const pmExists = fs.existsSync('./src/main/infrastructure/process-manager.ts')
console.log('  File exists:', pmExists ? '✅' : '❌')

if (pmExists) {
  const pmContent = fs.readFileSync('./src/main/infrastructure/process-manager.ts', 'utf8')
  console.log('  startBackground:', pmContent.includes('export function startBackground') ? '✅' : '❌')
  console.log('  listSessions:', pmContent.includes('export function listSessions') ? '✅' : '❌')
  console.log('  poll:', pmContent.includes('export function poll') ? '✅' : '❌')
  console.log('  kill:', pmContent.includes('export function kill') ? '✅' : '❌')
}

// 4. Check build passes
console.log('\n4. Build status...')
const buildExists = fs.existsSync('./dist-electron/main/index.js')
console.log('  Build output exists:', buildExists ? '✅' : '❌')

console.log('\n=== Verification Complete ===')
