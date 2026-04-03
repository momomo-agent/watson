import { spawn, ChildProcess } from 'child_process'

interface BackgroundSession {
  id: string
  command: string
  process: ChildProcess
  stdout: string
  stderr: string
  startTime: number
  endTime?: number
  exitCode?: number
  status: 'running' | 'done' | 'error'
}

const sessions = new Map<string, BackgroundSession>()

export function startBackground(command: string, cwd: string): string {
  const id = `bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  
  const proc = spawn('sh', ['-c', command], { cwd })
  
  const session: BackgroundSession = {
    id,
    command,
    process: proc,
    stdout: '',
    stderr: '',
    startTime: Date.now(),
    status: 'running'
  }
  
  proc.stdout?.on('data', (data) => { session.stdout += data.toString() })
  proc.stderr?.on('data', (data) => { session.stderr += data.toString() })
  
  proc.on('close', (code) => {
    session.endTime = Date.now()
    session.exitCode = code ?? undefined
    session.status = code === 0 ? 'done' : 'error'
  })
  
  sessions.set(id, session)
  return id
}

export function listSessions() {
  return Array.from(sessions.values()).map(s => ({
    id: s.id,
    command: s.command,
    status: s.status,
    startTime: s.startTime,
    endTime: s.endTime,
    exitCode: s.exitCode
  }))
}

export function poll(sessionId: string) {
  const s = sessions.get(sessionId)
  if (!s) return null
  return {
    id: s.id,
    status: s.status,
    exitCode: s.exitCode,
    stdout: s.stdout,
    stderr: s.stderr
  }
}

export function getLog(sessionId: string, opts: { offset?: number; limit?: number }) {
  const s = sessions.get(sessionId)
  if (!s) return null
  
  const lines = (s.stdout + s.stderr).split('\n')
  const start = opts.offset || 0
  const count = opts.limit || 50
  
  return {
    lines: lines.slice(start, start + count),
    total: lines.length,
    hasMore: start + count < lines.length
  }
}

export function kill(sessionId: string): boolean {
  const s = sessions.get(sessionId)
  if (!s || s.status !== 'running') return false
  
  s.process.kill('SIGTERM')
  setTimeout(() => s.process.kill('SIGKILL'), 5000)
  return true
}
