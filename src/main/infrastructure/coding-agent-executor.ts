/**
 * CodingAgentExecutor — Infrastructure Layer
 * 
 * Executes coding agent sessions with streaming support.
 * Based on paw's coding-agent-router.js implementation.
 * 
 * MOMO-52: Coding Agent as Participant
 */

import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import type { CodingAgentConfig } from './coding-agent-manager'

export interface CodingAgentExecutorOptions {
  cwd: string
  signal?: AbortSignal
  onToken?: (text: string) => void
  onError?: (error: Error) => void
}

export class CodingAgentExecutor extends EventEmitter {
  private proc: ChildProcess | null = null
  private output: string = ''

  /**
   * Execute a coding agent with streaming output.
   * 
   * For SDK agents (Claude Code), spawns the CLI with --dangerously-skip-permissions.
   * For CLI agents, spawns the binary directly.
   */
  async execute(
    config: CodingAgentConfig,
    prompt: string,
    binPath: string | undefined,
    options: CodingAgentExecutorOptions
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (config.useSdk) {
        // Claude Code SDK mode
        this.proc = spawn('claude', [
          '--dangerously-skip-permissions',
          '--worktree',
          prompt
        ], {
          cwd: options.cwd,
          shell: true,
          env: {
            ...process.env,
            ANTHROPIC_API_KEY: config.apiKey,
            ...(config.baseUrl && { ANTHROPIC_BASE_URL: config.baseUrl }),
          }
        })
      } else if (binPath) {
        // CLI/ACP mode
        this.proc = spawn(binPath, [prompt], {
          cwd: options.cwd,
          shell: true
        })
      } else {
        reject(new Error(`No binary path for agent ${config.id}`))
        return
      }

      // Handle abort signal
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          if (this.proc) {
            this.proc.kill('SIGTERM')
            reject(new Error('Aborted'))
          }
        })
      }

      this.proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString()
        this.output += text
        if (options.onToken) {
          options.onToken(text)
        }
        this.emit('token', text)
      })

      this.proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString()
        this.output += text
        if (options.onToken) {
          options.onToken(text)
        }
        this.emit('token', text)
      })

      this.proc.on('error', (err: Error) => {
        if (options.onError) {
          options.onError(err)
        }
        reject(err)
      })

      this.proc.on('close', (code: number) => {
        if (code === 0) {
          resolve(this.output)
        } else {
          reject(new Error(`Process exited with code ${code}`))
        }
        this.proc = null
      })
    })
  }

  cancel(): void {
    if (this.proc) {
      this.proc.kill('SIGTERM')
      this.proc = null
    }
  }
}
