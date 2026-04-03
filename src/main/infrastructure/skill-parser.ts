// skill-parser.ts — Frontmatter parser for SKILL.md
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

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

  const fmText = lines.slice(startIdx + 1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n');

  try {
    const frontmatter = yaml.load(fmText) as Record<string, any> || {};
    return { frontmatter, body };
  } catch (error) {
    console.error('Failed to parse frontmatter:', error);
    return { frontmatter: {}, body: content };
  }
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
