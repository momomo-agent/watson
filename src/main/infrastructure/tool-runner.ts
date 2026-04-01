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
  static async execute(tool: ToolCall, options: { signal: AbortSignal, workspacePath: string }): Promise<ToolResult> {
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
      const query = encodeURIComponent(input.query)
      return { 
        success: true, 
        output: `Search results for: ${input.query}\n(Search implementation pending)` 
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private static async codeExec(input: any, options: any): Promise<ToolResult> {
    return this.shellExec({ command: input.code }, options)
  }

  private static async uiStatusSet(input: any): Promise<ToolResult> {
    return { success: true, output: `Status set: ${input.status}` }
  }

  private static async skillExec(input: any, options: any): Promise<ToolResult> {
    return { success: true, output: `Skill ${input.skill} executed` }
  }
}
