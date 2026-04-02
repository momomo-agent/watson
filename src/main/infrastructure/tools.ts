export const BUILTIN_TOOLS = [
  {
    name: 'file_read',
    description: 'Read a file from the workspace.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file' }
      },
      required: ['path']
    }
  },
  {
    name: 'file_write',
    description: 'Write content to a file in the workspace.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file' },
        content: { type: 'string', description: 'Content to write' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'shell_exec',
    description: 'Execute a shell command in the workspace.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' }
      },
      required: ['command']
    }
  },
  {
    name: 'search',
    description: 'Search for information (placeholder).',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    }
  },
  {
    name: 'code_exec',
    description: 'Execute code snippet.',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Code to execute' },
        language: { type: 'string', description: 'Language (js/python/bash)' }
      },
      required: ['code']
    }
  },
  {
    name: 'notify',
    description: 'Show a system notification.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Notification title' },
        message: { type: 'string', description: 'Notification message' }
      },
      required: ['message']
    }
  },
  {
    name: 'screen_sense',
    description: 'Get content from the user\'s current screen.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'coding_agent',
    description: 'Delegate coding tasks to AWS Code agent.',
    input_schema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Coding task description' },
        workdir: { type: 'string', description: 'Working directory (optional)' }
      },
      required: ['task']
    }
  },
  {
    name: 'skill_list',
    description: 'List all available skills.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'skill_info',
    description: 'Get detailed information about a skill.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name' }
      },
      required: ['name']
    }
  },
  {
    name: 'skill_install',
    description: 'Install dependencies for a skill.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name' }
      },
      required: ['name']
    }
  },
  {
    name: 'skill_exec',
    description: 'Execute a skill script.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name' },
        args: { type: 'array', items: { type: 'string' }, description: 'Arguments' }
      },
      required: ['name']
    }
  }
]
