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
      const { readFileSync } = await import('fs')
      const { resolve } = await import('path')
      const fullPath = resolve(options.workspacePath, input.path)
      const content = readFileSync(fullPath, 'utf8')
      return { success: true, output: content }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private static async fileWrite(input: any, options: any): Promise<ToolResult> {
    try {
      const { writeFileSync, mkdirSync } = await import('fs')
      const { resolve, dirname } = await import('path')
      const fullPath = resolve(options.workspacePath, input.path)
      mkdirSync(dirname(fullPath), { recursive: true })
      writeFileSync(fullPath, input.content, 'utf8')
      return { success: true, output: `Wrote ${input.content.length} bytes to ${input.path}` }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private static async shellExec(input: any, options: any): Promise<ToolResult> {
    return new Promise((resolve) => {
      const { spawn } = require('child_process')
      const proc = spawn('sh', ['-c', input.command], {
        cwd: options.workspacePath,
        env: process.env,
      })
      
      let stdout = ''
      let stderr = ''
      
      proc.stdout.on('data', (data: any) => { stdout += data.toString() })
      proc.stderr.on('data', (data: any) => { stderr += data.toString() })
      
      proc.on('close', (code: number) => {
        if (code === 0) {
          resolve({ success: true, output: stdout })
        } else {
          resolve({ success: false, error: stderr || `Exit code ${code}` })
        }
      })
      
      options.signal?.addEventListener('abort', () => {
        proc.kill('SIGTERM')
      })
    })
  }

  private static async notify(input: any): Promise<ToolResult> {
    try {
      const { Notification } = await import('electron')
      new Notification({
        title: input.title || 'Watson',
        body: input.message
      }).show()
      return { success: true, output: 'Notification sent' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private static async search(input: any, options: any): Promise<ToolResult> {
    try {
      const { execSync } = await import('child_process')
      const query = input.query.replace(/'/g, "'\\''")
      const cmd = `tavily-search '${query}'`
      const output = execSync(cmd, {
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 5 * 1024 * 1024
      })
      return { success: true, output }
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
      
      let cmd: string
      let tmpFile: string
      
      if (lang === 'javascript' || lang === 'js') {
        tmpFile = join('/tmp', `watson-${Date.now()}.js`)
        writeFileSync(tmpFile, code, 'utf8')
        cmd = `node ${tmpFile}`
      } else if (lang === 'python' || lang === 'py') {
        tmpFile = join('/tmp', `watson-${Date.now()}.py`)
        writeFileSync(tmpFile, code, 'utf8')
        cmd = `python3 ${tmpFile}`
      } else {
        return this.shellExec({ command: code }, options)
      }
      
      try {
        const output = execSync(cmd, {
          cwd: options.workspacePath,
          encoding: 'utf8',
          timeout: 30000,
          maxBuffer: 10 * 1024 * 1024
        })
        unlinkSync(tmpFile)
        return { success: true, output }
      } catch (error: any) {
        unlinkSync(tmpFile)
        throw error
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private static async uiStatusSet(input: any): Promise<ToolResult> {
    try {
      const { BrowserWindow } = await import('electron')
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        win.webContents.send('status-update', {
          status: input.status,
          timestamp: Date.now()
        })
        return { success: true, output: `Status set: ${input.status}` }
      }
      return { success: false, error: 'No window found' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private static async skillExec(input: any, options: any): Promise<ToolResult> {
    try {
      const { execSync } = await import('child_process')
      const skill = input.skill
      const args = input.args || []
      const argsStr = args.map((a: string) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')
      const cmd = `openclaw skill ${skill} ${argsStr}`
      
      const output = execSync(cmd, {
        cwd: options.workspacePath,
        encoding: 'utf8',
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024
      })
      
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
