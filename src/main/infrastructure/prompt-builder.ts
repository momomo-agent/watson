/**
 * System Prompt Builder — Infrastructure Layer
 * 
 * Builds system prompt from workspace files + tool descriptions + context.
 * Supports two-tier tool loading: core tools (full description) + deferred tools (name+hint).
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

interface Tool {
  name: string
  description: string
  input_schema?: any
}

interface DeferredToolHint {
  name: string
  hint: string
}

export function buildSystemPrompt(
  workspacePath: string,
  tools: Tool[] = [],
  deferredTools: DeferredToolHint[] = [],
): string {
  const parts: string[] = []

  // 1. Identity
  parts.push(`You are Watson — a local-first AI assistant.

## Tool Call Style
Call tools directly without narration for routine operations.
Narrate only for: multi-step work, complex problems, sensitive actions, or when explicitly asked.`)

  // 2. Loaded Tools
  if (tools.length > 0) {
    const toolList = tools.map(t => `- **${t.name}**: ${t.description}`).join('\n')
    parts.push(`## Available Tools\n${toolList}`)
  }

  // 3. Deferred Tools
  if (deferredTools.length > 0) {
    const deferredList = deferredTools.map(t => `- ${t.name} — ${t.hint}`).join('\n')
    parts.push(`## Additional Tools (use tool_search to load before calling)
The following tools are available but not yet loaded. Use \`tool_search\` with their name or a keyword to load them first.

${deferredList}`)
  }

  // 4. Workspace
  parts.push(`## Workspace\nYour working directory: ${workspacePath}`)

  // 5. Project Context
  parts.push(`# Project Context`)

  // Read workspace files
  const files = ['SOUL.md', 'AGENTS.md', 'USER.md']
  for (const file of files) {
    const filePath = path.join(workspacePath, file)
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8')
      parts.push(`## ${file}\n${content}`)
    }
  }

  // 6. Runtime
  parts.push(`## Runtime\nhost=${os.hostname()} | os=${os.type()} ${os.release()} | node=${process.version}`)

  return parts.join('\n\n---\n\n')
}
