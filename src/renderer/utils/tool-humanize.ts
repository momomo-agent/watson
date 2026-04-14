/**
 * Tool Humanize — Translate tool calls into human-readable text
 *
 * Two levels:
 *   1. humanizeTool(name, input) → single tool description
 *   2. summarizeTools(tools[]) → group summary (e.g. "读取 3 个文件")
 */

import type { ToolCall } from '../../shared/chat-types'

// ── Icons ──

const TOOL_ICONS: Record<string, string> = {
  file_read: '📄',
  file_write: '✏️',
  file_list: '📁',
  shell_exec: '⚡',
  search: '🔍',
  code_exec: '▶️',
  notify: '🔔',
  skill_exec: '🧩',
  screen_sense: '🖥️',
  screen_act: '🖱️',
  screen_shot: '📸',
  coding_agent: '🤖',
  mcp_call: '🔌',
  web_fetch: '🌐',
  memory_search: '🧠',
}

export function toolIcon(name: string): string {
  return TOOL_ICONS[name] || '🔧'
}

// ── Single Tool ──

export function humanizeTool(name: string, input?: Record<string, any>): string {
  const i = input || {}

  switch (name) {
    case 'file_read':
      return `读取 ${shortPath(i.path)}`
    case 'file_write':
      return `写入 ${shortPath(i.path)}`
    case 'file_list':
      return `列出 ${shortPath(i.path || i.directory)}`
    case 'shell_exec':
      return `执行命令${i.command ? `: ${truncate(i.command, 40)}` : ''}`
    case 'search':
      return `搜索 "${truncate(i.query || '', 30)}"`
    case 'code_exec':
      return '运行代码'
    case 'notify':
      return '发送通知'
    case 'skill_exec':
      return `执行 ${i.skill || 'skill'}`
    case 'screen_sense':
      return '查看屏幕'
    case 'screen_act':
      return `操作屏幕${i.action ? `: ${i.action}` : ''}`
    case 'screen_shot':
      return '截图'
    case 'coding_agent':
      return `派发编码任务${i.task ? `: ${truncate(i.task, 40)}` : ''}`
    case 'mcp_call':
      return `MCP: ${i.method || i.tool || name}`
    case 'web_fetch':
      return `抓取 ${shortUrl(i.url)}`
    case 'memory_search':
      return `搜索记忆: ${truncate(i.query || '', 30)}`
    default:
      return `使用 ${name}`
  }
}

// ── Group Summary ──

export function summarizeTools(tools: ToolCall[]): string {
  if (tools.length === 0) return ''
  if (tools.length === 1) return humanizeTool(tools[0].name, tools[0].input)

  // Count by category
  const counts: Record<string, number> = {}
  for (const t of tools) {
    const cat = toolCategory(t.name)
    counts[cat] = (counts[cat] || 0) + 1
  }

  const parts: string[] = []
  if (counts['file']) parts.push(`${counts['file']} 个文件操作`)
  if (counts['shell']) parts.push(`${counts['shell']} 个命令`)
  if (counts['search']) parts.push(`${counts['search']} 次搜索`)
  if (counts['screen']) parts.push(`${counts['screen']} 次屏幕操作`)
  if (counts['other']) parts.push(`${counts['other']} 个工具`)

  return parts.join('，') || `${tools.length} 个操作`
}

// ── Helpers ──

function toolCategory(name: string): string {
  if (name.startsWith('file_')) return 'file'
  if (name === 'shell_exec' || name === 'code_exec') return 'shell'
  if (name === 'search' || name === 'memory_search' || name === 'web_fetch') return 'search'
  if (name.startsWith('screen_')) return 'screen'
  return 'other'
}

function shortPath(p?: string): string {
  if (!p) return '文件'
  const parts = p.split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : p
}

function shortUrl(url?: string): string {
  if (!url) return 'URL'
  try {
    return new URL(url).hostname
  } catch {
    return truncate(url, 30)
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}
