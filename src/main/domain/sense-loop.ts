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
  /** Active window title */
  activeWindow: string
  /** Key content visible on screen (truncated to 500 chars) */
  visibleText: string
  /** Currently focused element description */
  focusedElement: string
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

// ── Constants ──

const DEFAULT_INTERVAL_MS = 5000
const DEFAULT_CHANGE_THRESHOLD = 0.3
const VISIBLE_TEXT_MAX_CHARS = 500
const CAPTURE_TIMEOUT_MS = 3000
const CAPTURE_MAX_BUFFER = 10 * 1024 * 1024
const SUMMARY_MAX_LABELS = 20

// Change detection weights
const WEIGHT_APP_SWITCH = 1.0
const WEIGHT_WINDOW_SWITCH = 0.6
const WEIGHT_FOCUS_CHANGE = 0.2
const WEIGHT_TEXT_CHANGE = 0.4
const TEXT_OVERLAP_THRESHOLD = 0.7

// Confidence scores
const CONFIDENCE_WITH_APP = 0.7
const CONFIDENCE_WITHOUT_APP = 0.3

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
      intervalMs: config.intervalMs ?? DEFAULT_INTERVAL_MS,
      screenCapture: config.screenCapture ?? true,
      changeThreshold: config.changeThreshold ?? DEFAULT_CHANGE_THRESHOLD,
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
        maxBuffer: CAPTURE_MAX_BUFFER,
        timeout: CAPTURE_TIMEOUT_MS,
      })
      return JSON.parse(stdout)
    } catch {
      return null
    }
  }

  private async infer(rawCapture: any): Promise<SenseContext> {
    const empty: SenseContext = {
      activity: 'unknown',
      activeApp: '',
      activeWindow: '',
      visibleText: '',
      focusedElement: '',
      screenSummary: '',
      timestamp: Date.now(),
      confidence: 0,
    }

    if (!rawCapture || !Array.isArray(rawCapture)) return empty

    let activeApp = ''
    let activeWindow = ''
    let focusedElement = ''
    const textParts: string[] = []
    const labels: string[] = []

    for (const el of rawCapture) {
      // Extract active app from menu bar
      if (el.role === 'MenuBarItem' && el.label && el.label !== 'Apple' && !activeApp) {
        activeApp = el.label
      }
      // Extract window title
      if ((el.role === 'Window' || el.role === 'AXWindow') && el.title && !activeWindow) {
        activeWindow = el.title
      }
      // Extract focused element
      if (el.focused && el.label) {
        focusedElement = `${el.role || 'element'}: ${el.label}`
      }
      // Collect visible text (static text, text fields, headings)
      if ((el.role === 'StaticText' || el.role === 'AXStaticText' ||
           el.role === 'TextField' || el.role === 'AXTextField' ||
           el.role === 'Heading' || el.role === 'AXHeading') && el.value) {
        textParts.push(el.value)
      }
      if (el.label) labels.push(el.label)
    }

    // Truncate visible text
    const visibleText = textParts.join(' ').slice(0, VISIBLE_TEXT_MAX_CHARS)

    // Infer activity from app + window context
    let activity = `Using ${activeApp || 'unknown app'}`
    if (activeWindow) activity += ` — ${activeWindow}`

    return {
      activity,
      activeApp,
      activeWindow,
      visibleText,
      focusedElement,
      screenSummary: labels.slice(0, SUMMARY_MAX_LABELS).join(' | '),
      timestamp: Date.now(),
      confidence: activeApp ? CONFIDENCE_WITH_APP : CONFIDENCE_WITHOUT_APP,
      raw: rawCapture,
    }
  }

  private hasSignificantChange(newContext: SenseContext): boolean {
    if (!this.lastContext) return true

    const prev = this.lastContext
    let score = 0

    // App switch — highest weight
    if (newContext.activeApp !== prev.activeApp) score += WEIGHT_APP_SWITCH
    // Window switch — medium weight
    if (newContext.activeWindow !== prev.activeWindow) score += WEIGHT_WINDOW_SWITCH
    // Focused element changed — low weight
    if (newContext.focusedElement !== prev.focusedElement) score += WEIGHT_FOCUS_CHANGE
    // Visible text changed significantly
    if (prev.visibleText && newContext.visibleText) {
      const overlap = this.textOverlap(prev.visibleText, newContext.visibleText)
      if (overlap < TEXT_OVERLAP_THRESHOLD) score += WEIGHT_TEXT_CHANGE
    }

    return score >= this.config.changeThreshold
  }

  /** Rough text similarity: ratio of shared words */
  private textOverlap(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/))
    const wordsB = new Set(b.toLowerCase().split(/\s+/))
    if (wordsA.size === 0 && wordsB.size === 0) return 1
    let shared = 0
    for (const w of wordsA) { if (wordsB.has(w)) shared++ }
    return shared / Math.max(wordsA.size, wordsB.size)
  }
}
