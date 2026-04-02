/**
 * Loop Detection — Infrastructure Layer
 *
 * Detects repetitive tool call patterns to prevent infinite loops:
 *   - Same tool + same args repeated N times (no-progress streak)
 *   - A-B-A-B ping-pong alternation
 *   - Generic repeat warning
 *
 * Ported from paw/core/loop-detection.js, adapted for TypeScript.
 */

import { createHash } from 'crypto'

const WARNING_THRESHOLD = 10
const CRITICAL_THRESHOLD = 20
const GLOBAL_CIRCUIT_BREAKER_THRESHOLD = 30
const TOOL_CALL_HISTORY_SIZE = 30
const LOOP_WARNING_BUCKET_SIZE = 10

interface HistoryEntry {
  toolName: string
  argsHash: string
  resultHash?: string
  timestamp: number
}

export interface LoopCheckResult {
  blocked: boolean
  warning: boolean
  reason?: string
}

/** Known polling tools that are expected to repeat */
function isKnownPollToolCall(toolName: string, params: any): boolean {
  if (toolName === 'command_status') return true
  if (toolName !== 'process' || !params || typeof params !== 'object') return false
  return params.action === 'poll' || params.action === 'log'
}

function stableStringify(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}

function digestStable(value: any): string {
  try {
    const serialized = stableStringify(value)
    return createHash('sha256').update(serialized).digest('hex')
  } catch {
    return createHash('sha256').update(String(value)).digest('hex')
  }
}

function hashToolCall(toolName: string, params: any): string {
  return `${toolName}:${digestStable(params)}`
}

function hashToolOutcome(result: any, error: any): string | undefined {
  if (error !== undefined) {
    const errStr = error instanceof Error ? error.message : String(error)
    return `error:${digestStable(errStr)}`
  }
  if (result === undefined) return undefined
  return digestStable(result)
}

function getNoProgressStreak(
  history: HistoryEntry[],
  toolName: string,
  argsHash: string
): { count: number; latestResultHash?: string } {
  let streak = 0
  let latestResultHash: string | undefined

  for (let i = history.length - 1; i >= 0; i--) {
    const record = history[i]
    if (record.toolName !== toolName || record.argsHash !== argsHash) continue
    if (typeof record.resultHash !== 'string' || !record.resultHash) continue
    if (!latestResultHash) {
      latestResultHash = record.resultHash
      streak = 1
      continue
    }
    if (record.resultHash !== latestResultHash) break
    streak++
  }

  return { count: streak, latestResultHash }
}

function getPingPongStreak(
  history: HistoryEntry[],
  currentArgsHash: string
): { count: number; noProgressEvidence: boolean } {
  const last = history[history.length - 1]
  if (!last) return { count: 0, noProgressEvidence: false }

  let otherArgsHash: string | undefined
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].argsHash !== last.argsHash) {
      otherArgsHash = history[i].argsHash
      break
    }
  }
  if (!otherArgsHash) return { count: 0, noProgressEvidence: false }

  let alternatingCount = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const expected = alternatingCount % 2 === 0 ? last.argsHash : otherArgsHash
    if (history[i].argsHash !== expected) break
    alternatingCount++
  }

  if (alternatingCount < 2) return { count: 0, noProgressEvidence: false }
  if (currentArgsHash !== otherArgsHash) return { count: 0, noProgressEvidence: false }

  // Check no-progress evidence
  const tailStart = Math.max(0, history.length - alternatingCount)
  let firstHashA: string | undefined, firstHashB: string | undefined
  let noProgressEvidence = true
  for (let i = tailStart; i < history.length; i++) {
    const call = history[i]
    if (!call.resultHash) {
      noProgressEvidence = false
      break
    }
    if (call.argsHash === last.argsHash) {
      if (!firstHashA) firstHashA = call.resultHash
      else if (firstHashA !== call.resultHash) {
        noProgressEvidence = false
        break
      }
    } else if (call.argsHash === otherArgsHash) {
      if (!firstHashB) firstHashB = call.resultHash
      else if (firstHashB !== call.resultHash) {
        noProgressEvidence = false
        break
      }
    } else {
      noProgressEvidence = false
      break
    }
  }
  if (!firstHashA || !firstHashB) noProgressEvidence = false

  return { count: alternatingCount + 1, noProgressEvidence }
}

export class LoopDetector {
  private enabled: boolean
  private warningThreshold: number
  private criticalThreshold: number
  private circuitBreakerThreshold: number
  private historySize: number
  private history: HistoryEntry[] = []
  private warningBuckets = new Map<string, number>()

  constructor(opts: {
    enabled?: boolean
    warningThreshold?: number
    criticalThreshold?: number
    circuitBreakerThreshold?: number
    historySize?: number
  } = {}) {
    this.enabled = opts.enabled !== false
    this.warningThreshold = opts.warningThreshold || WARNING_THRESHOLD
    this.criticalThreshold = opts.criticalThreshold || CRITICAL_THRESHOLD
    this.circuitBreakerThreshold = opts.circuitBreakerThreshold || GLOBAL_CIRCUIT_BREAKER_THRESHOLD
    this.historySize = opts.historySize || TOOL_CALL_HISTORY_SIZE

    // Enforce threshold ordering
    if (this.criticalThreshold <= this.warningThreshold)
      this.criticalThreshold = this.warningThreshold + 1
    if (this.circuitBreakerThreshold <= this.criticalThreshold)
      this.circuitBreakerThreshold = this.criticalThreshold + 1
  }

  /**
   * Record a tool call before execution.
   */
  recordToolCall(toolName: string, params: any): void {
    const argsHash = hashToolCall(toolName, params)
    this.history.push({ toolName, argsHash, timestamp: Date.now() })
    if (this.history.length > this.historySize) this.history.shift()
  }

  /**
   * Record tool call outcome after execution (enables no-progress detection).
   */
  recordOutcome(toolName: string, params: any, result: any, error?: any): void {
    const argsHash = hashToolCall(toolName, params)
    const resultHash = hashToolOutcome(result, error)
    if (!resultHash) return

    for (let i = this.history.length - 1; i >= 0; i--) {
      const call = this.history[i]
      if (call.toolName === toolName && call.argsHash === argsHash && call.resultHash === undefined) {
        call.resultHash = resultHash
        return
      }
    }
    // Fallback: append
    this.history.push({ toolName, argsHash, resultHash, timestamp: Date.now() })
    if (this.history.length > this.historySize) this.history.shift()
  }

  /**
   * Check if a tool call should be blocked or warned about.
   * Call AFTER recordToolCall, BEFORE execution.
   */
  check(toolName: string, params: any): LoopCheckResult {
    if (!this.enabled) return { blocked: false, warning: false }

    const currentHash = hashToolCall(toolName, params)
    const noProgress = getNoProgressStreak(this.history, toolName, currentHash)
    const knownPoll = isKnownPollToolCall(toolName, params)
    const pingPong = getPingPongStreak(this.history, currentHash)

    // 1. Global circuit breaker
    if (noProgress.count >= this.circuitBreakerThreshold) {
      return {
        blocked: true,
        warning: false,
        reason: `CRITICAL: ${toolName} has repeated identical no-progress outcomes ${noProgress.count} times. Blocked by circuit breaker.`,
      }
    }

    // 2. Known poll no-progress
    if (knownPoll) {
      if (noProgress.count >= this.criticalThreshold) {
        return {
          blocked: true,
          warning: false,
          reason: `CRITICAL: ${toolName} stuck polling ${noProgress.count} times with no progress.`,
        }
      }
      if (noProgress.count >= this.warningThreshold) {
        const wk = `poll:${toolName}:${currentHash}`
        if (this.shouldEmitWarning(wk, noProgress.count)) {
          return {
            blocked: false,
            warning: true,
            reason: `WARNING: ${toolName} called ${noProgress.count} times with no progress. Stop polling or increase wait time.`,
          }
        }
      }
    }

    // 3. Ping-pong detection
    if (pingPong.count >= this.criticalThreshold && pingPong.noProgressEvidence) {
      return {
        blocked: true,
        warning: false,
        reason: `CRITICAL: Alternating tool-call pattern (${pingPong.count} calls) with no progress. Ping-pong loop blocked.`,
      }
    }
    if (pingPong.count >= this.warningThreshold) {
      const wk = `pingpong:${currentHash}`
      if (this.shouldEmitWarning(wk, pingPong.count)) {
        return {
          blocked: false,
          warning: true,
          reason: `WARNING: Alternating tool-call pattern (${pingPong.count} calls).`,
        }
      }
    }

    // 4. Generic repeat (warn only, never blocks)
    if (!knownPoll) {
      const recentCount = this.history.filter(
        (h) => h.toolName === toolName && h.argsHash === currentHash
      ).length
      if (recentCount >= this.warningThreshold) {
        const wk = `generic:${toolName}:${currentHash}`
        if (this.shouldEmitWarning(wk, recentCount)) {
          return {
            blocked: false,
            warning: true,
            reason: `WARNING: ${toolName} called ${recentCount} times with identical arguments.`,
          }
        }
      }
    }

    return { blocked: false, warning: false }
  }

  reset(): void {
    this.history = []
    this.warningBuckets.clear()
  }

  private shouldEmitWarning(warningKey: string, count: number): boolean {
    const bucket = Math.floor(count / LOOP_WARNING_BUCKET_SIZE)
    const lastBucket = this.warningBuckets.get(warningKey) || 0
    if (bucket <= lastBucket) return false
    this.warningBuckets.set(warningKey, bucket)
    if (this.warningBuckets.size > 256) {
      const oldest = this.warningBuckets.keys().next().value
      if (oldest) this.warningBuckets.delete(oldest)
    }
    return true
  }
}
