/**
 * Test: Dependency Installer with State Tracking
 * 
 * Tests:
 * 1. Frontmatter dependency parsing
 * 2. Dependency installation (brew/npm/go/uv)
 * 3. Installation state tracking
 * 4. Error handling and retry logic
 */

import { SkillManager } from './src/main/domain/skill-manager'
import { DependencyStore } from './src/main/infrastructure/dependency-store'
import { loadSkillMetadata } from './src/main/infrastructure/skill-parser'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const testWorkspace = path.join(os.tmpdir(), 'watson-test-' + Date.now())
const testSkillsDir = path.join(testWorkspace, '.watson', 'skills')

function setup() {
  console.log('🔧 Setting up test workspace:', testWorkspace)
  fs.mkdirSync(testSkillsDir, { recursive: true })
}

function cleanup() {
  console.log('🧹 Cleaning up test workspace')
  fs.rmSync(testWorkspace, { recursive: true, force: true })
}

function createTestSkill(name: string, frontmatter: string, body: string = '') {
  const skillDir = path.join(testSkillsDir, name)
  fs.mkdirSync(skillDir, { recursive: true })
  
  const content = `---
${frontmatter}
---

${body}`
  
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content)
  console.log(`✅ Created test skill: ${name}`)
}

async function test1_ParseDependencies() {
  console.log('\n📦 Test 1: Parse Frontmatter Dependencies')
  
  createTestSkill('test-brew', `
name: test-brew
description: Test Homebrew dependency
metadata:
  watson:
    install:
      - kind: brew
        formula: jq
        bins: [jq]
`)
  
  const metadata = loadSkillMetadata(path.join(testSkillsDir, 'test-brew'))
  
  if (!metadata) {
    console.error('❌ Failed to load skill metadata')
    return false
  }
  
  console.log('Parsed metadata:', JSON.stringify(metadata.install, null, 2))
  
  if (!metadata.install || metadata.install.length === 0) {
    console.error('❌ No install dependencies found')
    return false
  }
  
  const dep = metadata.install[0]
  if (dep.kind !== 'brew' || dep.formula !== 'jq') {
    console.error('❌ Dependency parsing failed')
    return false
  }
  
  console.log('✅ Test 1 passed: Dependencies parsed correctly')
  return true
}

async function test2_InstallDependency() {
  console.log('\n🔨 Test 2: Install Dependency (jq via brew)')
  
  const manager = new SkillManager(testWorkspace)
  const result = await manager.installDependencies('test-brew')
  
  console.log('Install result:', result)
  
  if (result.includes('❌')) {
    console.error('❌ Installation failed')
    return false
  }
  
  console.log('✅ Test 2 passed: Dependency installed')
  return true
}

async function test3_StateTracking() {
  console.log('\n📊 Test 3: State Tracking')
  
  const manager = new SkillManager(testWorkspace)
  const status = manager.getDependencyStatus('test-brew')
  
  console.log('Dependency status:', JSON.stringify(status, null, 2))
  
  if (status.length === 0) {
    console.error('❌ No dependency records found')
    return false
  }
  
  const record = status[0]
  if (record.status !== 'installed' && record.status !== 'failed') {
    console.error('❌ Unexpected status:', record.status)
    return false
  }
  
  console.log('✅ Test 3 passed: State tracking works')
  return true
}

async function test4_ErrorHandling() {
  console.log('\n⚠️  Test 4: Error Handling (invalid package)')
  
  createTestSkill('test-error', `
name: test-error
description: Test error handling
metadata:
  watson:
    install:
      - kind: npm
        package: this-package-definitely-does-not-exist-12345
`)
  
  const manager = new SkillManager(testWorkspace)
  const result = await manager.installDependencies('test-error')
  
  console.log('Install result:', result)
  
  const failed = manager.getFailedDependencies('test-error')
  console.log('Failed dependencies:', JSON.stringify(failed, null, 2))
  
  if (failed.length === 0) {
    console.error('❌ Failed dependency not tracked')
    return false
  }
  
  const record = failed[0]
  if (!record.lastError) {
    console.error('❌ Error message not captured')
    return false
  }
  
  console.log('✅ Test 4 passed: Error handling works')
  return true
}

async function test5_SkipInstalled() {
  console.log('\n⏭️  Test 5: Skip Already Installed')
  
  const manager = new SkillManager(testWorkspace)
  const result = await manager.installDependencies('test-brew')
  
  console.log('Install result:', result)
  
  if (!result.includes('Already installed') && !result.includes('Recently installed')) {
    console.error('❌ Should skip already installed dependency')
    return false
  }
  
  console.log('✅ Test 5 passed: Skips already installed dependencies')
  return true
}

async function test6_MultiplePackageManagers() {
  console.log('\n🔧 Test 6: Multiple Package Managers')
  
  createTestSkill('test-multi', `
name: test-multi
description: Test multiple package managers
metadata:
  watson:
    install:
      - kind: brew
        formula: jq
        bins: [jq]
      - kind: npm
        package: typescript
        bins: [tsc]
`)
  
  const manager = new SkillManager(testWorkspace)
  const result = await manager.installDependencies('test-multi')
  
  console.log('Install result:', result)
  
  const status = manager.getDependencyStatus('test-multi')
  console.log('Dependencies:', status.map(d => `${d.kind}:${d.identifier} -> ${d.status}`))
  
  if (status.length !== 2) {
    console.error('❌ Expected 2 dependencies, got', status.length)
    return false
  }
  
  console.log('✅ Test 6 passed: Multiple package managers work')
  return true
}

async function runTests() {
  console.log('🚀 Watson Smart Skills Dependency Installer Tests\n')
  
  setup()
  
  try {
    const results = [
      await test1_ParseDependencies(),
      await test2_InstallDependency(),
      await test3_StateTracking(),
      await test4_ErrorHandling(),
      await test5_SkipInstalled(),
      await test6_MultiplePackageManagers()
    ]
    
    const passed = results.filter(r => r).length
    const total = results.length
    
    console.log(`\n${'='.repeat(50)}`)
    console.log(`📊 Results: ${passed}/${total} tests passed`)
    
    if (passed === total) {
      console.log('✅ All tests passed!')
    } else {
      console.log('❌ Some tests failed')
      process.exit(1)
    }
  } catch (error) {
    console.error('💥 Test suite crashed:', error)
    process.exit(1)
  } finally {
    cleanup()
  }
}

runTests()
