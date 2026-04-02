/**
 * ChatSession — Domain Layer
 *
 * Manages a single conversation: message history, streaming, cancel, retry.
 * Uses dependency injection for LLM calls (no direct Infrastructure imports).
 *
 * Error recovery integration:
 *   - Pre-flight context guard before each LLM call
 *   - Automatic context compaction on overflow errors
 *   - Loop detection for tool calls
 *   - Classified error reporting to UI
 */

import { EventEmitter } from 'events'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  status: 'pending' | 'streaming' | 'complete' | 'error' | 'cancelled'
  error?: string
  /** Error category for UI display */
  errorCategory?: string
  /** Whether the error is retryable */
  errorRetryable?: boolean
}

export interface StreamChunk {
  type: 'text' | 'tool_use' | 'done'
  text?: string
  tool?: { name: string; input: any }
}

export type LLMStreamFn = (
  messages: Array<{ role: string; content: string }>,
  signal: AbortSignal
) => AsyncGenerator<StreamChunk>

/** Optional error recovery callbacks injected from application layer */
export interface ErrorRecoveryCallbacks {
  /** Prepare messages (context guard + compaction) before LLM call */
  prepareMessages?: (
    messages: Array<{ role: string; content: string }>
  ) => Promise<Array<{ role: string; content: string }>>
  /** Classify and handle an error, return recovery action */
  handleError?: (err: any) => {
    classified: { short: string; detail: string; category: string; retryable: boolean }
    action: 'retry' | 'compact' | 'failover' | 'abort'
    retryDelayMs: number
  }
  /** Check tool call for loops */
  checkToolCall?: (toolName: string, params: any) => { blocked: boolean; warning: boolean; reason?: string }
  /** Record tool outcome */
  recordToolOutcome?: (toolName: string, params: any, result: any, error?: any) => void
}

export class ChatSession extends EventEmitter {
  id: string
  workspacePath: string
  messages: Message[] = []
  private activeRequests = new Map<string, AbortController>()
  private llmStream: LLMStreamFn
  private recovery?: ErrorRecoveryCallbacks

  constructor(
    id: string,
    workspacePath: string,
    llmStream: LLMStreamFn,
    recovery?: ErrorRecoveryCallbacks
  ) {
    super()
    this.id = id
    this.workspacePath = workspacePath
    this.llmStream = llmStream
    this.recovery = recovery
  }

  async sendMessage(text: string): Promise<string> {
    // Create user message
    const userMsg: Message = {
      id: this.generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      status: 'complete',
    }
    this.messages.push(userMsg)
    this.emit('update')

    // Create assistant message placeholder
    const assistantMsg: Message = {
      id: this.generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'pending',
    }
    this.messages.push(assistantMsg)
    this.emit('update')

    // Execute the request (streaming) with error recovery
    await this.executeRequest(assistantMsg)

    return assistantMsg.id
  }

  cancel(messageId: string): void {
    const controller = this.activeRequests.get(messageId)
    if (controller) {
      controller.abort()
    }
  }

  async retry(messageId: string): Promise<string> {
    const failedMsg = this.messages.find((m) => m.id === messageId)
    if (!failedMsg) throw new Error('Message not found')

    // Mark old message as cancelled
    failedMsg.status = 'cancelled'
    this.emit('update')

    // Create new assistant message
    const newMsg: Message = {
      id: this.generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'pending',
    }
    this.messages.push(newMsg)
    this.emit('update')

    await this.executeRequest(newMsg)
    return newMsg.id
  }

  private async executeRequest(message: Message, retryCount: number = 0): Promise<void> {
    const MAX_AUTO_RETRIES = 3
    const controller = new AbortController()
    this.activeRequests.set(message.id, controller)

    try {
      message.status = 'streaming'
      this.emit('update')

      // Build history and apply pre-flight checks
      let history = this.getHistory()

      // Pre-flight: context guard + compaction
      if (this.recovery?.prepareMessages) {
        try {
          history = await this.recovery.prepareMessages(history)
        } catch (prepErr: any) {
          console.warn('[chat-session] prepareMessages failed (non-blocking):', prepErr.message)
        }
      }

      const stream = this.llmStream(history, controller.signal)

      for await (const chunk of stream) {
        if (controller.signal.aborted) break

        if (chunk.type === 'text' && chunk.text) {
          message.content += chunk.text
          this.emit('update')
        }
      }

      if (!controller.signal.aborted) {
        message.status = 'complete'
        this.emit('update')
      }
    } catch (error: any) {
      if (controller.signal.aborted) {
        message.status = 'cancelled'
        message.content = message.content || '(cancelled)'
        this.emit('update')
        return
      }

      // Use error recovery if available
      if (this.recovery?.handleError && retryCount < MAX_AUTO_RETRIES) {
        const { classified, action, retryDelayMs } = this.recovery.handleError(error)

        switch (action) {
          case 'retry':
            // Auto-retry with delay
            message.status = 'pending'
            message.content = ''
            this.emit('update')
            this.activeRequests.delete(message.id)

            if (retryDelayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
            }
            return this.executeRequest(message, retryCount + 1)

          case 'compact':
            // Compact history and retry
            message.status = 'pending'
            message.content = ''
            this.emit('update')
            this.activeRequests.delete(message.id)
            return this.executeRequest(message, retryCount + 1)

          case 'failover':
            // Failover is handled at the LLM client level
            // Fall through to error state
            break

          case 'abort':
          default:
            break
        }

        // Set classified error info on the message
        message.status = 'error'
        message.error = classified.detail
        message.errorCategory = classified.category
        message.errorRetryable = classified.retryable
      } else {
        message.status = 'error'
        message.error = error.message || 'Unknown error'
      }
      this.emit('update')
    } finally {
      this.activeRequests.delete(message.id)
    }
  }

  /**
   * Build conversation history for LLM calls.
   * Only includes complete messages (not pending/error/cancelled).
   */
  private getHistory(): Array<{ role: string; content: string }> {
    return this.messages
      .filter((m) => m.status === 'complete' && m.content)
      .map((m) => ({ role: m.role, content: m.content }))
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2)
  }
}
