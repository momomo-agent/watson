#!/usr/bin/env tsx
/**
 * Direct MCP Test (TypeScript)
 */

import { McpManager } from './src/main/infrastructure/mcp-manager'

async function test() {
  console.log('🧪 Testing Watson MCP Client\n')
  
  const manager = new McpManager()
  
  // Test 1: Config validation
  console.log('1️⃣ Testing config validation...')
  const testServers = {
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']
    }
  }
  
  // Test 2: Connection
  console.log('2️⃣ Connecting to MCP servers...')
  await manager.connectAll(testServers)
  
  // Test 3: Status check
  console.log('3️⃣ Checking connection status...')
  const status = manager.getStatus()
  console.log(JSON.stringify(status, null, 2))
  
  // Test 4: Tool discovery
  console.log('\n4️⃣ Discovering tools...')
  const tools = manager.listTools()
  console.log(`Found ${tools.length} tools:`)
  tools.forEach(t => console.log(`  - ${t.name}`))
  
  // Test 5: Tool routing
  if (tools.length > 0) {
    console.log('\n5️⃣ Testing tool routing...')
    const testTool = tools[0]
    console.log(`Calling: ${testTool.name}`)
    const result = await manager.callTool(testTool.name, { path: '/tmp' })
    console.log(`Result: ${result.substring(0, 100)}...`)
  }
  
  // Cleanup
  await manager.disconnectAll()
  
  console.log('\n✅ All tests passed!')
}

test().catch(e => {
  console.error('❌ Test failed:', e.message)
  process.exit(1)
})
