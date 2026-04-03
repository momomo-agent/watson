// skill-installer.ts — Dependency installer for skills with state tracking
import { spawn } from 'child_process';
import { execSync } from 'child_process';
import type { SkillMetadata } from './skill-parser';
import { DependencyStore, type DependencyRecord } from './dependency-store';

const store = new DependencyStore();

interface InstallResult {
  success: boolean;
  message: string;
  error?: string;
  skipped?: boolean;
}

interface InstallSpec {
  kind: 'npm' | 'pip' | 'brew' | 'go' | 'uv';
  formula?: string;
  package?: string;
  module?: string;
  bins?: string[];
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getIdentifier(spec: InstallSpec): string {
  return spec.formula || spec.package || spec.module || '';
}

function classifyError(stderr: string, exitCode: number): string {
  const lower = stderr.toLowerCase();
  
  if (lower.includes('permission denied') || lower.includes('eacces')) {
    return 'permission_error';
  }
  
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('econnrefused')) {
    return 'network_error';
  }
  
  if (lower.includes('not found') || lower.includes('no such') || exitCode === 127) {
    return 'command_not_found';
  }
  
  if (lower.includes('already installed') || lower.includes('requirement already satisfied')) {
    return 'already_installed';
  }
  
  if (lower.includes('conflict') || lower.includes('incompatible')) {
    return 'dependency_conflict';
  }
  
  return 'unknown_error';
}

async function installDependency(
  skillName: string,
  spec: InstallSpec,
  maxRetries: number = 2
): Promise<InstallResult> {
  const identifier = getIdentifier(spec);
  const { kind, bins = [] } = spec;

  // Check if already installed via bins
  if (bins.length > 0) {
    const allExist = bins.every((bin: string) => commandExists(bin));
    if (allExist) {
      // Update store
      store.upsertDependency({
        skillName,
        kind,
        identifier,
        status: 'installed',
        installedAt: Date.now(),
        lastAttemptAt: Date.now(),
        attemptCount: 0,
        bins
      });
      
      return {
        success: true,
        message: `✅ Already installed: ${bins.join(', ')}`,
        skipped: true
      };
    }
  }

  // Check store for previous installation
  const depId = `${skillName}:${kind}:${identifier}`;
  const existing = store.getDependency(depId);
  
  if (existing?.status === 'installed' && existing.installedAt) {
    const age = Date.now() - existing.installedAt;
    if (age < 24 * 60 * 60 * 1000) { // Less than 24 hours
      return {
        success: true,
        message: `✅ Recently installed: ${identifier}`,
        skipped: true
      };
    }
  }

  // Build install command
  let cmd = '';
  let description = '';

  switch (kind) {
    case 'brew':
      cmd = `brew install ${spec.formula}`;
      description = `Installing ${spec.formula} via Homebrew`;
      break;
    case 'npm':
      cmd = `npm install -g --ignore-scripts ${spec.package}`;
      description = `Installing ${spec.package} globally via npm`;
      break;
    case 'pip':
      cmd = `pip3 install ${spec.package}`;
      description = `Installing ${spec.package} via pip`;
      break;
    case 'go':
      cmd = `go install ${spec.module}`;
      description = `Installing ${spec.module} via go install`;
      break;
    case 'uv':
      cmd = `uv tool install ${spec.package}`;
      description = `Installing ${spec.package} via uv`;
      break;
    default:
      return {
        success: false,
        message: `❌ Unknown install kind: ${kind}`,
        error: 'invalid_kind'
      };
  }

  // Attempt installation with retries
  let lastError = '';
  let attemptCount = existing?.attemptCount || 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attemptCount++;
    
    // Update store: installing
    store.upsertDependency({
      skillName,
      kind,
      identifier,
      status: 'installing',
      lastAttemptAt: Date.now(),
      attemptCount,
      bins
    });

    try {
      const result = await executeCommand(cmd, description);
      
      if (result.success) {
        // Update store: installed
        store.upsertDependency({
          skillName,
          kind,
          identifier,
          status: 'installed',
          installedAt: Date.now(),
          lastAttemptAt: Date.now(),
          attemptCount,
          bins
        });
        
        return {
          success: true,
          message: `✅ ${description}\n${result.stdout}`
        };
      }
      
      lastError = result.stderr || result.stdout;
      const errorType = classifyError(lastError, result.exitCode);
      
      // Don't retry on certain errors
      if (errorType === 'permission_error' || errorType === 'command_not_found') {
        break;
      }
      
      // Retry on network errors
      if (errorType === 'network_error' && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      
      break;
    } catch (error: any) {
      lastError = error.message;
      break;
    }
  }

  // Update store: failed
  store.upsertDependency({
    skillName,
    kind,
    identifier,
    status: 'failed',
    lastAttemptAt: Date.now(),
    attemptCount,
    lastError,
    bins
  });

  return {
    success: false,
    message: `❌ Failed: ${description}`,
    error: lastError
  };
}

async function executeCommand(
  cmd: string,
  description: string
): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, { shell: true, timeout: 120000 });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        stdout,
        stderr,
        exitCode: code || 0
      });
    });

    proc.on('error', (error) => {
      resolve({
        success: false,
        stdout: '',
        stderr: error.message,
        exitCode: -1
      });
    });
  });
}

export async function installSkillDependencies(
  metadata: SkillMetadata,
  options: { force?: boolean; maxRetries?: number } = {}
): Promise<string> {
  if (!metadata.install || metadata.install.length === 0) {
    return '✅ No dependencies to install';
  }

  const results: string[] = [];
  const { force = false, maxRetries = 2 } = options;

  for (const spec of metadata.install) {
    const result = await installDependency(metadata.name, spec, maxRetries);
    
    if (result.skipped && !force) {
      results.push(result.message);
    } else if (result.success) {
      results.push(result.message);
    } else {
      results.push(`${result.message}\n${result.error || ''}`);
    }
  }

  return results.join('\n\n');
}

export function getDependencyStatus(skillName: string): DependencyRecord[] {
  return store.listDependencies(skillName);
}

export function getFailedDependencies(skillName?: string): DependencyRecord[] {
  return store.getFailedDependencies(skillName);
}

export function resetDependencyStatus(skillName: string, identifier: string, kind: string) {
  const id = `${skillName}:${kind}:${identifier}`;
  store.deleteDependency(id);
}
