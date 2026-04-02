import { spawn, ChildProcess } from 'child_process'

export class CodingAgentSession {
  private proc: ChildProcess | null = null
  private progressCallbacks: Array<(data: string) => void> = []
  private completeCallbacks: Array<(result: string) => void> = []
  private output: string = ''

  start(task: string, workdir: string) {
    if (this.proc) {
      throw new Error('Session already started')
    }

    this.proc = spawn('claude', [
      '--dangerously-skip-permissions',
      '--worktree',
      task
    ], {
      cwd: workdir,
      shell: true
    })

    this.proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      this.output += text
      this.progressCallbacks.forEach(cb => cb(text))
    })

    this.proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      this.output += text
      this.progressCallbacks.forEach(cb => cb(text))
    })

    this.proc.on('close', (code: number) => {
      const result = `Exit code: ${code}\n\n${this.output}`
      this.completeCallbacks.forEach(cb => cb(result))
      this.proc = null
    })
  }

  cancel() {
    if (this.proc) {
      this.proc.kill('SIGTERM')
      this.proc = null
    }
  }

  onProgress(callback: (data: string) => void) {
    this.progressCallbacks.push(callback)
  }

  onComplete(callback: (result: string) => void) {
    this.completeCallbacks.push(callback)
  }
}
