/**
 * EnhancedLLMClient — Infrastructure Layer
 * 
 * Adds retry and failover on top of LLMClient.
 * Keeps the same streaming interface.
 */

import { LLMClient, type LLMOptions, type StreamChunk } from './llm-client'

export interface ProviderConfig {
  provider: 'anthropic' | 'openai'
  apiKey: string
  baseUrl?: string
  model?: string
}

export class EnhancedLLMClient {
  static async *streamChatWithFailover(
    options: LLMOptions,
    fallbackConfigs: ProviderConfig[] = []
  ): AsyncGenerator<StreamChunk> {
    const configs = [
      { provider: options.provider!, apiKey: options.apiKey!, baseUrl: options.baseUrl, model: options.model },
      ...fallbackConfigs
    ]

    for (let i = 0; i < configs.length; i++) {
      try {
        yield* LLMClient.streamChat({
          ...options,
          provider: configs[i].provider,
          apiKey: configs[i].apiKey,
          baseUrl: configs[i].baseUrl,
          model: configs[i].model,
        })
        return
      } catch (error: any) {
        if (i === configs.length - 1) throw error
        console.warn(`Provider ${configs[i].provider} failed, trying fallback...`)
      }
    }
  }

  static async *streamChatWithRetry(
    options: LLMOptions,
    maxRetries: number = 3
  ): AsyncGenerator<StreamChunk> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        yield* LLMClient.streamChat(options)
        return
      } catch (error: any) {
        lastError = error

        // Don't retry aborted requests
        if (options.signal.aborted) throw error

        if (this.isRateLimitError(error)) {
          const waitTime = Math.pow(2, attempt) * 1000
          await this.sleep(waitTime)
        } else if (attempt < maxRetries - 1) {
          await this.sleep(Math.pow(2, attempt) * 1000)
        }
      }
    }

    throw lastError
  }

  private static isRateLimitError(error: any): boolean {
    return error.message?.includes('429') || error.message?.includes('rate limit')
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
