// skill-tools.ts — Skill tools for Watson
import { SkillManager } from '../domain/skill-manager';

export function createSkillTools(workspaceDir: string) {
  const skillManager = new SkillManager(workspaceDir);

  return {
    skill_list: {
      description: 'List all available skills',
      parameters: { type: 'object', properties: {} },
      handler: async () => {
        const skills = skillManager.listSkills();
        if (skills.length === 0) {
          return 'No skills found';
        }
        return skills.map(s => `${s.name}: ${s.description}`).join('\n');
      }
    },

    skill_info: {
      description: 'Get detailed information about a skill',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill name' }
        },
        required: ['name']
      },
      handler: async (args: { name: string }) => {
        const skill = skillManager.getSkill(args.name);
        if (!skill) {
          return `Skill '${args.name}' not found`;
        }
        return JSON.stringify(skill, null, 2);
      }
    },

    skill_install: {
      description: 'Install dependencies for a skill',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill name' }
        },
        required: ['name']
      },
      handler: async (args: { name: string }) => {
        return skillManager.installDependencies(args.name);
      }
    },

    skill_exec: {
      description: 'Execute a skill script',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill name' },
          args: { type: 'array', items: { type: 'string' }, description: 'Arguments' }
        },
        required: ['name']
      },
      handler: async (args: { name: string; args?: string[] }) => {
        return skillManager.execute(args.name, args.args || []);
      }
    }
  };
}
