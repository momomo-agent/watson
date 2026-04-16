/**
 * ProactiveEngine — 主动智能判断引擎
 * 
 * 监听感知变化和心跳，判断是否要主动发起对话。
 * 不直接操作 UI，只 emit 事件让上层决定怎么处理。
 */

import { EventEmitter } from 'events'
import type { SenseContext } from './sense-loop'

// ── Types ──

export interface ProactiveSignal {
  type: 'nudge' | 'alert' | 'suggestion'
  reason: string
  context: Record<string, any>
  priority: number // 1-10, higher = more urgent
}

export interface ProactiveConfig {
  /** Minimum seconds between proactive messages */
  cooldownSec: number
  /** Minimum priority to actually fire (1-10) */
  minPriority: number
  /** Enable/disable */
  enabled: boolean
}

const DEFAULT_CONFIG: ProactiveConfig = {
  cooldownSec: 120,
  minPriority: 3,
  enabled: true,
}

// ── Engine ──

export class ProactiveEngine extends EventEmitter {
  private config: ProactiveConfig
  private lastFiredAt = 0
  private lastSenseContext: SenseContext | null = null
  private lastAppName = ''
  private appSwitchCount = 0
  private appSwitchWindow: number[] = [] // timestamps of recent switches
  private idleSince = Date.now()
  private lastUserMessageAt = Date.now()

  constructor(config?: Partial<ProactiveConfig>) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /** Called when sense context updates */
  onSenseUpdate(ctx: SenseContext): void {
    if (!this.config.enabled) return

    const signals: ProactiveSignal[] = []

    // Detect app switch
    if (ctx.activeApp && ctx.activeApp !== this.lastAppName && this.lastAppName) {
      this.trackAppSwitch()

      // Rapid app switching = user might be stuck
      if (this.appSwitchCount >= 5) {
        signals.push({
          type: 'nudge',
          reason: 'rapid_app_switching',
          context: {
            switchCount: this.appSwitchCount,
            currentApp: ctx.activeApp,
            windowTitle: ctx.activeWindow,
          },
          priority: 4,
        })
      }
    }

    // Detect new error-like content on screen
    if (ctx.visibleText) {
      const errorPatterns = /\b(error|exception|failed|crash|fatal|SIGABRT|segfault|panic)\b/i
      const prevHadError = this.lastSenseContext?.visibleText &&
        errorPatterns.test(this.lastSenseContext.visibleText)
      const nowHasError = errorPatterns.test(ctx.visibleText)

      if (nowHasError && !prevHadError) {
        signals.push({
          type: 'alert',
          reason: 'error_detected',
          context: {
            app: ctx.activeApp,
            window: ctx.activeWindow,
            snippet: this.extractErrorSnippet(ctx.visibleText),
          },
          priority: 6,
        })
      }
    }

    this.lastAppName = ctx.activeApp || ''
    this.lastSenseContext = ctx

    for (const signal of signals) {
      this.maybeEmit(signal)
    }
  }

  /** Called on heartbeat tick */
  onHeartbeatTick(): void {
    if (!this.config.enabled) return

    const now = Date.now()
    const idleMinutes = (now - this.lastUserMessageAt) / 60_000

    // User has been idle for a while
    if (idleMinutes >= 15 && idleMinutes < 16) {
      this.maybeEmit({
        type: 'nudge',
        reason: 'idle_checkin',
        context: { idleMinutes: Math.round(idleMinutes) },
        priority: 2,
      })
    }
  }

  /** Called when user sends a message — resets idle timer */
  onUserMessage(): void {
    this.lastUserMessageAt = Date.now()
    this.idleSince = Date.now()
    this.appSwitchCount = 0
    this.appSwitchWindow = []
  }

  updateConfig(patch: Partial<ProactiveConfig>): void {
    Object.assign(this.config, patch)
  }

  getConfig(): ProactiveConfig {
    return { ...this.config }
  }

  // ── Private ──

  private maybeEmit(signal: ProactiveSignal): void {
    if (signal.priority < this.config.minPriority) return

    const now = Date.now()
    if (now - this.lastFiredAt < this.config.cooldownSec * 1000) return

    this.lastFiredAt = now
    this.emit('signal', signal)
  }

  private trackAppSwitch(): void {
    const now = Date.now()
    this.appSwitchWindow.push(now)
    // Keep only last 60 seconds
    this.appSwitchWindow = this.appSwitchWindow.filter(t => now - t < 60_000)
    this.appSwitchCount = this.appSwitchWindow.length
  }

  private extractErrorSnippet(text: string): string {
    const lines = text.split('\n')
    const errorLine = lines.findIndex(l =>
      /\b(error|exception|failed|crash|fatal)\b/i.test(l)
    )
    if (errorLine === -1) return ''
    const start = Math.max(0, errorLine - 1)
    const end = Math.min(lines.length, errorLine + 3)
    return lines.slice(start, end).join('\n').slice(0, 500)
  }
}
