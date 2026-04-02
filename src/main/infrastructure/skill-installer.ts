// skill-installer.ts — Dependency installer for skills
import { spawn } from 'child_process';
import { execSync } from 'child_process';
import type { SkillMetadata } from './skill-parser';

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function installDependency(spec: any): Promise<string> {
  const { kind, formula, package: pkg, module: mod, bins = [] } = spec;

  if (bins && bins.length > 0) {
    const allExist = bins.every((bin: string) => commandExists(bin));
    if (allExist) {
      return `Already installed: ${bins.join(', ')}`;
    }
  }

  let cmd = '';
  let description = '';

  switch (kind) {
    case 'brew':
      cmd = `brew install ${formula}`;
      description = `Installing ${formula} via Homebrew`;
      break;
    case 'npm':
      cmd = `npm install -g --ignore-scripts ${pkg}`;
      description = `Installing ${pkg} globally via npm`;
      break;
    case 'pip':
      cmd = `pip3 install ${pkg}`;
      description = `Installing ${pkg} via pip`;
      break;
    case 'go':
      cmd = `go install ${mod}`;
      description = `Installing ${mod} via go install`;
      break;
    case 'uv':
      cmd = `uv tool install ${pkg}`;
      description = `Installing ${pkg} via uv`;
      break;
    default:
      return `Error: Unknown install kind: ${kind}`;
  }

  return new Promise((resolve) => {
    const proc = spawn(cmd, { shell: true, timeout: 120000 });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(`${description}\n${stdout}`);
      } else {
        resolve(`Failed: ${description}\n${stderr || stdout}`);
      }
    });

    proc.on('error', (error) => {
      resolve(`Error: ${error.message}`);
    });
  });
}

export async function installSkillDependencies(metadata: SkillMetadata): Promise<string> {
  if (!metadata.install || metadata.install.length === 0) {
    return 'No dependencies to install';
  }

  const results: string[] = [];
  for (const spec of metadata.install) {
    const result = await installDependency(spec);
    results.push(result);
  }

  return results.join('\n\n');
}
