// test-skill-system.cjs — Test Watson skill system
const { SkillManager } = require('./dist-electron/main/index.js');
const path = require('path');

async function test() {
  const workspaceDir = __dirname;
  const skillManager = new SkillManager(workspaceDir);

  console.log('=== Testing Watson Skill System ===\n');

  // Test 1: List skills
  console.log('1. Listing skills:');
  const skills = skillManager.listSkills();
  console.log(`Found ${skills.length} skill(s)`);
  skills.forEach(s => console.log(`  - ${s.name}: ${s.description}`));
  console.log();

  // Test 2: Get skill info
  console.log('2. Getting skill info:');
  const skill = skillManager.getSkill('hello-world');
  if (skill) {
    console.log(`  Name: ${skill.name}`);
    console.log(`  Description: ${skill.description}`);
    console.log(`  Path: ${skill.path}`);
  } else {
    console.log('  Skill not found');
  }
  console.log();

  // Test 3: Execute skill
  console.log('3. Executing skill:');
  try {
    const result = await skillManager.execute('hello-world', ['test', 'args']);
    console.log('  Result:');
    console.log(result);
  } catch (error) {
    console.error('  Error:', error.message);
  }

  console.log('\n=== Test Complete ===');
}

test().catch(console.error);
