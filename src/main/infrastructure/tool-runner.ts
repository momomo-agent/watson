import { McpManager } from './mcp-manager'
import { SkillManager } from '../domain/skill-manager'

export interface ToolCall {
  name: string
  input: any
}

export interface ToolResult {
  success: boolean
  output?: string
  error?: string
}

export class ToolRunner {
  private static readonly TIMEOUT_MS = 30000 // 30 seconds
  private static mcpManager: McpManager | null = null
  private static skillManager: SkillManager | null = null

  static setMcpManager(manager: McpManager) {
    this.mcpManager = manager
  }

  static setSkillManager(manager: SkillManager) {
    this.skillManager = manager
  }

  static async execute(tool: ToolCall, options: { signal: AbortSignal, workspacePath: string }): Promise<ToolResult> {
    const timeoutPromise = new Promise<ToolResult>((_, reject) => 
      setTimeout(() => reject(new Error(`Tool ${tool.name} timed out after ${this.TIMEOUT_MS}ms`)), this.TIMEOUT_MS)
    )

    try {
      return await Promise.race([
        this.executeInternal(tool, options),
        timeoutPromise
      ])
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private static async executeInternal(tool: ToolCall, options: { signal: AbortSignal, workspacePath: string }): Promise<ToolResult> {
    // Check if it's an MCP tool
    if (this.mcpManager?.isMcpTool(tool.name)) {
      try {
        const output = await this.mcpManager.callTool(tool.name, tool.input)
        return { success: true, output }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }

    switch (tool.name) {
      case 'file_read':
        return this.fileRead(tool.input, options)
      case 'file_write':
        return this.fileWrite(tool.input, options)
      case 'shell_exec':
        return this.shellExec(tool.input, options)
      case 'notify':
        return this.notify(tool.input)
      case 'search':
        return this.search(tool.input, options)
      case 'code_exec':
        return this.codeExec(tool.input, options)
      case 'ui_status_set':
        return this.uiStatusSet(tool.input)
      case 'skill_exec':
        return this.skillExec(tool.input, options)
      case 'skill_list':
        return this.skillList(tool.input, options)
      case 'skill_info':
        return this.skillInfo(tool.input, options)
      case 'skill_install':
        return this.skillInstall(tool.input, options)
      case 'screen_sense':
        return this.screenSense(tool.input)
      case 'coding_agent':
        return this.codingAgent(tool.input, options)
      default:
        return { success: false, error: `Unknown tool: ${tool.name}` }
    }
  }

  private static async fileRead(input: any, options: any): Promise<ToolResult> {
    try {
      const { readFileSync, existsSync, statSync } = await import('fs')
      const { resolve, isAbsolute } = await import('path')
      
      const fullPath = isAbsolute(input.path) 
        ? input.path 
        : resolve(options.workspacePath, input.path)
      
      if (!existsSync(fullPath)) {
        return { success: false, error: `File not found: ${input.path}` }
      }
      
      const stat = statSync(fullPath)
      if (!stat.isFile()) {
        return { success: false, error: `Not a file: ${input.path}` }
      }
      
      const content = readFileSync(fullPath, 'utf8')
      
      // Handle offset/limit for large files
      if (input.offset || input.limit) {
        const lines = content.split('\n')
        const start = Math.max(0, (input.offset || 1) - 1)
        const count = input.limit || lines.length
        const slice = lines.slice(start, start + count)
        const remaining = lines.length - start - slice.length
        let result = slice.join('\n')
        if (remaining > 0) {
          result += `\n\n[${remaining} more lines. Use offset=${start + slice.length + 1} to continue.]`
        }
        return { success: true, output: result }
      }
      
      // Truncate large files
      const MAX_CHARS = 100000
      if (content.length > MAX_CHARS) {
        const lines = content.split('\n')
        const truncated = content.slice(0, MAX_CHARS)
        const truncLines = truncated.split('\n').length
        return { 
          success: true, 
          output: truncated + `\n\n[Truncated at ${MAX_CHARS} chars, ${lines.length} total lines. Use offset/limit for the rest.]`
        }
      }
      
      return { success: true, output: content }
    } catch (error: any) {
      return { success: false, error: `Read failed: ${error.message}` }
    }
  }

  private static async fileWrite(input: any, options: any): Promise<ToolResult> {
    try {
      const { writeFileSync, mkdirSync, accessSync, constants } = await import('fs')
      const { resolve, dirname, isAbsolute } = await import('path')
      
      const fullPath = isAbsolute(input.path)
        ? input.path
        : resolve(options.workspacePath, input.path)
      
      const dir = dirname(fullPath)
      
      // 创建目录
      mkdirSync(dir, { recursive: true })
      
      // 权限检查
      try {
        accessSync(dir, constants.W_OK)
      } catch {
        return { success: false, error: `No write permission: ${dir}` }
      }
      
      writeFileSync(fullPath, input.content, 'utf8')
      return { success: true, output: `Wrote ${input.content.length} bytes to ${input.path}` }
    } catch (error: any) {
      return { success: false, error: `Write failed: ${error.message}` }
    }
  }

  private static async shellExec(input: any, options: any): Promise<ToolResult> {
    return new Promise((resolve) => {
      const { spawn } = require('child_process')
      
      const env = { ...process.env, ...(input.env || {}) }
      const timeout = input.timeout || 30000
      
      const proc = spawn('sh', ['-c', input.command], {
        cwd: options.workspacePath,
        env,
      })
      
      let stdout = ''
      let stderr = ''
      let killed = false
      
      const timer = setTimeout(() => {
        killed = true
        proc.kill('SIGTERM')
        setTimeout(() => proc.kill('SIGKILL'), 5000)
      }, timeout)
      
      proc.stdout.on('data', (data: any) => { stdout += data.toString() })
      proc.stderr.on('data', (data: any) => { stderr += data.toString() })
      
      proc.on('close', (code: number) => {
        clearTimeout(timer)
        if (killed) {
          resolve({ success: false, error: `Command timed out after ${timeout}ms` })
        } else if (code === 0) {
          resolve({ success: true, output: stdout })
        } else {
          resolve({ success: false, error: stderr || `Exit code ${code}` })
        }
      })
      
      proc.on('error', (err: any) => {
        clearTimeout(timer)
        resolve({ success: false, error: err.message })
      })
      
      options.signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        proc.kill('SIGTERM')
        setTimeout(() => proc.kill('SIGKILL'), 5000)
      })
    })
  }

  private static async notify(input: any): Promise<ToolResult> {
    try {
      const { Notification } = await import('electron')
      const notification = new Notification({
        title: input.title || 'Watson',
        body: input.message || '',
        silent: input.silent || false
      })
      notification.show()
      return { success: true, output: 'Notification sent' }
    } catch (error: any) {
      return { success: false, error: `Notification failed: ${error.message}` }
    }
  }

  private static async search(input: any, options: any): Promise<ToolResult> {
    try {
      const apiKey = process.env.TAVILY_API_KEY
      
      if (!apiKey) {
        return { success: false, error: 'TAVILY_API_KEY not set' }
      }
      
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: input.query,
          max_results: input.max_results || 5,
          include_answer: true
        })
      })
      
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` }
      }
      
      const data = await response.json()
      let result = ''
      
      if (data.answer) {
        result += `Answer: ${data.answer}\n\n`
      }
      
      if (data.results?.length > 0) {
        result += 'Results:\n'
        data.results.forEach((r: any, i: number) => {
          result += `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content}\n\n`
        })
      }
      
      return { success: true, output: result || 'No results found' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private static async codeExec(input: any, options: any): Promise<ToolResult> {
    try {
      const { writeFileSync, unlinkSync } = await import('fs')
      const { join } = await import('path')
      const { execSync } = await import('child_process')
      
      const lang = input.language || 'javascript'
      const code = input.code
      const timeout = input.timeout || 30000
      
      let cmd: string
      let tmpFile: string
      const tmpId = `watson-${Date.now()}-${Math.random().toString(36).slice(2)}`
      
      if (lang === 'javascript' || lang === 'js') {
        tmpFile = join('/tmp', `${tmpId}.js`)
        writeFileSync(tmpFile, code, 'utf8')
        cmd = `node ${tmpFile}`
      } else if (lang === 'python' || lang === 'py') {
        tmpFile = join('/tmp', `${tmpId}.py`)
        writeFileSync(tmpFile, code, 'utf8')
        cmd = `python3 ${tmpFile}`
      } else if (lang === 'bash' || lang === 'sh') {
        tmpFile = join('/tmp', `${tmpId}.sh`)
        writeFileSync(tmpFile, code, 'utf8')
        cmd = `bash ${tmpFile}`
      } else {
        return { success: false, error: `Unsupported language: ${lang}` }
      }
      
      try {
        const output = execSync(cmd, {
          cwd: options.workspacePath,
          encoding: 'utf8',
          timeout,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, ...(input.env || {}) }
        })
        unlinkSync(tmpFile)
        return { success: true, output }
      } catch (error: any) {
        try { unlinkSync(tmpFile) } catch {}
        return { success: false, error: error.message }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private static async uiStatusSet(input: any): Promise<ToolResult> {
    try {
      const validLevels = ['idle', 'thinking', 'running', 'need_you', 'done']
      const level = String(input.level || 'idle')
      const text = String(input.text || '').trim()
      const minLen = 4, maxLen = 20
      
      if (!validLevels.includes(level)) {
        return { success: false, error: `Invalid level. Must be one of: ${validLevels.join(', ')}` }
      }
      
      if (text.length < minLen || text.length > maxLen) {
        return { success: false, error: `Text length must be ${minLen}-${maxLen} chars (got ${text.length})` }
      }
      
      const { BrowserWindow } = await import('electron')
      const windows = BrowserWindow.getAllWindows()
      
      if (windows.length === 0) {
        return { success: false, error: 'No window found' }
      }
      
      const win = windows[0]
      win.webContents.send('status-update', {
        level,
        text,
        timestamp: Date.now()
      })
      
      return { success: true, output: 'OK' }
    } catch (error: any) {
      return { success: false, error: `Status update failed: ${error.message}` }
    }
  }

  private static async skillExec(input: any, options: any): Promise<ToolResult> {
    if (!this.skillManager) {
      return { success: false, error: 'Skill manager not initialized' }
    }
    try {
      const output = await this.skillManager.execute(input.name, input.args || [])
      return { success: true, output }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private static async skillList(input: any, options: any): Promise<ToolResult> {
    if (!this.skillManager) {
      return { success: false, error: 'Skill manager not initialized' }
    }
    try {
      const skills = this.skillManager.listSkills()
      const output = skills.length === 0 
        ? 'No skills found'
        : skills.map(s => `${s.name}: ${s.description}`).join('\n')
      return { success: true, output }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private static async skillInfo(input: any, options: any): Promise<ToolResult> {
    if (!this.skillManager) {
      return { success: false, error: 'Skill manager not initialized' }
    }
    try {
      const skill = this.skillManager.getSkill(input.name)
      if (!skill) {
        return { success: false, error: `Skill '${input.name}' not found` }
      }
      return { success: true, output: JSON.stringify(skill, null, 2) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private static async skillInstall(input: any, options: any): Promise<ToolResult> {
    if (!this.skillManager) {
      return { success: false, error: 'Skill manager not initialized' }
    }
    try {
      const output = await this.skillManager.installDependencies(input.name)
      return { success: true, output }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private static async screenSense(input: any): Promise<ToolResult> {
    try {
      const { execSync } = await import('child_process')
      const output = execSync('agent-control -p macos snapshot 2>&1', {
        encoding: 'utf8',
        timeout: 10000,
        maxBuffer: 10 * 1024 * 1024
      })
      
      // Extract text from labels using regex (more robust than JSON.parse)
      const labelMatches = output.matchAll(/"label"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/g)
      const texts: string[] = []
      
      for (const match of labelMatches) {
        const label = match[1]
        if (label && label.trim() && label.length > 1) {
          texts.push(label.trim())
        }
      }
      
      // Deduplicate and limit
      const unique = [...new Set(texts)].slice(0, 100)
      
      const result = {
        source: 'macOS screen',
        textCount: unique.length,
        content: unique.join('\n')
      }
      
      return { 
        success: true, 
        output: JSON.stringify(result, null, 2)
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private static async codingAgent(input: any, options: any): Promise<ToolResult> {
    return new Promise((resolve) => {
      const { CodingAgentSession } = require('../domain/coding-agent-session')
      const session = new CodingAgentSession()
      
      const workdir = input.workdir || options.workspacePath
      let output = ''
      
      session.onProgress((data: string) => {
        output += data
      })
      
      session.onComplete((result: string) => {
        resolve({ success: true, output: result })
      })
      
      try {
        session.start(input.task, workdir)
      } catch (error: any) {
        resolve({ success: false, error: error.message })
      }
      
      options.signal?.addEventListener('abort', () => {
        session.cancel()
        resolve({ success: false, error: 'Cancelled' })
      })
    })
  }
}
