// skill-manager.ts — Domain service for skill management
import * as path from 'path';
import { loadAllSkills, loadSkillMetadata, type SkillMetadata } from '../infrastructure/skill-parser';
import { 
  installSkillDependencies, 
  getDependencyStatus, 
  getFailedDependencies,
  resetDependencyStatus 
} from '../infrastructure/skill-installer';
import { executeSkill, type SkillExecutionContext } from '../infrastructure/skill-executor';
import type { DependencyRecord } from '../infrastructure/dependency-store';

export class SkillManager {
  private skillsDir: string;
  private workspaceDir: string;

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
    this.skillsDir = path.join(workspaceDir, '.watson', 'skills');
  }

  listSkills(): SkillMetadata[] {
    return loadAllSkills(this.skillsDir);
  }

  getSkill(name: string): SkillMetadata | null {
    const skillDir = path.join(this.skillsDir, name);
    return loadSkillMetadata(skillDir);
  }

  async installDependencies(
    skillName: string, 
    options: { force?: boolean; maxRetries?: number } = {}
  ): Promise<string> {
    const metadata = this.getSkill(skillName);
    if (!metadata) {
      return `❌ Error: Skill '${skillName}' not found`;
    }

    if (!metadata.install || metadata.install.length === 0) {
      return `✅ Skill '${skillName}' has no dependencies`;
    }

    return installSkillDependencies(metadata, options);
  }

  getDependencyStatus(skillName: string): DependencyRecord[] {
    return getDependencyStatus(skillName);
  }

  getFailedDependencies(skillName?: string): DependencyRecord[] {
    return getFailedDependencies(skillName);
  }

  resetDependency(skillName: string, identifier: string, kind: string) {
    resetDependencyStatus(skillName, identifier, kind);
  }

  async execute(skillName: string, args: string[] = [], env?: Record<string, string>): Promise<string> {
    const context: SkillExecutionContext = {
      skillsDir: this.skillsDir,
      workspaceDir: this.workspaceDir,
      env
    };

    return executeSkill(skillName, args, context);
  }
}
