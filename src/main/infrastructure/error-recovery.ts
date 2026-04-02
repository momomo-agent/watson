/**
 * Error Recovery — Infrastructure Layer
 *
 * Unified error recovery pipeline that orchestrates all 5 sub-modules:
 *   1. Error Classification
 *   2. Context Compaction
 *   3. Context Guard (pre-flight check)
 *   4. Loop Detection
 *   5. API Retry with Failover
 *
 * This module provides the high-level ErrorRecovery class that wraps
 * an LLM call with production-grade resilience.
 */

import { classifyError, type ClassifiedError, scrubMagicStrings } from './error-classify'
import {
  needsCompaction,
  compactHistory,
  estimateMessagesTokens,
  getContextWindowForModel,
  type CompactionMessage,
  type RawLLMFn,
} from './context-compaction'
import {
  enforceContextBudget,
  estimateContextChars,
  type GuardMessage,
} from './context-guard'
import { LoopDetector, type LoopCheckResult } from './loop-detection'
import type { ProviderConfig } from './enhanced-llm-client'

export interface RecoveryOptions {
  model?: string
  providers?: ProviderConfig[]
  maxRetries?: number
  onRecovery?: (event: RecoveryEvent) => void
}

export interface RecoveryEvent {
  type: 'compaction' | 'guard' | 'loop-warning' | 'loop-blocked' | 'retry' | 'failover' | 'error'
  detail: string
  data?: any
}

export class ErrorRecovery {
  private loopDetector: LoopDetector
  private model?: string
  private providers: ProviderConfig[]
  private maxRetries: number
  private onRecovery?: (event: RecoveryEvent) => void

  constructor(opts: RecoveryOptions = {}) {
    this.model = opts.model
    this.providers = opts.providers || []
    this.maxRetries = opts.maxRetries ?? 3
    this.onRecovery = opts.onRecovery
    this.loopDetector = new LoopDetector()
  }

  /**
   * Pre-flight: prepare messages before sending to LLM.
   *
   * 1. Check context size → compact if needed
   * 2. Enforce context budget (compact tool results)
   * 3. Return ready-to-send messages
   */
  async prepareMessages(
    messages: CompactionMessage[],
    rawFn?: RawLLMFn
  ): Promise<CompactionMessage[]> {
    let prepared = [...messages]

    // Step 1: Check if compaction is needed
    if (needsCompaction(prepared, this.model)) {
      this.emit({
        type: 'compaction',
        detail: `Context approaching limit (${estimateMessagesTokens(prepared)} tokens). Compacting...`,
      })

      if (rawFn) {
        prepared = await compactHistory(prepared, rawFn, { model: this.model })
      } else {
        // No LLM function available for summarization — truncation fallback
        const keepCount = 8
        if (prepared.length > keepCount + 2) {
          prepared = [
            { role: 'user', content: '[Earlier conversation was truncated due to length]' },
            { role: 'assistant', content: "Understood. I'll continue from the recent context." },
            ...prepared.slice(-keepCount),
          ]
        }
      }
    }

    // Step 2: Enforce context budget (compact individual tool results)
    const contextWindow = getContextWindowForModel(this.model) || 128000
    const { messages: guarded, result: guardResult } = enforceContextBudget(
      prepared as GuardMessage[],
      contextWindow
    )

    if (guardResult.compacted) {
      this.emit({
        type: 'guard',
        detail: `Tool results compacted to fit context budget (${guardResult.estimatedTokens}/${guardResult.budgetTokens} tokens)`,
        data: guardResult,
      })
    }

    return guarded as CompactionMessage[]
  }

  /**
   * Check a tool call for loop patterns.
   * Call before executing the tool.
   */
  checkToolCall(toolName: string, params: any): LoopCheckResult {
    this.loopDetector.recordToolCall(toolName, params)
    const result = this.loopDetector.check(toolName, params)

    if (result.blocked) {
      this.emit({
        type: 'loop-blocked',
        detail: result.reason || `Tool ${toolName} blocked by loop detector`,
      })
    } else if (result.warning) {
      this.emit({
        type: 'loop-warning',
        detail: result.reason || `Tool ${toolName} may be in a loop`,
      })
    }

    return result
  }

  /**
   * Record a tool call outcome for no-progress tracking.
   */
  recordToolOutcome(toolName: string, params: any, result: any, error?: any): void {
    this.loopDetector.recordOutcome(toolName, params, result, error)
  }

  /**
   * Handle an LLM error with classification and recovery strategy.
   *
   * @returns Recovery action to take
   */
  handleError(err: any): {
    classified: ClassifiedError
    action: 'retry' | 'compact' | 'failover' | 'abort'
    retryDelayMs: number
  } {
    const classified = classifyError(err)

    this.emit({
      type: 'error',
      detail: `${classified.category}: ${classified.short}`,
      data: classified,
    })

    switch (classified.category) {
      case 'context':
        return { classified, action: 'compact', retryDelayMs: 0 }

      case 'rate-limit':
        return { classified, action: 'retry', retryDelayMs: classified.retryAfterMs }

      case 'server':
      case 'network':
        return { classified, action: 'retry', retryDelayMs: classified.retryAfterMs }

      case 'auth':
        if (this.providers.length > 0) {
          return { classified, action: 'failover', retryDelayMs: 0 }
        }
        return { classified, action: 'abort', retryDelayMs: 0 }

      case 'billing':
        if (this.providers.length > 0) {
          return { classified, action: 'failover', retryDelayMs: 0 }
        }
        return { classified, action: 'abort', retryDelayMs: 0 }

      default:
        return { classified, action: 'abort', retryDelayMs: 0 }
    }
  }

  /**
   * Scrub sensitive strings from content.
   */
  scrub(text: string): string {
    return scrubMagicStrings(text)
  }

  /**
   * Reset loop detector state (e.g., on new conversation).
   */
  resetLoopDetector(): void {
    this.loopDetector.reset()
  }

  /**
   * Update model (e.g., after failover).
   */
  setModel(model: string): void {
    this.model = model
  }

  private emit(event: RecoveryEvent): void {
    this.onRecovery?.(event)
    console.log(`[error-recovery] ${event.type}: ${event.detail}`)
  }
}
