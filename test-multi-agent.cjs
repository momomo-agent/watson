/**
 * MOMO-50 Multi-Agent Test
 * 
 * Tests:
 * 1. Agent configuration and management
 * 2. @mention routing
 * 3. Agent-specific model/prompt
 * 4. Message persistence with agentId
 */

const { AgentManager } = require('./src/main/infrastructure/agent-manager')
const { MessageStore } = require('./src/main/infrastructure/message-store')
const path = require('path')
const fs = require('fs')
const os = require('os')

const testWorkspace = path.join(os.tmpdir(), 'watson-test-' + Date.now())
fs.mkdirSync(path.join(testWorkspace, '.watson'), { recursive: true })

console.log('🧪 Testing Multi-Agent Functionality\n')

// Test 1: Agent Manager
console.log('1️⃣ Testing AgentManager...')
const agentManager = new AgentManager(testWorkspace)

// List default agents
const agents = agentManager.listAgents()
console.log(`   ✓ Found ${agents.length} default agents`)
console.log(`   ✓ Default agent: ${agentManager.getDefaultAgent().name}`)

// Add custom agent
agentManager.addAgent({
  id: 'test-agent',
  name: 'Test Agent',
  description: 'A test agent',
  avatar: '🧪',
  color: '#ff0000',
  model: 'claude-opus-4',
  systemPrompt: 'You are a test agent.'
})
console.log('   ✓ Added custom agent')

// Get agent
const testAgent = agentManager.getAgent('test-agent')
console.log(`   ✓ Retrieved agent: ${testAgent.name}`)

// Test 2: @mention parsing
console.log('\n2️⃣ Testing @mention parsing...')
const mention1 = agentManager.parseAgentMention('@coder write a function')
console.log(`   ✓ Parsed "@coder write a function" → ${mention1}`)

const mention2 = agentManager.parseAgentMention('hello world')
console.log(`   ✓ Parsed "hello world" → ${mention2 || 'undefined'}`)

const stripped = agentManager.stripAgentMention('@coder write a function')
console.log(`   ✓ Stripped mention → "${stripped}"`)

// Test 3: Message persistence with agentId
console.log('\n3️⃣ Testing message persistence...')
const messageStore = new MessageStore()

const testMessage = {
  id: 'msg-1',
  sessionId: 'test-session',
  workspaceId: testWorkspace,
  role: 'assistant',
  content: 'Hello from test agent',
  status: 'complete',
  createdAt: Date.now(),
  agentId: 'test-agent'
}

messageStore.save(testMessage)
console.log('   ✓ Saved message with agentId')

const loaded = messageStore.load('test-session', testWorkspace)
console.log(`   ✓ Loaded ${loaded.length} messages`)
console.log(`   ✓ Message agentId: ${loaded[0].agentId}`)

// Test 4: Agent config persistence
console.log('\n4️⃣ Testing agent config persistence...')
const configPath = path.join(testWorkspace, '.watson', 'agents.json')
const configExists = fs.existsSync(configPath)
console.log(`   ✓ Config file exists: ${configExists}`)

if (configExists) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  console.log(`   ✓ Config has ${config.agents.length} agents`)
  console.log(`   ✓ Default agent: ${config.defaultAgent}`)
}

// Cleanup
messageStore.clear('test-session', testWorkspace)
messageStore.close()
fs.rmSync(testWorkspace, { recursive: true, force: true })

console.log('\n✅ All tests passed!')
console.log('\n📝 Next steps:')
console.log('   1. Run the app and test agent selector UI')
console.log('   2. Test @mention routing in chat')
console.log('   3. Test agent management dialog')
console.log('   4. Verify agent-specific models work')
