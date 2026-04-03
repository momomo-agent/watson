/**
 * MOMO-50 Multi-Agent Test (Simplified)
 * 
 * Tests the multi-agent implementation by checking file structure
 */

const fs = require('fs')
const path = require('path')

console.log('🧪 Testing Multi-Agent Implementation\n')

const files = [
  'src/main/infrastructure/agent-manager.ts',
  'src/renderer/components/AgentSelector.vue',
  'src/renderer/components/AgentManager.vue',
  'migrate-agent-id.sh',
  'MOMO-50-MULTI-AGENT.md'
]

console.log('1️⃣ Checking new files...')
let allExist = true
for (const file of files) {
  const exists = fs.existsSync(file)
  console.log(`   ${exists ? '✓' : '✗'} ${file}`)
  if (!exists) allExist = false
}

console.log('\n2️⃣ Checking modified files...')
const modifiedFiles = [
  'src/main/infrastructure/message-store.ts',
  'src/main/domain/chat-session.ts',
  'src/main/application/workspace-manager.ts',
  'src/main/application/chat-handlers.ts',
  'src/renderer/components/ChatInput.vue',
  'src/renderer/components/ChatView.vue',
  'src/renderer/components/MessageCard.vue',
  'src/renderer/composables/useChatSession.ts'
]

for (const file of modifiedFiles) {
  const exists = fs.existsSync(file)
  if (exists) {
    const content = fs.readFileSync(file, 'utf8')
    const hasAgentId = content.includes('agentId') || content.includes('agent_id')
    console.log(`   ${hasAgentId ? '✓' : '✗'} ${file} ${hasAgentId ? '(has agentId)' : '(missing agentId)'}`)
  } else {
    console.log(`   ✗ ${file} (not found)`)
  }
}

console.log('\n3️⃣ Checking key implementations...')

// Check AgentManager
const agentManagerPath = 'src/main/infrastructure/agent-manager.ts'
if (fs.existsSync(agentManagerPath)) {
  const content = fs.readFileSync(agentManagerPath, 'utf8')
  const hasParseAgentMention = content.includes('parseAgentMention')
  const hasStripAgentMention = content.includes('stripAgentMention')
  const hasAddAgent = content.includes('addAgent')
  console.log(`   ${hasParseAgentMention ? '✓' : '✗'} AgentManager.parseAgentMention`)
  console.log(`   ${hasStripAgentMention ? '✓' : '✗'} AgentManager.stripAgentMention`)
  console.log(`   ${hasAddAgent ? '✓' : '✗'} AgentManager.addAgent`)
}

// Check chat-handlers
const handlersPath = 'src/main/application/chat-handlers.ts'
if (fs.existsSync(handlersPath)) {
  const content = fs.readFileSync(handlersPath, 'utf8')
  const hasAgentList = content.includes('agent:list')
  const hasAgentGet = content.includes('agent:get')
  const hasAgentAdd = content.includes('agent:add')
  console.log(`   ${hasAgentList ? '✓' : '✗'} IPC handler: agent:list`)
  console.log(`   ${hasAgentGet ? '✓' : '✗'} IPC handler: agent:get`)
  console.log(`   ${hasAgentAdd ? '✓' : '✗'} IPC handler: agent:add`)
}

// Check database schema
const messageStorePath = 'src/main/infrastructure/message-store.ts'
if (fs.existsSync(messageStorePath)) {
  const content = fs.readFileSync(messageStorePath, 'utf8')
  const hasAgentIdColumn = content.includes('agent_id TEXT')
  console.log(`   ${hasAgentIdColumn ? '✓' : '✗'} Database: agent_id column`)
}

console.log('\n4️⃣ Summary')
console.log(`   New files: ${files.filter(f => fs.existsSync(f)).length}/${files.length}`)
console.log(`   Modified files: ${modifiedFiles.filter(f => fs.existsSync(f)).length}/${modifiedFiles.length}`)

if (allExist) {
  console.log('\n✅ All implementation files present!')
} else {
  console.log('\n⚠️  Some files are missing')
}

console.log('\n📝 Next steps:')
console.log('   1. Build the app: npm run build')
console.log('   2. Run migration: ./migrate-agent-id.sh')
console.log('   3. Start the app: npm run dev')
console.log('   4. Test agent selector UI')
console.log('   5. Test @mention routing')
console.log('   6. Test agent management dialog')
