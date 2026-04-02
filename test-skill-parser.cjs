// test-skill-parser.cjs — Test skill parser directly
const fs = require('fs');
const path = require('path');

// Inline minimal parser for testing
function parseFrontmatter(content) {
  content = content.replace(/\r\n?/g, '\n');
  const lines = content.split('\n');
  let startIdx = -1, endIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      if (startIdx === -1) startIdx = i;
      else { endIdx = i; break; }
    }
  }

  if (startIdx === -1 || endIdx === -1) {
    return { frontmatter: {}, body: content };
  }

  const fmLines = lines.slice(startIdx + 1, endIdx);
  const body = lines.slice(endIdx + 1).join('\n');
  const frontmatter = {};

  for (const line of fmLines) {
    const match = line.match(/^([\w-]+):\s*(.*)$/);
    if (match) {
      frontmatter[match[1]] = match[2];
    }
  }

  return { frontmatter, body };
}

// Test
const skillPath = path.join(__dirname, '.watson/skills/hello-world/SKILL.md');
console.log('Testing skill parser...\n');
console.log('Reading:', skillPath);

if (fs.existsSync(skillPath)) {
  const content = fs.readFileSync(skillPath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);
  
  console.log('\nFrontmatter:');
  console.log(JSON.stringify(frontmatter, null, 2));
  console.log('\nBody preview:');
  console.log(body.substring(0, 100));
  console.log('\n✅ Parser works!');
} else {
  console.log('❌ Skill file not found');
}
