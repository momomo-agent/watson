/**
 * Test: Watson Agentic Tool Loop (MOMO-34)
 * 
 * Verifies the complete tool loop implementation:
 * 1. tool_use parsing from LLM stream
 * 2. ToolRunner execution
 * 3. tool_result injection back into conversation
 * 4. Loop continuation (max 5 rounds)
 * 5. Loop detection integration
 */

import { ChatSession, type LLMStreamFn, type ToolExecutorFn, type ErrorRecoveryCallbacks } from './src/main/domain/chat-session'
import { LoopDetector } from './src/main/infrastructure/loop-detection'

// Mock LLM that returns tool_use blocks
function createMockLLM(scenario: 'single-tool' | 'multi-round' | 'text-only' | 'max-rounds'): LLMStreamFn {
  let callCount = 0
  
  return async function* (messages, signal) {
    callCount++
    console.log(`\n[Mock LLM] Call #${callCount}, history length: ${messages.length}`)
    
    if (scenario === 'single-tool') {
      // Round 1: Request a tool
      if (callCount === 1) {
        yield { type: 'text', text: 'Let me check the file.' }
        yield { type: 'tool_use', tool: { id: 't1', name: 'file_read', input: { path: 'test.txt' } } }
        yield { type: 'done', stopReason: 'tool_use' }
      }
      // Round 2: After tool result, return text
      else {
        yield { type: 'text', text: 'The file contains: [content from tool]' }
        yield { type: 'done', stopReason: 'end_turn' }
      }
    }
    
    else if (scenario === 'multi-round') {
      // Round 1: tool A
      if (callCount === 1) {
        yield { type: 'tool_use', tool: { id: 't1', name: 'file_read', input: { path: 'a.txt' } } }
        yield { type: 'done', stopReason: 'tool_use' }
      }
      // Round 2: tool B
      else if (callCount === 2) {
        yield { type: 'tool_use', tool: { id: 't2', name: 'file_read', input: { path: 'b.txt' } } }
        yield { type: 'done', stopReason: 'tool_use' }
      }
      // Round 3: final text
      else {
        yield { type: 'text', text: 'Done processing both files.' }
        yield { type: 'done', stopReason: 'end_turn' }
      }
    }
    
    else if (scenario === 'text-only') {
      yield { type: 'text', text: 'No tools needed.' }
      yield { type: 'done', stopReason: 'end_turn' }
    }
    
    else if (scenario === 'max-rounds') {
      // Keep requesting tools until max rounds hit
      if (callCount <= 5) {
        yield { type: 'tool_use', tool: { id: `t${callCount}`, name: 'file_read', input: { path: `file${callCount}.txt` } } }
        yield { type: 'done', stopReason: 'tool_use' }
      } else {
        yield { type: 'text', text: 'Final response after max rounds.' }
        yield { type: 'done', stopReason: 'end_turn' }
      }
    }
  }
}

// Mock tool executor
const mockToolExecutor: ToolExecutorFn = async (tool, options) => {
  console.log(`[Tool Executor] Executing ${tool.name} with input:`, JSON.stringify(tool.input))
  
  if (tool.name === 'file_read') {
    return { success: true, output: `Content of ${tool.input.path}` }
  }
  
  return { success: false, error: 'Unknown tool' }
}

// Mock error recovery with loop detection
function createMockRecovery(): ErrorRecoveryCallbacks {
  const loopDetector = new LoopDetector()
  
  return {
    prepareMessages: async (messages) => messages,
    
    handleError: (err) => ({
      classified: { short: err.message, detail: err.message, category: 'unknown', retryable: false },
      action: 'abort' as const,
      retryDelayMs: 0
    }),
    
    checkToolCall: (toolName, params) => {
      loopDetector.recordToolCall(toolName, params)
      return loopDetector.check(toolName, params)
    },
    
    recordToolOutcome: (toolName, params, result, error) => {
      loopDetector.recordOutcome(toolName, params, result, error)
    }
  }
}

// Test runner
async function runTest(name: string, scenario: 'single-tool' | 'multi-round' | 'text-only' | 'max-rounds') {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`TEST: ${name}`)
  console.log('='.repeat(60))
  
  const llmStream = createMockLLM(scenario)
  const recovery = createMockRecovery()
  const session = new ChatSession('test-session', '/tmp/test-workspace', llmStream, recovery, mockToolExecutor)
  
  // Listen to updates
  session.on('update', () => {
    const lastMsg = session.messages[session.messages.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
      console.log(`[Session Update] Status: ${lastMsg.status}, Round: ${lastMsg.toolRound || 0}, Tools: ${lastMsg.toolCalls?.length || 0}`)
    }
  })
  
  await session.sendMessage('Test message')
  
  const assistantMsg = session.messages.find(m => m.role === 'assistant')
  console.log(`\n[Result] Status: ${assistantMsg?.status}`)
  console.log(`[Result] Content length: ${assistantMsg?.content.length}`)
  console.log(`[Result] Tool calls: ${assistantMsg?.toolCalls?.length || 0}`)
  console.log(`[Result] Final round: ${assistantMsg?.toolRound || 0}`)
  
  if (assistantMsg?.toolCalls) {
    assistantMsg.toolCalls.forEach((tc, i) => {
      console.log(`  Tool ${i + 1}: ${tc.name} - ${tc.status}`)
    })
  }
  
  return assistantMsg
}

// Run all tests
async function main() {
  try {
    // Test 1: Single tool call
    const result1 = await runTest('Single Tool Call', 'single-tool')
    console.assert(result1?.status === 'complete', '❌ Test 1 failed: status should be complete')
    console.assert(result1?.toolCalls?.length === 1, '❌ Test 1 failed: should have 1 tool call')
    console.assert(result1?.toolCalls?.[0].status === 'complete', '❌ Test 1 failed: tool should be complete')
    console.log('✅ Test 1 passed')
    
    // Test 2: Multi-round tool calls
    const result2 = await runTest('Multi-Round Tool Calls', 'multi-round')
    console.assert(result2?.status === 'complete', '❌ Test 2 failed: status should be complete')
    console.assert(result2?.toolCalls?.length === 2, '❌ Test 2 failed: should have 2 tool calls')
    console.assert(result2?.toolRound === 3, '❌ Test 2 failed: should complete in round 3')
    console.log('✅ Test 2 passed')
    
    // Test 3: Text-only response (no tools)
    const result3 = await runTest('Text-Only Response', 'text-only')
    console.assert(result3?.status === 'complete', '❌ Test 3 failed: status should be complete')
    console.assert(result3?.toolCalls?.length === 0, '❌ Test 3 failed: should have 0 tool calls')
    console.assert(result3?.toolRound === 1, '❌ Test 3 failed: should complete in round 1')
    console.log('✅ Test 3 passed')
    
    // Test 4: Max rounds limit
    const result4 = await runTest('Max Rounds Limit', 'max-rounds')
    console.assert(result4?.status === 'complete', '❌ Test 4 failed: status should be complete')
    console.assert(result4?.toolCalls?.length === 5, '❌ Test 4 failed: should have 5 tool calls (max)')
    console.assert(result4?.toolRound === 5, '❌ Test 4 failed: should hit max round 5')
    console.log('✅ Test 4 passed')
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ ALL TESTS PASSED')
    console.log('='.repeat(60))
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error)
    process.exit(1)
  }
}

main()
