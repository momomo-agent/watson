import type { ToolDef } from '../domain/tool-registry'

/**
 * Watson built-in tools.
 *
 * core: true → always loaded, full schema every turn
 * shouldDefer: true → only name+hint until tool_search loads it
 * (default: core for essential tools, deferred for specialized ones)
 */
export const BUILTIN_TOOLS: ToolDef[] = [
  // ── Core: always available ───────────────────────────────────
  {
    name: 'file_read',
    description: 'Read a file from the workspace. Use offset/limit for large files.',
    searchHint: 'Read file contents with optional line range',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file' },
        offset: { type: 'number', description: 'Line number to start reading from (1-indexed)' },
        limit: { type: 'number', description: 'Maximum number of lines to read' }
      },
      required: ['path']
    },
    core: true,
    tags: ['file', 'read'],
  },
  {
    name: 'file_write',
    description: 'Write content to a file in the workspace.',
    searchHint: 'Create or overwrite a file',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file' },
        content: { type: 'string', description: 'Content to write' }
      },
      required: ['path', 'content']
    },
    core: true,
    tags: ['file', 'write'],
  },
  {
    name: 'file_edit',
    description: 'Edit a file by replacing exact text. The old_text must match exactly (including whitespace).',
    searchHint: 'Surgical find-and-replace edit in a file',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file' },
        old_text: { type: 'string', description: 'Exact text to find and replace' },
        new_text: { type: 'string', description: 'New text to replace with' }
      },
      required: ['path', 'old_text', 'new_text']
    },
    core: true,
    tags: ['file', 'edit'],
  },
  {
    name: 'shell_exec',
    description: 'Execute a shell command in the workspace.',
    searchHint: 'Run shell/terminal commands',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        background: { type: 'boolean', description: 'Run in background for long-running commands' }
      },
      required: ['command']
    },
    core: true,
    tags: ['shell', 'exec'],
  },
  {
    name: 'ui_status_set',
    description: 'Set the status displayed in the UI. Level: idle/thinking/running/need_you/done. Text: 4-20 chars.',
    searchHint: 'Update UI status indicator',
    input_schema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['idle', 'thinking', 'running', 'need_you', 'done'], description: 'Status level' },
        text: { type: 'string', description: 'Status text (4-20 characters)' }
      },
      required: ['level', 'text']
    },
    core: true,
    tags: ['ui'],
  },

  // ── Deferred: loaded on demand ───────────────────────────────
  {
    name: 'process',
    description: 'Manage background processes: list, poll, log, kill.',
    searchHint: 'List/poll/kill background shell processes',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'poll', 'log', 'kill'], description: 'Action to perform' },
        sessionId: { type: 'string', description: 'Session ID (for poll/log/kill)' },
        offset: { type: 'number', description: 'Log offset (for log)' },
        limit: { type: 'number', description: 'Max log lines (for log, default 50)' }
      },
      required: ['action']
    },
    shouldDefer: true,
    tags: ['shell', 'process', 'background'],
  },
  {
    name: 'web_fetch',
    description: 'Fetch and convert a web page to markdown.',
    searchHint: 'Download web page content as markdown',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        maxChars: { type: 'number', description: 'Max characters (default 50000)' }
      },
      required: ['url']
    },
    shouldDefer: true,
    tags: ['web', 'fetch', 'url'],
  },
  {
    name: 'search',
    description: 'Search the web using Tavily API.',
    searchHint: 'Web search via Tavily',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        max_results: { type: 'number', description: 'Maximum number of results (default: 5)' }
      },
      required: ['query']
    },
    shouldDefer: true,
    tags: ['web', 'search'],
  },
  {
    name: 'code_exec',
    description: 'Execute code snippet.',
    searchHint: 'Run JS/Python/Bash code snippets',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Code to execute' },
        language: { type: 'string', description: 'Language (js/python/bash)' }
      },
      required: ['code']
    },
    shouldDefer: true,
    tags: ['code', 'exec', 'run'],
  },
  {
    name: 'notify',
    description: 'Show a system notification.',
    searchHint: 'macOS system notification',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Notification title' },
        message: { type: 'string', description: 'Notification message' }
      },
      required: ['message']
    },
    shouldDefer: true,
    tags: ['ui', 'notification'],
  },
  {
    name: 'screen_sense',
    description: 'Get content from the user\'s current screen.',
    searchHint: 'Capture and analyze current screen content',
    input_schema: {
      type: 'object',
      properties: {}
    },
    shouldDefer: true,
    tags: ['screen', 'sense', 'vision'],
  },
  {
    name: 'coding_agent',
    description: 'Delegate coding tasks to a sub-agent (Claude Code).',
    searchHint: 'Delegate complex coding tasks to Claude Code',
    input_schema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Coding task description' },
        workdir: { type: 'string', description: 'Working directory (optional)' }
      },
      required: ['task']
    },
    shouldDefer: true,
    tags: ['code', 'agent', 'delegate'],
  },
  {
    name: 'skill_list',
    description: 'List all available skills.',
    searchHint: 'List installed skills',
    input_schema: {
      type: 'object',
      properties: {}
    },
    shouldDefer: true,
    tags: ['skill'],
  },
  {
    name: 'skill_info',
    description: 'Get detailed information about a skill.',
    searchHint: 'Get skill details and usage',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name' }
      },
      required: ['name']
    },
    shouldDefer: true,
    tags: ['skill'],
  },
  {
    name: 'skill_install',
    description: 'Install dependencies for a skill.',
    searchHint: 'Install skill dependencies',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name' }
      },
      required: ['name']
    },
    shouldDefer: true,
    tags: ['skill'],
  },
  {
    name: 'skill_exec',
    description: 'Execute a skill script.',
    searchHint: 'Run a skill by name with arguments',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name' },
        args: { type: 'array', items: { type: 'string' }, description: 'Arguments' }
      },
      required: ['name']
    },
    shouldDefer: true,
    tags: ['skill', 'exec'],
  },
]
