// skill-executor.ts — Execute skill scripts
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSkillMetadata } from './skill-parser';

export interface SkillExecutionContext {
  skillsDir: string;
  workspaceDir: string;
  env?: Record<string, string>;
}

export async function executeSkill(
  skillName: string,
  args: string[],
  context: SkillExecutionContext
): Promise<string> {
  const skillDir = path.join(context.skillsDir, skillName);
  const metadata = loadSkillMetadata(skillDir);

  if (!metadata) {
    return `Error: Skill '${skillName}' not found`;
  }

  // Auto-detect script: run.sh > run.py
  let scriptPath: string;
  let interpreter: string;

  const shPath = path.join(skillDir, 'run.sh');
  const pyPath = path.join(skillDir, 'run.py');

  try {
    await fs.access(shPath);
    scriptPath = shPath;
    interpreter = 'bash';
  } catch {
    try {
      await fs.access(pyPath);
      scriptPath = pyPath;
      interpreter = 'python3';
    } catch {
      return `Error: Skill '${skillName}' missing run.sh/run.py`;
    }
  }

  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)
    ),
    SKILL_DIR: skillDir,
    WORKSPACE_DIR: context.workspaceDir,
    ...context.env
  };

  if (metadata.primaryEnv && context.env?.[metadata.primaryEnv]) {
    env[metadata.primaryEnv] = context.env[metadata.primaryEnv];
  }

  return new Promise((resolve) => {
    const proc = spawn(interpreter, [scriptPath, ...args], {
      cwd: skillDir,
      timeout: 60000,
      env
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
      resolve(code === 0 ? output : `Skill failed (exit ${code}):\n${output}`);
    });

    proc.on('error', (error) => {
      resolve(`Error executing skill: ${error.message}`);
    });
  });
}
