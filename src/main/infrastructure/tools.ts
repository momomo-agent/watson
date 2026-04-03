export const BUILTIN_TOOLS = [
  {
    name: 'file_read',
    description: 'Read a file from the workspace. Use offset/limit for large files.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file' },
        offset: { type: 'number', description: 'Line number to start reading from (1-indexed)' },
        limit: { type: 'number', description: 'Maximum number of lines to read' }
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
    description: 'Search the web using Tavily API.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        max_results: { type: 'number', description: 'Maximum number of results (default: 5)' }
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
    name: 'ui_status_set',
    description: 'Set the status displayed in the UI. Level: idle/thinking/running/need_you/done. Text: 4-20 chars.',
    input_schema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['idle', 'thinking', 'running', 'need_you', 'done'], description: 'Status level' },
        text: { type: 'string', description: 'Status text (4-20 characters)' }
      },
      required: ['level', 'text']
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
