/**
 * ChatSession — Domain Layer
 *
 * Manages a single conversation: message history, streaming, cancel, retry.
 * Uses dependency injection for LLM calls (no direct Infrastructure imports).
 *
 * Tool loop, error recovery, context compaction are all handled by Claw.
 * ChatSession consumes the stream and updates UI state.
 */

import { EventEmitter } from 'events'

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
  toolCalls?: ToolCallInfo[]
  toolRound?: number
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
 * Claw handles the full tool loop internally.
 */
export type LLMStreamFn = (
  messages: Array<{ role: string; content: any }>,
  signal: AbortSignal
) => AsyncGenerator<StreamChunk>

export class ChatSession extends EventEmitter {
  id: string
  workspacePath: string
  messages: Message[] = []
  private activeRequests = new Map<string, AbortController>()
  private llmStream: LLMStreamFn
  private persistenceEnabled: boolean = true

  constructor(id: string, workspacePath: string, llmStream: LLMStreamFn) {
    super()
    this.id = id
    this.workspacePath = workspacePath
    this.llmStream = llmStream
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

    await this.executeStream(assistantMsg)
    return assistantMsg.id
  }

  cancel(messageId: string): void {
    this.activeRequests.get(messageId)?.abort()
  }

  async retry(messageId: string): Promise<string> {
    const msg = this.messages.find((m) => m.id === messageId)
    if (!msg) throw new Error('Message not found')

    msg.content = ''
    msg.status = 'pending'
    msg.error = undefined
    msg.timestamp = Date.now()
    this.emit('update')

    await this.executeStream(msg, msg.id)
    return msg.id
  }

  /**
   * Consume the Claw stream and update UI state.
   * Claw handles tool loop, error recovery, context compaction internally.
   */
  private async executeStream(message: Message, historyBeforeId?: string): Promise<void> {
    const controller = new AbortController()
    this.activeRequests.set(message.id, controller)

    try {
      message.status = 'streaming'
      message.toolCalls = []
      message.toolRound = 0
      this.persistMessage(message)
      this.emit('update')

      if (controller.signal.aborted) {
        message.status = 'cancelled'
        message.content = message.content || '(cancelled)'
        this.persistMessage(message)
        this.emit('update')
        return
      }

      const history = this.buildHistory(historyBeforeId)
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
                tc.output = typeof chunk.tool.output === 'string'
                  ? chunk.tool.output
                  : JSON.stringify(chunk.tool.output)
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

      // Stream ended without explicit done/error
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
      } else {
        message.status = 'error'
        message.error = error.message || 'Stream failed'
      }
      this.persistMessage(message)
      this.emit('update')
    } finally {
      this.activeRequests.delete(message.id)
    }
  }

  private buildHistory(beforeMessageId?: string): Array<{ role: string; content: any }> {
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
