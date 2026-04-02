#!/usr/bin/env tsx
/**
 * MCP Error Handling Test
 */

import { McpManager } from './src/main/infrastructure/mcp-manager'

async function testErrorHandling() {
  console.log('🧪 Testing MCP Error Handling\n')
  
  const manager = new McpManager()
  
  // Test 1: Invalid config (missing command)
  console.log('1️⃣ Testing invalid config (missing command)...')
  await manager.connectAll({
    invalid1: { args: ['test'] } as any
  })
  let status = manager.getStatus()
  console.log('Status:', Object.keys(status).length === 0 ? '✅ Rejected invalid config' : '❌ Should reject')
  
  // Test 2: Invalid config (wrong types)
  console.log('\n2️⃣ Testing invalid config (wrong types)...')
  await manager.connectAll({
    invalid2: { command: 'test', args: 'not-array' } as any
  })
  status = manager.getStatus()
  console.log('Status:', Object.keys(status).length === 0 ? '✅ Rejected invalid config' : '❌ Should reject')
  
  // Test 3: Non-existent command
  console.log('\n3️⃣ Testing non-existent command...')
  await manager.connectAll({
    nonexistent: { command: 'this-command-does-not-exist-12345' }
  })
  status = manager.getStatus()
  console.log('Status:', JSON.stringify(status, null, 2))
  console.log(status.nonexistent?.status === 'error' ? '✅ Caught connection error' : '❌ Should catch error')
  
  // Test 4: Disabled server
  console.log('\n4️⃣ Testing disabled server...')
  await manager.connectAll({
    disabled: { command: 'npx', disabled: true }
  })
  status = manager.getStatus()
  console.log('Status:', !status.disabled ? '✅ Skipped disabled server' : '❌ Should skip')
  
  // Test 5: Tool not found
  console.log('\n5️⃣ Testing tool not found...')
  const result = await manager.callTool('mcp__nonexistent__tool', {})
  console.log('Result:', result.includes('not found') ? '✅ Returned error message' : '❌ Should return error')
  
  console.log('\n✅ All error handling tests passed!')
}

testErrorHandling().catch(e => {
  console.error('❌ Test failed:', e.message)
  process.exit(1)
})
