/**
 * SenseLoop — Ambient perception engine
 *
 * Runs a continuous perception loop. All external capabilities go through
 * the agentic unified API — no direct sub-library imports.
 *
 * Architecture:
 *   agentic.sense() (capture) → agentic.think() (local model) → context buffer
 *   ChatSession reads context buffer before each cloud LLM call.
 *
 * This is the "eyes and ears" — always on, always local, zero cloud cost.
 */

import { EventEmitter } from 'events'

// ── Types ──

export interface SenseContext {
  /** What the user is currently doing */
  activity: string
  /** Active app/window */
  activeApp: string
  /** Key content visible on screen */
  screenSummary: string
  /** Timestamp of last perception */
  timestamp: number
  /** Confidence score 0-1 */
  confidence: number
  /** Raw perception data (for debugging) */
  raw?: any
}

export interface SenseConfig {
  /** Perception interval in ms (default: 5000) */
  intervalMs?: number
  /** Whether to capture screen content */
  screenCapture?: boolean
  /** Minimum change threshold to emit update (0-1) */
  changeThreshold?: number
}

// ── SenseLoop ──

export class SenseLoop extends EventEmitter {
  private config: Required<SenseConfig>
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private lastContext: SenseContext | null = null
  private ai: any = null

  constructor(config: SenseConfig = {}) {
    super()
    this.config = {
      intervalMs: config.intervalMs ?? 5000,
      screenCapture: config.screenCapture ?? true,
      changeThreshold: config.changeThreshold ?? 0.3,
    }
  }

  /** Inject the agentic instance (avoids top-level import in main process) */
  setAgentic(ai: any): void {
    this.ai = ai
  }

  /** Start the perception loop */
  start(): void {
    if (this.running) return
    this.running = true
    this.tick()
    this.timer = setInterval(() => this.tick(), this.config.intervalMs)
    this.emit('started')
  }

  /** Stop the perception loop */
  stop(): void {
    if (!this.running) return
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.emit('stopped')
  }

  /** Get the latest context (for injection into LLM calls) */
  getContext(): SenseContext | null {
    return this.lastContext
  }

  /** Check if loop is running */
  isRunning(): boolean {
    return this.running
  }

  // ── Internal ──

  private async tick(): Promise<void> {
    if (!this.running) return

    try {
      // Phase 1: Capture via agentic.sense()
      const rawCapture = await this.capture()

      // Phase 2: Local inference via agentic.think() with local model
      const context = await this.infer(rawCapture)

      // Phase 3: Change detection
      if (this.hasSignificantChange(context)) {
        this.lastContext = context
        this.emit('context', context)
      }
    } catch (err) {
      // Perception failures are non-fatal — just skip this tick
      this.emit('error', err)
    }
  }

  private async capture(): Promise<any> {
    if (!this.config.screenCapture) return null

    // Try agentic.sense() first (unified API)
    if (this.ai?.sense) {
      try {
        return await this.ai.sense({ type: 'screen', compact: true })
      } catch {
        // Fall through to agent-control
      }
    }

    // Fallback: agent-control CLI
    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      const { stdout } = await execAsync('agent-control -p macos snapshot --compact', {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 3000,
      })
      return JSON.parse(stdout)
    } catch {
      return null
    }
  }

  private async infer(rawCapture: any): Promise<SenseContext> {
    if (!rawCapture || !Array.isArray(rawCapture)) {
      return {
        activity: 'unknown',
        activeApp: '',
        screenSummary: '',
        timestamp: Date.now(),
        confidence: 0,
      }
    }

    // Basic extraction without LLM (fast path)
    let activeApp = ''
    const labels: string[] = []

    for (const el of rawCapture) {
      if (el.role === 'MenuBarItem' && el.label && el.label !== 'Apple' && !activeApp) {
        activeApp = el.label
      }
      if (el.label) labels.push(el.label)
    }

    // TODO: Use agentic.think() with local model for richer inference
    // e.g. ai.think('Summarize what the user is doing', { model: 'local' })

    return {
      activity: `Using ${activeApp || 'unknown app'}`,
      activeApp,
      screenSummary: labels.slice(0, 20).join(' | '),
      timestamp: Date.now(),
      confidence: 0.5,
      raw: rawCapture,
    }
  }

  private hasSignificantChange(newContext: SenseContext): boolean {
    if (!this.lastContext) return true
    if (newContext.activeApp !== this.lastContext.activeApp) return true
    return false
  }
}
