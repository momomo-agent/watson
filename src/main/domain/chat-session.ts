/**
 * ChatSession — Domain Layer
 *
 * Manages a single conversation: message history, streaming, cancel, retry.
 * Uses dependency injection for LLM calls (no direct Infrastructure imports).
 *
 * MOMO-34: Agentic Tool Loop
 *   When the LLM returns tool_use blocks:
 *   1. Parse tool_use blocks from the stream
 *   2. Check loop detection (injected via ErrorRecoveryCallbacks)
 *   3. Execute tools via injected ToolExecutor
 *   4. Inject tool_result into conversation history
 *   5. Continue streaming with the LLM
 *   6. Loop until LLM returns pure text (max MAX_TOOL_ROUNDS)
 *
 * Error recovery integration:
 *   - Pre-flight context guard before each LLM call
 *   - Automatic context compaction on overflow errors
 *   - Loop detection for tool calls
 *   - Classified error reporting to UI
 */

import { EventEmitter } from 'events'

const MAX_TOOL_ROUNDS = 5
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
  type: 'text' | 'tool_use' | 'done' | 'error'
  text?: string
  tool?: { id: string; name: string; input: any }
  stopReason?: string
  error?: string
}

/**
 * LLM stream function: takes messages + signal, yields stream chunks.
 * Messages use Anthropic-style content blocks for tool interactions.
 */
export type LLMStreamFn = (
  messages: Array<{ role: string; content: any }>,
  signal: AbortSignal
) => AsyncGenerator<StreamChunk>

/**
 * Tool executor function: execute a tool and return the result.
 */
export type ToolExecutorFn = (
  tool: { name: string; input: any },
  options: { signal: AbortSignal; workspacePath: string }
) => Promise<{ success: boolean; output?: string; error?: string }>

/** Optional error recovery callbacks injected from application layer */
export interface ErrorRecoveryCallbacks {
  /** Prepare messages (context guard + compaction) before LLM call */
  prepareMessages?: (
    messages: Array<{ role: string; content: any }>
  ) => Promise<Array<{ role: string; content: any }>>
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
    // Emit persistence event that will be handled by workspace manager
    this.emit('persist', message)
  }

  async sendMessage(text: string, agentId?: string): Promise<string> {
    // Create user message
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

    // Create assistant message placeholder
    const assistantMsg: Message = {
      id: this.generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'pending',
      agentId, // MOMO-50: Track which agent is responding
    }
    this.messages.push(assistantMsg)
    this.persistMessage(assistantMsg)
    this.emit('update')

    // Execute the request (streaming) with tool loop + error recovery
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

    // Reset the failed message in-place instead of creating a new one
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
   * Core request execution with agentic tool loop.
   *
   * Flow:
   * 1. Build conversation history
   * 2. Stream LLM response
   * 3. If tool_use blocks found → execute tools → inject results → loop (up to MAX_TOOL_ROUNDS)
   * 4. If pure text → done
   * 5. On error → classify + auto-retry/compact/abort
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

      // Build the internal history for LLM (includes tool interactions from THIS turn)
      // turnHistory accumulates assistant content blocks + tool results within this executeRequest
      const turnHistory: Array<{ role: string; content: any }> = []
      let round = 0

      while (round < MAX_TOOL_ROUNDS) {
        round++
        message.toolRound = round

        // Build full conversation history
        let history = [
          ...this.getHistory(historyBeforeId),  // completed messages from prior turns
          ...turnHistory,        // tool interactions from this turn
        ]

        // Pre-flight: context guard + compaction
        if (this.recovery?.prepareMessages) {
          try {
            history = await this.recovery.prepareMessages(history)
          } catch (prepErr: any) {
            console.warn('[chat-session] prepareMessages failed (non-blocking):', prepErr.message)
          }
        }

        if (controller.signal.aborted) break

        // Stream one LLM round
        message.status = 'streaming'
        this.emit('update')

        const stream = this.llmStream(history, controller.signal)
        let textContent = ''
        const toolUses: Array<{ id: string; name: string; input: any }> = []

        for await (const chunk of stream) {
          if (controller.signal.aborted) break

          if (chunk.type === 'text' && chunk.text) {
            textContent += chunk.text
            message.content += chunk.text
            this.persistMessage(message)
            this.emit('update')
          }

          if (chunk.type === 'tool_use' && chunk.tool) {
            toolUses.push(chunk.tool)
            // Add to message.toolCalls for UI display
            message.toolCalls!.push({
              id: chunk.tool.id,
              name: chunk.tool.name,
              input: chunk.tool.input,
              status: 'pending',
            })
            this.persistMessage(message)
            this.emit('update')
          }

          if (chunk.type === 'done') {
            // If stop_reason is NOT tool_use (or there are no tool calls), we're done
            if (chunk.stopReason !== 'tool_use' && toolUses.length === 0) {
              // Pure text response — conversation turn complete
              message.status = 'complete'
              this.persistMessage(message)
              this.emit('update')
              return
            }
          }
        }

        if (controller.signal.aborted) break

        // No tool calls → done
        if (toolUses.length === 0) {
          message.status = 'complete'
          this.persistMessage(message)
          this.emit('update')
          return
        }

        // ── Tool Loop: Execute tools and continue ──

        message.status = 'tool_calling'
        this.persistMessage(message)
        this.emit('update')

        // Build assistant content blocks for this round
        const assistantContentBlocks: any[] = []
        if (textContent) {
          assistantContentBlocks.push({ type: 'text', text: textContent })
        }
        for (const tu of toolUses) {
          assistantContentBlocks.push({
            type: 'tool_use',
            id: tu.id,
            name: tu.name,
            input: tu.input,
          })
        }

        // Add assistant message with content blocks to turn history
        turnHistory.push({
          role: 'assistant',
          content: assistantContentBlocks,
        })

        // Execute each tool call
        for (const toolUse of toolUses) {
          const toolCallInfo = message.toolCalls!.find((tc) => tc.id === toolUse.id)

          // 1. Loop detection check
          if (this.recovery?.checkToolCall) {
            const loopCheck = this.recovery.checkToolCall(toolUse.name, toolUse.input)
            if (loopCheck.blocked) {
              console.warn(`[chat-session] Tool ${toolUse.name} blocked by loop detector: ${loopCheck.reason}`)
              if (toolCallInfo) {
                toolCallInfo.status = 'blocked'
                toolCallInfo.error = loopCheck.reason || 'Loop detected'
              }
              this.persistMessage(message)
              this.emit('update')

              // Add blocked result to turn history
              turnHistory.push({
                role: 'tool_result',
                content: {
                  type: 'tool_result',
                  tool_use_id: toolUse.id,
                  content: `BLOCKED: ${loopCheck.reason || 'Loop detected — tool call blocked to prevent infinite loop.'}`,
                  is_error: true,
                },
              })
              continue
            }
            if (loopCheck.warning) {
              console.warn(`[chat-session] Tool ${toolUse.name} loop warning: ${loopCheck.reason}`)
            }
          }

          // 2. Execute the tool
          if (toolCallInfo) {
            toolCallInfo.status = 'running'
            this.persistMessage(message)
            this.emit('update')
          }

          let toolResult: { success: boolean; output?: string; error?: string }

          if (this.toolExecutor) {
            try {
              toolResult = await this.toolExecutor(
                { name: toolUse.name, input: toolUse.input },
                { signal: controller.signal, workspacePath: this.workspacePath }
              )
            } catch (execErr: any) {
              toolResult = { success: false, error: execErr.message || 'Tool execution failed' }
            }
          } else {
            toolResult = { success: false, error: 'No tool executor configured' }
          }

          if (controller.signal.aborted) break

          // 3. Record outcome for loop detection
          if (this.recovery?.recordToolOutcome) {
            this.recovery.recordToolOutcome(
              toolUse.name,
              toolUse.input,
              toolResult.success ? toolResult.output : undefined,
              toolResult.success ? undefined : toolResult.error
            )
          }

          // 4. Update UI
          if (toolCallInfo) {
            toolCallInfo.status = toolResult.success ? 'complete' : 'error'
            toolCallInfo.output = toolResult.output
            toolCallInfo.error = toolResult.error
            this.persistMessage(message)
            this.emit('update')
          }

          // 5. Add tool result to turn history
          const resultContent = toolResult.success
            ? (toolResult.output || '(no output)')
            : `Error: ${toolResult.error || 'Unknown error'}`

          turnHistory.push({
            role: 'tool_result',
            content: {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: resultContent,
              is_error: !toolResult.success,
            },
          })
        }

        if (controller.signal.aborted) break

        // Clear text accumulator for next round (content already appended to message.content)
        // Continue loop — next iteration will call LLM with the tool results
        message.status = 'streaming'
        this.persistMessage(message)
        this.emit('update')
      }

      // Exited loop — either aborted or hit MAX_TOOL_ROUNDS
      if (controller.signal.aborted) {
        message.status = 'cancelled'
        message.content = message.content || '(cancelled)'
        this.persistMessage(message)
        this.emit('update')
        return
      }

      // Hit max rounds — do one final LLM call WITHOUT tools to get a text summary
      console.warn(`[chat-session] Hit max tool rounds (${MAX_TOOL_ROUNDS}). Making final text-only call.`)
      message.status = 'streaming'
      this.persistMessage(message)
      this.emit('update')

      let finalHistory = [
        ...this.getHistory(historyBeforeId),
        ...turnHistory,
      ]

      if (this.recovery?.prepareMessages) {
        try {
          finalHistory = await this.recovery.prepareMessages(finalHistory)
        } catch {}
      }

      // For the final call, we pass the same stream function
      // The LLM should naturally respond with text since all tools have been executed
      const finalStream = this.llmStream(finalHistory, controller.signal)
      for await (const chunk of finalStream) {
        if (controller.signal.aborted) break
        if (chunk.type === 'text' && chunk.text) {
          message.content += chunk.text
          this.persistMessage(message)
          this.emit('update')
        }
      }

      message.status = controller.signal.aborted ? 'cancelled' : 'complete'
      this.persistMessage(message)
      this.emit('update')
    } catch (error: any) {
      if (controller.signal.aborted) {
        message.status = 'cancelled'
        message.content = message.content || '(cancelled)'
        this.persistMessage(message)
        this.emit('update')
        return
      }

      // Use error recovery if available
      if (this.recovery?.handleError && retryCount < MAX_AUTO_RETRIES) {
        const { classified, action, retryDelayMs } = this.recovery.handleError(error)

        switch (action) {
          case 'retry':
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

          case 'compact':
            message.status = 'pending'
            message.content = ''
            message.toolCalls = []
            this.persistMessage(message)
            this.emit('update')
            this.activeRequests.delete(message.id)
            return this.executeRequest(message, retryCount + 1, historyBeforeId)

          case 'failover':
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
      this.persistMessage(message)
      this.emit('update')
    } finally {
      this.activeRequests.delete(message.id)
    }
  }

  /**
   * Build conversation history for LLM calls.
   * Only includes complete messages (not pending/error/cancelled).
   * Returns messages with content in a format ready for the LLM.
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
