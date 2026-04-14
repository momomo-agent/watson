/**
 * ChatSession — Domain Layer
 *
 * Manages a single conversation: message history, streaming, cancel, retry.
 * Uses dependency injection for LLM calls (no direct Infrastructure imports).
 *
 * MOMO-60: Tool loop is now handled by agenticAsk (via claw-bridge).
 * ChatSession consumes the stream and updates UI state.
 * The stream yields text_delta, tool_use, tool_result, tool_error, done, error events.
 */

import { EventEmitter } from 'events'

const MAX_AUTO_RETRIES = 3

// ── Types ──

export interface ToolCallInfo {
  id: string
  name: string
  input: any
  status: 'pending' | 'running' | 'complete' | 'error' | 'blocked'
  output?: string
  error?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  status: 'pending' | 'streaming' | 'tool_calling' | 'complete' | 'error' | 'cancelled'
  error?: string
  /** Error category for UI display */
  errorCategory?: string
  /** Whether the error is retryable */
  errorRetryable?: boolean
  /** Tool calls made during this assistant turn */
  toolCalls?: ToolCallInfo[]
  /** Current tool round (for UI progress display) */
  toolRound?: number
  /** Agent ID for multi-agent support (MOMO-50) */
  agentId?: string
}

export interface StreamChunk {
  type: 'text' | 'tool_use' | 'tool_result' | 'tool_error' | 'done' | 'error'
  text?: string
  tool?: { id: string; name: string; input?: any; output?: any; error?: string }
  stopReason?: string
  error?: string
}

/**
 * LLM stream function: takes messages + signal, yields stream chunks.
 * With claw-bridge, this handles the full tool loop internally.
 */
export type LLMStreamFn = (
  messages: Array<{ role: string; content: any }>,
  signal: AbortSignal
) => AsyncGenerator<StreamChunk>

/**
 * Tool executor function: execute a tool and return the result.
 * Still used for coding agent routing (MOMO-52).
 */
export type ToolExecutorFn = (
  tool: { name: string; input: any },
  options: { signal: AbortSignal; workspacePath: string }
) => Promise<{ success: boolean; output?: string; error?: string }>

/** Optional error recovery callbacks injected from application layer */
export interface ErrorRecoveryCallbacks {
  prepareMessages?: (
    messages: Array<{ role: string; content: any }>
  ) => Promise<Array<{ role: string; content: any }>>
  handleError?: (err: any) => {
    classified: { short: string; detail: string; category: string; retryable: boolean }
    action: 'retry' | 'compact' | 'failover' | 'abort'
    retryDelayMs: number
  }
  checkToolCall?: (toolName: string, params: any) => { blocked: boolean; warning: boolean; reason?: string }
  recordToolOutcome?: (toolName: string, params: any, result: any, error?: any) => void
}

export class ChatSession extends EventEmitter {
  id: string
  workspacePath: string
  messages: Message[] = []
  private activeRequests = new Map<string, AbortController>()
  private llmStream: LLMStreamFn
  private toolExecutor?: ToolExecutorFn
  private recovery?: ErrorRecoveryCallbacks
  private persistenceEnabled: boolean = true

  constructor(
    id: string,
    workspacePath: string,
    llmStream: LLMStreamFn,
    recovery?: ErrorRecoveryCallbacks,
    toolExecutor?: ToolExecutorFn
  ) {
    super()
    this.id = id
    this.workspacePath = workspacePath
    this.llmStream = llmStream
    this.recovery = recovery
    this.toolExecutor = toolExecutor
  }

  async loadMessages(): Promise<void> {
    // Messages will be loaded by the workspace manager
  }

  private persistMessage(message: Message): void {
    if (!this.persistenceEnabled) return
    this.emit('persist', message)
  }

  async sendMessage(text: string, agentId?: string): Promise<string> {
    const userMsg: Message = {
      id: this.generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      status: 'complete',
    }
    this.messages.push(userMsg)
    this.persistMessage(userMsg)
    this.emit('update')

    const assistantMsg: Message = {
      id: this.generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'pending',
      agentId,
    }
    this.messages.push(assistantMsg)
    this.persistMessage(assistantMsg)
    this.emit('update')

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

    failedMsg.content = ''
    failedMsg.status = 'pending'
    failedMsg.error = undefined
    failedMsg.errorCategory = undefined
    failedMsg.errorRetryable = undefined
    failedMsg.timestamp = Date.now()
    this.emit('update')

    await this.executeRequest(failedMsg, 0, failedMsg.id)
    return failedMsg.id
  }

  /**
   * Core request execution.
   *
   * MOMO-60: Tool loop is handled by agenticAsk (via claw-bridge).
   * This method just consumes the stream and updates UI state.
   */
  private async executeRequest(message: Message, retryCount: number = 0, historyBeforeId?: string): Promise<void> {
    const controller = new AbortController()
    this.activeRequests.set(message.id, controller)

    try {
      message.status = 'streaming'
      message.toolCalls = []
      message.toolRound = 0
      this.persistMessage(message)
      this.emit('update')

      // Build conversation history
      const history = this.getHistory(historyBeforeId)

      if (controller.signal.aborted) {
        message.status = 'cancelled'
        message.content = message.content || '(cancelled)'
        this.persistMessage(message)
        this.emit('update')
        return
      }

      // Stream from claw-bridge — agenticAsk handles the full tool loop
      const stream = this.llmStream(history, controller.signal)

      for await (const chunk of stream) {
        if (controller.signal.aborted) break

        switch (chunk.type) {
          case 'text':
            if (chunk.text) {
              message.content += chunk.text
              message.status = 'streaming'
              this.persistMessage(message)
              this.emit('update')
            }
            break

          case 'tool_use':
            if (chunk.tool) {
              message.toolRound = (message.toolRound || 0) + 1
              message.status = 'tool_calling'
              message.toolCalls!.push({
                id: chunk.tool.id,
                name: chunk.tool.name,
                input: chunk.tool.input,
                status: 'running',
              })
              this.persistMessage(message)
              this.emit('update')
            }
            break

          case 'tool_result':
            if (chunk.tool) {
              const tc = message.toolCalls!.find(t => t.id === chunk.tool!.id)
              if (tc) {
                tc.status = 'complete'
                tc.output = typeof chunk.tool.output === 'string' ? chunk.tool.output : JSON.stringify(chunk.tool.output)
              }
              message.status = 'streaming'
              this.persistMessage(message)
              this.emit('update')
            }
            break

          case 'tool_error':
            if (chunk.tool) {
              const tc = message.toolCalls!.find(t => t.id === chunk.tool!.id)
              if (tc) {
                tc.status = 'error'
                tc.error = chunk.tool.error
              }
              this.persistMessage(message)
              this.emit('update')
            }
            break

          case 'done':
            message.status = 'complete'
            this.persistMessage(message)
            this.emit('update')
            return

          case 'error':
            message.status = 'error'
            message.error = chunk.error || 'Unknown error'
            this.persistMessage(message)
            this.emit('update')
            return
        }
      }

      // Stream ended without explicit done
      if (controller.signal.aborted) {
        message.status = 'cancelled'
        message.content = message.content || '(cancelled)'
      } else if ((message.status as string) !== 'complete' && (message.status as string) !== 'error') {
        message.status = 'complete'
      }
      this.persistMessage(message)
      this.emit('update')

    } catch (error: any) {
      if (error.name === 'AbortError' || controller.signal.aborted) {
        message.status = 'cancelled'
        message.content = message.content || '(cancelled)'
        this.persistMessage(message)
        this.emit('update')
        return
      }

      // Use error recovery if available
      if (this.recovery?.handleError && retryCount < MAX_AUTO_RETRIES) {
        const { classified, action, retryDelayMs } = this.recovery.handleError(error)

        if (action === 'retry') {
          message.status = 'pending'
          message.content = ''
          message.toolCalls = []
          this.persistMessage(message)
          this.emit('update')
          this.activeRequests.delete(message.id)

          if (retryDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
          }
          return this.executeRequest(message, retryCount + 1, historyBeforeId)
        }

        message.status = 'error'
        message.error = classified.detail
        message.errorCategory = classified.category
        message.errorRetryable = classified.retryable
      } else {
        message.status = 'error'
        message.error = error.message || 'Unknown error'
      }
      this.persistMessage(message)
      this.emit('update')
    } finally {
      this.activeRequests.delete(message.id)
    }
  }

  /**
   * Build conversation history for LLM calls.
   * Only includes complete messages (not pending/error/cancelled).
   */
  private getHistory(beforeMessageId?: string): Array<{ role: string; content: any }> {
    let msgs = this.messages
    if (beforeMessageId) {
      const idx = msgs.findIndex((m) => m.id === beforeMessageId)
      if (idx >= 0) msgs = msgs.slice(0, idx)
    }
    return msgs
      .filter((m) => m.status === 'complete' && m.content)
      .map((m) => ({ role: m.role, content: m.content }))
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2)
  }
}
