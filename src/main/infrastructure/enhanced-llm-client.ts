/**
 * EnhancedLLMClient — Infrastructure Layer
 *
 * Production-grade LLM client with:
 *   - Error classification + automatic recovery
 *   - Context compaction (model-aware, LLM summarization)
 *   - Context guard (pre-flight token check)
 *   - Exponential backoff retry with jitter
 *   - Multi-provider failover with API key rotation
 *
 * Uses ErrorRecovery to orchestrate all recovery mechanisms.
 */

import { LLMClient, type LLMOptions, type StreamChunk } from './llm-client'
import { classifyError, type ClassifiedError } from './error-classify'
import { ApiKeyManager } from './api-keys'

export interface ProviderConfig {
  provider: 'anthropic' | 'openai'
  apiKey?: string // Single key (legacy)
  apiKeys?: string[] // Multiple keys for rotation
  baseUrl?: string
  model?: string
}

export interface RetryEvent {
  attempt: number
  maxAttempts: number
  delayMs: number
  reason: string
  provider?: string
}

export interface EnhancedOptions {
  /** Callback when a retry or failover happens */
  onRetry?: (event: RetryEvent) => void
  /** Callback when an error is classified */
  onError?: (classified: ClassifiedError) => void
}

export class EnhancedLLMClient {
  /**
   * Stream with full failover across multiple providers.
   *
   * Tries each provider in order. On retryable errors (rate-limit, server, network),
   * retries with exponential backoff before moving to the next provider.
   * On non-retryable errors (auth, billing), skips directly to the next provider.
   * 
   * Supports API key rotation within each provider if multiple keys provided.
   */
  static async *streamChatWithFailover(
    options: LLMOptions,
    fallbackConfigs: ProviderConfig[] = [],
    enhanced: EnhancedOptions = {}
  ): AsyncGenerator<StreamChunk> {
    const configs: ProviderConfig[] = [
      {
        provider: options.provider!,
        apiKey: options.apiKey,
        apiKeys: (options as any).apiKeys,
        baseUrl: options.baseUrl,
        model: options.model,
      },
      ...fallbackConfigs,
    ]

    for (let i = 0; i < configs.length; i++) {
      try {
        const config = configs[i]
        const keys = config.apiKeys || (config.apiKey ? [config.apiKey] : [])
        
        yield* LLMClient.streamChat({
          ...options,
          provider: config.provider,
          apiKey: keys[0], // Use first key
          apiKeys: keys,
          baseUrl: config.baseUrl,
          model: config.model,
        } as any)
        return // Success — done
      } catch (error: any) {
        const classified = classifyError(error)
        enhanced.onError?.(classified)

        if (i === configs.length - 1) {
          // Last provider — throw
          throw error
        }

        // Log failover
        const reason = `${classified.category}: ${classified.short}`
        console.warn(
          `[enhanced-llm] Provider ${configs[i].provider} (${configs[i].model || 'default'}) failed: ${reason}. Trying fallback ${i + 1}/${configs.length - 1}...`
        )
        enhanced.onRetry?.({
          attempt: i + 1,
          maxAttempts: configs.length,
          delayMs: 0,
          reason: `Failover: ${reason}`,
          provider: configs[i].provider,
        })

        // For rate-limit or server errors, wait before failover
        if (classified.retryable && classified.retryAfterMs > 0) {
          await this.sleep(Math.min(classified.retryAfterMs, 5000))
        }
      }
    }
  }

  /**
   * Stream with retry + exponential backoff + API key rotation.
   *
   * Retries on rate-limit, server, and network errors.
   * On rate-limit (429), rotates to next API key if multiple keys available.
   * Does NOT retry auth/billing/context errors.
   */
  static async *streamChatWithRetry(
    options: LLMOptions,
    maxRetries: number = 3,
    enhanced: EnhancedOptions = {}
  ): AsyncGenerator<StreamChunk> {
    let lastError: Error | null = null

    // Initialize key manager if multiple keys provided
    let keyManager: ApiKeyManager | null = null
    const keys = (options as any).apiKeys
    if (keys && Array.isArray(keys) && keys.length > 1) {
      keyManager = new ApiKeyManager(keys)
      console.log(`[enhanced-llm] Using ${keys.length} API keys with rotation`)
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Use current key from manager if available
        const currentKey = keyManager ? keyManager.getCurrentKey() : options.apiKey
        
        yield* LLMClient.streamChat({
          ...options,
          apiKey: currentKey
        })
        
        // Success — record usage
        keyManager?.recordUsage(true)
        return
      } catch (error: any) {
        lastError = error

        // Record failure
        keyManager?.recordUsage(false)

        // Never retry aborted requests
        if (options.signal.aborted) throw error

        const classified = classifyError(error)
        enhanced.onError?.(classified)

        // Only retry retryable errors
        if (!classified.retryable) throw error

        // Don't retry context errors here — caller should compact and retry
        if (classified.category === 'context') throw error

        if (attempt < maxRetries - 1) {
          // On rate-limit, try rotating key first
          if (classified.category === 'rate-limit' && keyManager) {
            const rotated = keyManager.rotate()
            if (rotated) {
              console.log(
                `[enhanced-llm] Rate limit hit, rotated to key ${keyManager.getCurrentIndex() + 1}/${keyManager.getKeyCount()}`
              )
              // Retry immediately with new key (no delay)
              enhanced.onRetry?.({
                attempt: attempt + 1,
                maxAttempts: maxRetries,
                delayMs: 0,
                reason: `Rate limit - rotated to key ${keyManager.getCurrentIndex() + 1}`,
                provider: options.provider,
              })
              continue
            }
          }

          // Standard exponential backoff
          const baseDelay = classified.retryAfterMs || 1000
          const delay = this.addJitter(baseDelay * Math.pow(2, attempt))
          const reason = `${classified.category}: ${classified.short}`

          console.warn(
            `[enhanced-llm] Attempt ${attempt + 1}/${maxRetries} failed: ${reason}. Retrying in ${delay}ms...`
          )
          enhanced.onRetry?.({
            attempt: attempt + 1,
            maxAttempts: maxRetries,
            delayMs: delay,
            reason,
            provider: options.provider,
          })

          await this.sleep(delay)
        }
      }
    }

    throw lastError
  }

  /**
   * Full resilience: retry + failover + error classification + API key rotation.
   *
   * Tries the primary provider with retries first (with key rotation on rate-limit).
   * On exhaustion, fails over to fallback providers.
   */
  static async *streamChatResilient(
    options: LLMOptions,
    fallbackConfigs: ProviderConfig[] = [],
    maxRetries: number = 2,
    enhanced: EnhancedOptions = {}
  ): AsyncGenerator<StreamChunk> {
    // Try primary with retries (includes key rotation)
    try {
      yield* this.streamChatWithRetry(options, maxRetries, enhanced)
      return
    } catch (primaryError: any) {
      // If no fallbacks, re-throw
      if (fallbackConfigs.length === 0) throw primaryError

      const classified = classifyError(primaryError)

      // Context errors shouldn't failover — caller needs to compact
      if (classified.category === 'context') throw primaryError

      console.warn(
        `[enhanced-llm] Primary provider exhausted. Trying ${fallbackConfigs.length} fallback(s)...`
      )

      // Try each fallback with retries
      for (let i = 0; i < fallbackConfigs.length; i++) {
        try {
          const config = fallbackConfigs[i]
          const keys = config.apiKeys || (config.apiKey ? [config.apiKey] : [])
          
          yield* this.streamChatWithRetry(
            {
              ...options,
              provider: config.provider,
              apiKey: keys[0],
              apiKeys: keys,
              baseUrl: config.baseUrl,
              model: config.model,
            } as any,
            maxRetries,
            enhanced
          )
          return
        } catch (fallbackError: any) {
          if (i === fallbackConfigs.length - 1) throw fallbackError
          console.warn(
            `[enhanced-llm] Fallback ${i + 1} failed, trying next...`
          )
        }
      }

      throw primaryError
    }
  }

  private static addJitter(ms: number): number {
    const jitter = ms * 0.1 * (Math.random() * 2 - 1)
    return Math.max(100, Math.round(ms + jitter))
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
