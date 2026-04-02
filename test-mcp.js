#!/usr/bin/env node
/**
 * Test MCP Client Integration
 * 
 * Usage: node test-mcp.js
 */

const { McpManager } = require('./dist-electron/main/infrastructure/mcp-manager.js')

async function testMcp() {
  console.log('[Test] Starting MCP client test...\n')
  
  const manager = new McpManager()
  
  // Test config
  const testServers = {
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      disabled: false
    }
  }
  
  try {
    console.log('[Test] Connecting to MCP servers...')
    await manager.connectAll(testServers)
    
    console.log('\n[Test] Connection status:')
    const status = manager.getStatus()
    console.log(JSON.stringify(status, null, 2))
    
    console.log('\n[Test] Available tools:')
    const tools = manager.listTools()
    tools.forEach(t => {
      console.log(`  - ${t.name}: ${t.description}`)
    })
    
    if (tools.length > 0) {
      console.log('\n[Test] Testing tool call...')
      const testTool = tools[0]
      console.log(`  Calling: ${testTool.name}`)
      
      // Try a simple call (adjust args based on actual tool)
      const result = await manager.callTool(testTool.name, {})
      console.log(`  Result: ${result.substring(0, 200)}...`)
    }
    
    console.log('\n[Test] Disconnecting...')
    await manager.disconnectAll()
    
    console.log('[Test] ✅ All tests passed!')
  } catch (error) {
    console.error('[Test] ❌ Error:', error.message)
    process.exit(1)
  }
}

testMcp()
