/**
 * Manages embedded AgenticService as a child process.
 * AgenticService provides local model management (Ollama/MLX) and
 * an OpenAI-compatible /v1/chat/completions endpoint.
 *
 * In dev: spawns via tsx (TypeScript execution)
 * In prod: spawns pre-built JS entry (TODO: add build step)
 */

import { spawn, type ChildProcess } from 'child_process'
import { resolve, join } from 'path'
import { createServer } from 'net'
import { app } from 'electron'

// In dev: resolve relative to project root (watson/)
// In prod: resolve relative to app resources (TODO)
function getServiceDir(): string {
  const isDev = !app.isPackaged
  if (isDev) {
    // watson/ is at projects/watson, agentic/ is at projects/agentic
    return resolve(app.getAppPath(), '../agentic/apps/service')
  }
  // TODO: For production, bundle AgenticService into app resources
  return join(process.resourcesPath, 'agentic-service')
}

const HEALTH_TIMEOUT = 15_000
const HEALTH_INTERVAL = 500

class AgenticServiceManager {
  private process: ChildProcess | null = null
  private _port = 11435
  private _ready = false

  async start(): Promise<void> {
    if (this.process) return

    this._port = await this.findAvailablePort(11435)

    const serviceDir = getServiceDir()
    const serviceEntry = resolve(serviceDir, 'src/server.ts')

    // Use npx tsx to run TypeScript directly
    this.process = spawn('npx', ['tsx', serviceEntry], {
      cwd: serviceDir,
      env: { ...process.env, PORT: String(this._port) },
      stdio: 'pipe',
      detached: false
    })

    this.process.on('exit', (code) => {
      console.log(`[AgenticService] exited with code ${code}`)
      this._ready = false
      this.process = null
    })

    this.process.on('error', (err) => {
      console.error('[AgenticService] process error:', err)
      this._ready = false
    })

    this.process.stdout?.on('data', (d: Buffer) =>
      console.log(`[AgenticService] ${d.toString().trim()}`)
    )
    this.process.stderr?.on('data', (d: Buffer) =>
      console.error(`[AgenticService] ${d.toString().trim()}`)
    )

    await this.waitForHealth()
    this._ready = true
    console.log(`[AgenticService] ready on port ${this._port}`)
  }

  async stop(): Promise<void> {
    if (!this.process) return

    const proc = this.process
    this.process = null
    this._ready = false

    proc.kill('SIGTERM')

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        proc.kill('SIGKILL')
        resolve()
      }, 3000)
      proc.on('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }

  isReady(): boolean {
    return this._ready
  }

  getPort(): number {
    return this._port
  }

  getBaseUrl(): string {
    return `http://127.0.0.1:${this._port}`
  }

  private async waitForHealth(): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < HEALTH_TIMEOUT) {
      try {
        const res = await fetch(`http://127.0.0.1:${this._port}/health`)
        if (res.ok) return
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, HEALTH_INTERVAL))
    }
    throw new Error(`AgenticService failed to start within ${HEALTH_TIMEOUT}ms`)
  }

  private findAvailablePort(preferred: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer()
      server.listen(preferred, '127.0.0.1', () => {
        server.close(() => resolve(preferred))
      })
      server.on('error', () => {
        const server2 = createServer()
        server2.listen(0, '127.0.0.1', () => {
          const addr = server2.address()
          const port = typeof addr === 'object' ? addr!.port : 0
          server2.close(() => resolve(port))
        })
        server2.on('error', reject)
      })
    })
  }
}

export const agenticService = new AgenticServiceManager()
