#!/usr/bin/env tsx
/**
 * MOMO-43: Watson MCP Client Validation Test
 * 验证 MCP 协议实现的完整性
 */

import { McpManager } from './src/main/infrastructure/mcp-manager'

interface TestResult {
  name: string
  passed: boolean
  details: string
}

const results: TestResult[] = []

function test(name: string, passed: boolean, details: string) {
  results.push({ name, passed, details })
  console.log(`${passed ? '✅' : '❌'} ${name}`)
  if (details) console.log(`   ${details}`)
}

async function main() {
  console.log('🧪 Watson MCP Client Validation (MOMO-43)\n')
  
  const manager = new McpManager()
  
  // Test 1: stdio transport 正确
  console.log('1️⃣ 验证 stdio transport...')
  try {
    await manager.connectAll({
      filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']
      }
    })
    const status = manager.getStatus()
    test(
      'stdio transport',
      status.filesystem?.status === 'connected',
      `Status: ${status.filesystem?.status}`
    )
  } catch (e: any) {
    test('stdio transport', false, e.message)
  }
  
  // Test 2: JSON-RPC 消息处理正确
  console.log('\n2️⃣ 验证 JSON-RPC 消息处理...')
  const tools = manager.listTools()
  test(
    'JSON-RPC 消息处理',
    tools.length > 0,
    `发现 ${tools.length} 个工具`
  )
  
  // Test 3: 工具发现有效
  console.log('\n3️⃣ 验证工具发现...')
  const hasValidTools = tools.every(t => 
    t.name.startsWith('mcp__') && 
    t.description && 
    t.input_schema
  )
  test(
    '工具发现',
    hasValidTools && tools.length > 0,
    `所有工具格式正确: ${tools.slice(0, 3).map(t => t.name).join(', ')}...`
  )
  
  // Test 4: 工具调用正常
  console.log('\n4️⃣ 验证工具调用...')
  if (tools.length > 0) {
    const listTool = tools.find(t => t.name.includes('list_allowed_directories'))
    if (listTool) {
      const result = await manager.callTool(listTool.name, {})
      test(
        '工具调用',
        !result.includes('Error:') && result.length > 0,
        `调用成功，返回: ${result.substring(0, 50)}...`
      )
    } else {
      test('工具调用', false, '未找到测试工具')
    }
  }
  
  // Test 5: 错误处理完善
  console.log('\n5️⃣ 验证错误处理...')
  const invalidResult = await manager.callTool('nonexistent_tool', {})
  test(
    '错误处理 - 工具不存在',
    invalidResult.includes('Error:'),
    invalidResult
  )
  
  // Test invalid config
  await manager.connectAll({
    invalid: { command: '' } as any
  })
  const invalidStatus = manager.getStatus()
  test(
    '错误处理 - 无效配置',
    !invalidStatus.invalid || invalidStatus.invalid.status === 'error',
    '无效配置被正确拒绝'
  )
  
  // Cleanup
  await manager.disconnectAll()
  
  // Summary
  console.log('\n' + '='.repeat(50))
  const passed = results.filter(r => r.passed).length
  const total = results.length
  console.log(`\n测试结果: ${passed}/${total} 通过`)
  
  if (passed === total) {
    console.log('\n✅ 所有验证标准通过！')
    process.exit(0)
  } else {
    console.log('\n❌ 部分测试失败')
    process.exit(1)
  }
}

main().catch(e => {
  console.error('❌ 测试执行失败:', e.message)
  process.exit(1)
})
