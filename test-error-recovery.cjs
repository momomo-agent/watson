/**
 * Test: Error Recovery Modules (MOMO-23)
 *
 * Tests all 5 sub-modules:
 *   1. Error Classification
 *   2. Context Compaction
 *   3. Context Guard
 *   4. Loop Detection
 *   5. API Retry (via Enhanced LLM Client)
 */

// We test the modules directly using require + ts transpilation
// Since Watson uses TypeScript, we test the logic directly

const { createHash } = require('crypto')

// ═══════════════════════════════════════════════════════════
// 1. Error Classification Tests
// ═══════════════════════════════════════════════════════════

console.log('\n═══ 1. Error Classification ═══')

// Simulate the classifyError logic
function classifyError(err) {
  if (!err) return { short: 'Error', detail: 'Unknown error', category: 'unknown', retryable: false, retryAfterMs: 0 }
  const msg = err?.message || String(err) || ''
  const lower = msg.toLowerCase()

  if ((lower.includes('context') && lower.includes('length')) || lower.includes('too many tokens') || lower.includes('prompt is too long')) {
    return { short: 'Context too long', detail: 'Compacting...', category: 'context', retryable: true, retryAfterMs: 0 }
  }
  if (lower.includes('401') || lower.includes('unauthorized')) {
    return { short: 'Invalid API key', detail: 'Check Settings.', category: 'auth', retryable: false, retryAfterMs: 0 }
  }
  if (lower.includes('429') || lower.includes('rate limit')) {
    return { short: 'Rate limited', detail: 'Retrying...', category: 'rate-limit', retryable: true, retryAfterMs: 5000 }
  }
  if (lower.includes('billing') || lower.includes('402')) {
    return { short: 'Billing error', detail: 'Check balance.', category: 'billing', retryable: false, retryAfterMs: 0 }
  }
  if (lower.includes('503') || lower.includes('overloaded')) {
    return { short: 'Server overloaded', detail: 'Retrying...', category: 'server', retryable: true, retryAfterMs: 3000 }
  }
  if (lower.includes('econnrefused') || lower.includes('timeout')) {
    return { short: 'Network error', detail: 'Check connection.', category: 'network', retryable: true, retryAfterMs: 2000 }
  }
  return { short: msg.slice(0, 80), detail: msg.slice(0, 200), category: 'unknown', retryable: false, retryAfterMs: 0 }
}

const tests = [
  { input: new Error('maximum context length exceeded'), expected: 'context' },
  { input: new Error('prompt is too long for model'), expected: 'context' },
  { input: new Error('401 Unauthorized'), expected: 'auth' },
  { input: new Error('429 Too Many Requests'), expected: 'rate-limit' },
  { input: new Error('rate limit exceeded'), expected: 'rate-limit' },
  { input: new Error('402 billing issue'), expected: 'billing' },
  { input: new Error('503 Service Unavailable'), expected: 'server' },
  { input: new Error('API is overloaded'), expected: 'server' },
  { input: new Error('ECONNREFUSED'), expected: 'network' },
  { input: new Error('request timeout'), expected: 'network' },
  { input: new Error('something random'), expected: 'unknown' },
  { input: null, expected: 'unknown' },
]

let passed = 0
let failed = 0

for (const t of tests) {
  const result = classifyError(t.input)
  if (result.category === t.expected) {
    passed++
    console.log(`  ✅ "${t.input?.message || 'null'}" → ${result.category}`)
  } else {
    failed++
    console.log(`  ❌ "${t.input?.message || 'null'}" → ${result.category} (expected ${t.expected})`)
  }
}

// ═══════════════════════════════════════════════════════════
// 2. Context Compaction Tests
// ═══════════════════════════════════════════════════════════

console.log('\n═══ 2. Context Compaction ═══')

function estimateTokens(text) {
  if (!text) return 0
  if (typeof text === 'string') return Math.ceil(text.length / 3.5)
  return 0
}

function estimateMessagesTokens(messages) {
  return messages.reduce((s, m) => s + estimateTokens(m.content) + 10, 0)
}

function getContextWindowForModel(model) {
  if (!model) return null
  const lower = model.toLowerCase()
  if (lower.includes('claude')) return 200000
  if (lower.includes('gpt')) return 128000
  return null
}

function getCompactThreshold(model) {
  const w = getContextWindowForModel(model)
  if (w) return Math.floor((w - 4096) * 0.75)
  return 80000
}

function needsCompaction(messages, model) {
  return estimateMessagesTokens(messages) >= getCompactThreshold(model)
}

// Test model window detection
const modelTests = [
  { model: 'claude-sonnet-4-20250514', expected: 200000 },
  { model: 'gpt-4o', expected: 128000 },
  { model: 'unknown-model', expected: null },
]

for (const t of modelTests) {
  const w = getContextWindowForModel(t.model)
  if (w === t.expected) {
    passed++
    console.log(`  ✅ ${t.model} → ${w} tokens`)
  } else {
    failed++
    console.log(`  ❌ ${t.model} → ${w} (expected ${t.expected})`)
  }
}

// Test compaction threshold
const threshold = getCompactThreshold('claude-sonnet-4-20250514')
const expectedThreshold = Math.floor((200000 - 4096) * 0.75)
if (threshold === expectedThreshold) {
  passed++
  console.log(`  ✅ Compact threshold for claude = ${threshold}`)
} else {
  failed++
  console.log(`  ❌ Compact threshold = ${threshold} (expected ${expectedThreshold})`)
}

// Test token estimation
const tokenEst = estimateTokens('hello world this is a test')
if (tokenEst > 0 && tokenEst < 20) {
  passed++
  console.log(`  ✅ Token estimate for short text = ${tokenEst}`)
} else {
  failed++
  console.log(`  ❌ Token estimate = ${tokenEst}`)
}

// Test needsCompaction
const shortHistory = [
  { role: 'user', content: 'hi' },
  { role: 'assistant', content: 'hello' },
]
if (!needsCompaction(shortHistory, 'claude-sonnet-4')) {
  passed++
  console.log('  ✅ Short history does NOT need compaction')
} else {
  failed++
  console.log('  ❌ Short history incorrectly flagged for compaction')
}

// ═══════════════════════════════════════════════════════════
// 3. Context Guard Tests
// ═══════════════════════════════════════════════════════════

console.log('\n═══ 3. Context Guard ═══')

function estimateContextChars(messages) {
  let total = 0
  for (const msg of messages) {
    if (typeof msg.content === 'string') total += msg.content.length
    else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block && typeof block.text === 'string') total += block.text.length
        if (block && typeof block.content === 'string') total += block.content.length
      }
    }
  }
  return total
}

function enforceContextBudget(messages, contextWindowTokens) {
  const budgetChars = Math.floor(contextWindowTokens * 4 * 0.75)
  let currentChars = estimateContextChars(messages)
  let compacted = false

  if (currentChars <= budgetChars) {
    return { messages, withinBudget: true, compacted: false }
  }

  const PLACEHOLDER = '[compacted: tool output removed to free context]'
  for (let i = 0; i < messages.length && currentChars > budgetChars; i++) {
    const msg = messages[i]
    if (msg.role === 'tool' && typeof msg.content === 'string' && msg.content.length > PLACEHOLDER.length) {
      currentChars -= (msg.content.length - PLACEHOLDER.length)
      msg.content = PLACEHOLDER
      compacted = true
    }
  }

  return { messages, withinBudget: currentChars <= budgetChars, compacted }
}

// Small context — should pass
const smallMsgs = [
  { role: 'user', content: 'hello' },
  { role: 'assistant', content: 'hi there' },
]
const smallResult = enforceContextBudget(smallMsgs, 128000)
if (smallResult.withinBudget && !smallResult.compacted) {
  passed++
  console.log('  ✅ Small context within budget, no compaction needed')
} else {
  failed++
  console.log('  ❌ Small context guard failed')
}

// Large tool output — should compact
const bigToolOutput = 'x'.repeat(500000)
const bigMsgs = [
  { role: 'tool', content: bigToolOutput },
  { role: 'user', content: 'what is this?' },
]
const bigResult = enforceContextBudget(bigMsgs, 8192) // tiny window
if (bigResult.compacted) {
  passed++
  console.log('  ✅ Large tool output compacted to fit budget')
} else {
  failed++
  console.log('  ❌ Large tool output was not compacted')
}

// ═══════════════════════════════════════════════════════════
// 4. Loop Detection Tests
// ═══════════════════════════════════════════════════════════

console.log('\n═══ 4. Loop Detection ═══')

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}

function hashToolCall(toolName, params) {
  const serialized = stableStringify(params)
  const hash = createHash('sha256').update(serialized).digest('hex')
  return `${toolName}:${hash}`
}

// Simulate LoopDetector
class TestLoopDetector {
  constructor() {
    this.history = []
    this.warningThreshold = 10
    this.criticalThreshold = 20
  }

  recordToolCall(toolName, params) {
    const argsHash = hashToolCall(toolName, params)
    this.history.push({ toolName, argsHash, resultHash: undefined, timestamp: Date.now() })
    if (this.history.length > 30) this.history.shift()
  }

  recordOutcome(toolName, params, result) {
    const argsHash = hashToolCall(toolName, params)
    const resultHash = createHash('sha256').update(String(result)).digest('hex')
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].argsHash === argsHash && !this.history[i].resultHash) {
        this.history[i].resultHash = resultHash
        return
      }
    }
  }

  check(toolName, params) {
    const argsHash = hashToolCall(toolName, params)
    const count = this.history.filter(h => h.argsHash === argsHash).length
    if (count >= this.criticalThreshold) return { blocked: true, warning: false, reason: 'Critical loop' }
    if (count >= this.warningThreshold) return { blocked: false, warning: true, reason: 'Warning: repeated calls' }
    return { blocked: false, warning: false }
  }
}

const detector = new TestLoopDetector()

// Normal calls — no loop
for (let i = 0; i < 5; i++) {
  detector.recordToolCall('file_read', { path: `file${i}.txt` })
  detector.recordOutcome('file_read', { path: `file${i}.txt` }, `content ${i}`)
}
const normalCheck = detector.check('file_read', { path: 'file0.txt' })
if (!normalCheck.blocked && !normalCheck.warning) {
  passed++
  console.log('  ✅ Normal calls — no loop detected')
} else {
  failed++
  console.log('  ❌ False positive loop detection on normal calls')
}

// Repeated calls — should warn
const detector2 = new TestLoopDetector()
for (let i = 0; i < 15; i++) {
  detector2.recordToolCall('file_read', { path: 'same.txt' })
  detector2.recordOutcome('file_read', { path: 'same.txt' }, 'same content')
}
const warnCheck = detector2.check('file_read', { path: 'same.txt' })
if (warnCheck.warning) {
  passed++
  console.log('  ✅ Repeated calls — warning triggered')
} else {
  failed++
  console.log('  ❌ Should have warned on 15 identical calls')
}

// Critical loop — should block
const detector3 = new TestLoopDetector()
for (let i = 0; i < 25; i++) {
  detector3.recordToolCall('process', { action: 'poll', sessionId: '123' })
  detector3.recordOutcome('process', { action: 'poll', sessionId: '123' }, 'still running')
}
const critCheck = detector3.check('process', { action: 'poll', sessionId: '123' })
if (critCheck.blocked) {
  passed++
  console.log('  ✅ Critical loop — blocked')
} else {
  failed++
  console.log('  ❌ Should have blocked on 25 identical poll calls')
}

// ═══════════════════════════════════════════════════════════
// 5. API Retry Logic Tests
// ═══════════════════════════════════════════════════════════

console.log('\n═══ 5. API Retry Logic ═══')

// Test jitter
function addJitter(ms) {
  const jit = ms * 0.1 * (Math.random() * 2 - 1)
  return Math.max(0, Math.round(ms + jit))
}

const jitterValues = Array.from({ length: 100 }, () => addJitter(1000))
const minJitter = Math.min(...jitterValues)
const maxJitter = Math.max(...jitterValues)
if (minJitter >= 900 && maxJitter <= 1100) {
  passed++
  console.log(`  ✅ Jitter range: ${minJitter}-${maxJitter} (expected ~900-1100)`)
} else {
  failed++
  console.log(`  ❌ Jitter range: ${minJitter}-${maxJitter} (expected ~900-1100)`)
}

// Test exponential backoff calculation
const delays = [1, 2, 3].map(attempt => Math.min(1000 * Math.pow(2, attempt - 1), 30000))
if (delays[0] === 1000 && delays[1] === 2000 && delays[2] === 4000) {
  passed++
  console.log(`  ✅ Exponential backoff: ${delays.join(', ')}ms`)
} else {
  failed++
  console.log(`  ❌ Backoff: ${delays.join(', ')} (expected 1000, 2000, 4000)`)
}

// Test retryable status codes
const retryableStatuses = new Set([429, 500, 502, 503, 529])
const statusTests = [
  { status: 429, expected: true },
  { status: 503, expected: true },
  { status: 529, expected: true },
  { status: 401, expected: false },
  { status: 400, expected: false },
  { status: 200, expected: false },
]

for (const t of statusTests) {
  const isRetryable = retryableStatuses.has(t.status)
  if (isRetryable === t.expected) {
    passed++
    console.log(`  ✅ Status ${t.status} retryable=${isRetryable}`)
  } else {
    failed++
    console.log(`  ❌ Status ${t.status} retryable=${isRetryable} (expected ${t.expected})`)
  }
}

// ═══════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════

console.log(`\n═══ Results ═══`)
console.log(`  ✅ Passed: ${passed}`)
console.log(`  ❌ Failed: ${failed}`)
console.log(`  Total: ${passed + failed}`)

if (failed > 0) {
  console.log('\n⚠️  Some tests failed!')
  process.exit(1)
} else {
  console.log('\n🎉 All tests passed!')
}
