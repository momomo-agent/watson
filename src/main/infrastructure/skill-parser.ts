// skill-parser.ts — Frontmatter parser for SKILL.md
import * as fs from 'fs';
import * as path from 'path';

export interface SkillMetadata {
  name: string;
  description: string;
  path: string;
  install?: Array<{
    kind: 'npm' | 'pip' | 'brew' | 'go' | 'uv';
    package?: string;
    formula?: string;
    module?: string;
    bins?: string[];
  }>;
  primaryEnv?: string;
  requires?: string[];
  os?: string[];
  always?: boolean;
  frontmatter: Record<string, any>;
  body: string;
}

export function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  content = content.replace(/\r\n?/g, '\n');
  const lines = content.split('\n');

  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      if (startIdx === -1) {
        startIdx = i;
      } else {
        endIdx = i;
        break;
      }
    }
  }

  if (startIdx === -1 || endIdx === -1) {
    return { frontmatter: {}, body: content };
  }

  const fmLines = lines.slice(startIdx + 1, endIdx);
  const body = lines.slice(endIdx + 1).join('\n');

  const frontmatter: Record<string, any> = {};
  let currentKey: string | null = null;
  let currentValue = '';

  const commitKV = () => {
    if (currentKey !== null) {
      const val = currentValue.trim();
      frontmatter[currentKey] = parseValue(currentKey, val);
      currentKey = null;
      currentValue = '';
    }
  };

  for (const line of fmLines) {
    if (currentKey !== null && /^(?:  |\t)/.test(line)) {
      currentValue += ' ' + line.trim();
      continue;
    }

    const match = line.match(/^([\w-]+):\s*(.*)$/);
    if (match) {
      commitKV();
      currentKey = match[1];
      currentValue = match[2];
      continue;
    }

    if (line.trim() === '') {
      commitKV();
    }
  }
  commitKV();

  return { frontmatter, body };
}

function parseValue(key: string, value: string): any {
  if (!value) return key === 'install' ? [] : '';

  if (key === 'metadata' && value.startsWith('{')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map(v => v.trim()).filter(Boolean);
  }

  if (value === 'true') return true;
  if (value === 'false') return false;

  return value;
}

export function loadSkillMetadata(skillDir: string): SkillMetadata | null {
  const skillMdPath = path.join(skillDir, 'SKILL.md');

  if (!fs.existsSync(skillMdPath)) {
    return null;
  }

  const content = fs.readFileSync(skillMdPath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);

  const metaObj = (frontmatter.metadata && typeof frontmatter.metadata === 'object')
    ? (frontmatter.metadata.watson || frontmatter.metadata.openclaw || {})
    : {};

  const get = (key: string, def?: any) => 
    metaObj[key] !== undefined ? metaObj[key] : (frontmatter[key] !== undefined ? frontmatter[key] : def);

  return {
    name: frontmatter.name || path.basename(skillDir),
    description: frontmatter.description || '',
    path: skillDir,
    install: get('install', []),
    primaryEnv: get('primaryEnv'),
    requires: get('requires', []),
    os: get('os', []),
    always: get('always', false) === true,
    frontmatter,
    body
  };
}

export function loadAllSkills(skillsDir: string): SkillMetadata[] {
  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const skills: SkillMetadata[] = [];
  const entries = fs.readdirSync(skillsDir);

  for (const entry of entries) {
    const skillDir = path.join(skillsDir, entry);
    const stat = fs.statSync(skillDir);

    if (stat.isDirectory()) {
      const metadata = loadSkillMetadata(skillDir);
      if (metadata) {
        skills.push(metadata);
      }
    }
  }

  return skills;
}
