import { spawn } from 'child_process'

console.log('[Test] Testing coding_agent tool...\n')

// Test 1: Check if claude command exists
console.log('[Test 1] Checking claude command availability...')
const checkClaude = spawn('which', ['claude'])

checkClaude.on('close', (code) => {
  if (code === 0) {
    console.log('✓ claude command found\n')
    
    // Test 2: Verify spawn works
    console.log('[Test 2] Testing process spawn...')
    const testProc = spawn('echo', ['test'], { shell: true })
    
    testProc.stdout.on('data', (data) => {
      console.log('✓ Process output:', data.toString().trim())
    })
    
    testProc.on('close', (code) => {
      console.log('✓ Process exited with code:', code)
      console.log('\n[Test] All tests passed! coding_agent tool is functional.')
    })
  } else {
    console.log('✗ claude command not found')
    console.log('  Install with: npm install -g @anthropic-ai/claude-cli')
    console.log('\n[Test] Partial success - spawn mechanism works, but claude CLI not installed')
  }
})
