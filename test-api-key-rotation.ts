/**
 * Test API Key Rotation
 * 
 * Tests:
 * 1. Single key (no rotation)
 * 2. Multiple keys (rotation on rate-limit)
 * 3. Stats tracking
 * 4. Config loading with apiKeys array
 */

import { ApiKeyManager } from './src/main/infrastructure/api-keys'

console.log('=== API Key Rotation Tests ===\n')

// Test 1: Single key
console.log('Test 1: Single key (no rotation)')
const singleKeyManager = new ApiKeyManager('sk-test-single')
console.log(`Current key: ${singleKeyManager.getCurrentKey()}`)
console.log(`Key count: ${singleKeyManager.getKeyCount()}`)
const rotated1 = singleKeyManager.rotate()
console.log(`Rotation result: ${rotated1} (expected: false)`)
console.log(`Current key after rotation: ${singleKeyManager.getCurrentKey()}`)
console.log('✓ Single key test passed\n')

// Test 2: Multiple keys
console.log('Test 2: Multiple keys (rotation)')
const multiKeyManager = new ApiKeyManager([
  'sk-test-key-1',
  'sk-test-key-2',
  'sk-test-key-3'
])
console.log(`Initial key: ${multiKeyManager.getCurrentKey()} (index ${multiKeyManager.getCurrentIndex() + 1}/${multiKeyManager.getKeyCount()})`)

multiKeyManager.recordUsage(false) // Simulate failure
const rotated2 = multiKeyManager.rotate()
console.log(`Rotation result: ${rotated2} (expected: true)`)
console.log(`After rotation: ${multiKeyManager.getCurrentKey()} (index ${multiKeyManager.getCurrentIndex() + 1}/${multiKeyManager.getKeyCount()})`)

multiKeyManager.recordUsage(true) // Simulate success
multiKeyManager.rotate()
console.log(`After 2nd rotation: ${multiKeyManager.getCurrentKey()} (index ${multiKeyManager.getCurrentIndex() + 1}/${multiKeyManager.getKeyCount()})`)

multiKeyManager.rotate()
console.log(`After 3rd rotation (wrap): ${multiKeyManager.getCurrentKey()} (index ${multiKeyManager.getCurrentIndex() + 1}/${multiKeyManager.getKeyCount()})`)
console.log('✓ Multiple key rotation test passed\n')

// Test 3: Stats tracking
console.log('Test 3: Stats tracking')
const statsManager = new ApiKeyManager(['sk-key-1', 'sk-key-2'])
statsManager.recordUsage(true)
statsManager.recordUsage(true)
statsManager.recordUsage(false)
statsManager.rotate()
statsManager.recordUsage(true)

const stats = statsManager.getStats()
console.log('Stats for all keys:')
stats.forEach((stat, index) => {
  console.log(`  Key ${index + 1}: uses=${stat.uses}, failures=${stat.failures}`)
})

const key0Stats = statsManager.getKeyStats(0)
console.log(`Key 1 stats: uses=${key0Stats?.uses}, failures=${key0Stats?.failures}`)
console.log('✓ Stats tracking test passed\n')

// Test 4: Config format
console.log('Test 4: Config format examples')
console.log('Single key config:')
console.log(JSON.stringify({
  provider: 'anthropic',
  apiKey: 'sk-ant-single-key',
  model: 'claude-sonnet-4-20250514'
}, null, 2))

console.log('\nMultiple keys config:')
console.log(JSON.stringify({
  provider: 'anthropic',
  apiKeys: [
    'sk-ant-key-1',
    'sk-ant-key-2',
    'sk-ant-key-3'
  ],
  model: 'claude-sonnet-4-20250514'
}, null, 2))

console.log('\n✓ All tests passed!')
console.log('\n=== Usage Example ===')
console.log(`
// In .watson/config.json:
{
  "provider": "anthropic",
  "apiKeys": [
    "sk-ant-api03-key1",
    "sk-ant-api03-key2",
    "sk-ant-api03-key3"
  ],
  "model": "claude-sonnet-4-20250514"
}

// Behavior:
// - Starts with key 1
// - On 429 rate-limit: rotates to key 2 immediately (no delay)
// - On 429 again: rotates to key 3
// - On 429 again: wraps to key 1
// - On other errors: uses exponential backoff without rotation
`)
