/**
 * ChatSession — Domain Layer
 *
 * Manages a single conversation: message history, streaming, cancel, retry.
 * Uses dependency injection for LLM calls (no direct Infrastructure imports).
 *
 * Tool loop, error recovery, context compaction are all handled by Claw.
 * ChatSession consumes the stream and updates UI state.
 *
 * Messages use FlowSegment[] to represent the ordered sequence of
 * thinking → tool calls → text that the LLM produces.
 */

import { EventEmitter } from 'events'
import type {
  ChatMessage,
  MessageStatus,
  FlowSegment,
  ToolCall,
  ToolCallStatus,
  ChatUpdateEvent,
} from '../../shared/chat-types'

// ── Stream Protocol ──

export interface StreamChunk {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'tool_error' | 'done' | 'error'
  text?: string
  thinking?: string
  tool?: {
    id: string
    name: string
    input?: any
    output?: any
    error?: string
    durationMs?: number
  }
  stopReason?: string
  error?: string
  errorCategory?: string
  errorRetryable?: boolean
}

export type LLMStreamFn = (
  messages: Array<{ role: string; content: any }>,
  signal: AbortSignal
) => AsyncGenerator<StreamChunk>

// ── Session ──

export class ChatSession extends EventEmitter {
  id: string
  workspacePath: string
  messages: ChatMessage[] = []
  private activeRequests = new Map<string, AbortController>()
  private llmStream: LLMStreamFn
  private statusText: string | null = null

  constructor(id: string, workspacePath: string, llmStream: LLMStreamFn) {
    super()
    this.id = id
    this.workspacePath = workspacePath
    this.llmStream = llmStream
  }

  // ── Public API ──

  async sendMessage(text: string, agentId?: string): Promise<string> {
    const userMsg: ChatMessage = {
      id: this.genId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      status: 'complete',
    }
    this.messages.push(userMsg)
    this.persist(userMsg)
    this.emitUpdate()

    const assistantMsg: ChatMessage = {
      id: this.genId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'pending',
      flow: [],
      toolCalls: [],
      agentId,
    }
    this.messages.push(assistantMsg)
    this.persist(assistantMsg)
    this.emitUpdate()

    await this.executeStream(assistantMsg)
    return assistantMsg.id
  }

  cancel(messageId: string): void {
    this.activeRequests.get(messageId)?.abort()
  }

  async retry(messageId: string): Promise<string> {
    const msg = this.messages.find(m => m.id === messageId)
    if (!msg) throw new Error('Message not found')

    msg.content = ''
    msg.status = 'pending'
    msg.error = undefined
    msg.flow = []
    msg.toolCalls = []
    msg.timestamp = Date.now()
    this.emitUpdate()

    await this.executeStream(msg, msg.id)
    return msg.id
  }

  getUpdateEvent(): ChatUpdateEvent {
    return {
      sessionId: this.id,
      messages: this.messages,
      statusText: this.statusText || undefined,
    }
  }

  // ── Stream Execution ──

  private async executeStream(message: ChatMessage, historyBeforeId?: string): Promise<void> {
    const controller = new AbortController()
    this.activeRequests.set(message.id, controller)

    // Flow builder state
    let currentThinking: FlowSegment | null = null
    let currentToolGroup: FlowSegment | null = null

    const ensureFlow = () => { if (!message.flow) message.flow = [] }
    const ensureToolCalls = () => { if (!message.toolCalls) message.toolCalls = [] }

    const flushThinking = () => {
      if (currentThinking) {
        ensureFlow()
        message.flow!.push(currentThinking)
        currentThinking = null
      }
    }

    const flushToolGroup = () => {
      if (currentToolGroup) {
        ensureFlow()
        message.flow!.push(currentToolGroup)
        currentToolGroup = null
      }
    }

    const getOrCreateToolGroup = (): FlowSegment & { type: 'tool_group' } => {
      if (!currentToolGroup || currentToolGroup.type !== 'tool_group') {
        flushThinking()
        flushToolGroup()
        currentToolGroup = { type: 'tool_group', tools: [] }
      }
      return currentToolGroup as FlowSegment & { type: 'tool_group' }
    }

    try {
      message.status = 'streaming'
      this.setStatus('正在回复...')
      this.persist(message)
      this.emitUpdate()

      if (controller.signal.aborted) {
        this.finishMessage(message, 'cancelled')
        return
      }

      const history = this.buildHistory(historyBeforeId)
      const stream = this.llmStream(history, controller.signal)

      for await (const chunk of stream) {
        if (controller.signal.aborted) break

        switch (chunk.type) {
          case 'thinking': {
            if (chunk.thinking) {
              flushToolGroup()
              if (!currentThinking) {
                currentThinking = { type: 'thinking', content: '' }
              }
              if (currentThinking.type === 'thinking') {
                currentThinking.content += chunk.thinking
              }
              this.setStatus('正在思考...')
              this.emitUpdate()
            }
            break
          }

          case 'text': {
            if (chunk.text) {
              flushThinking()
              flushToolGroup()
              message.content += chunk.text

              // Add or append to text segment in flow
              ensureFlow()
              const lastSeg = message.flow![message.flow!.length - 1]
              if (lastSeg?.type === 'text') {
                lastSeg.content += chunk.text
              } else {
                message.flow!.push({ type: 'text', content: chunk.text })
              }

              message.status = 'streaming'
              this.setStatus('正在回复...')
              this.persist(message)
              this.emitUpdate()
            }
            break
          }

          case 'tool_use': {
            if (chunk.tool) {
              flushThinking()
              const toolCall: ToolCall = {
                id: chunk.tool.id,
                name: chunk.tool.name,
                input: chunk.tool.input || {},
                status: 'running',
              }

              // Add to flat list
              ensureToolCalls()
              message.toolCalls!.push(toolCall)

              // Add to flow tool group
              const group = getOrCreateToolGroup()
              group.tools.push(toolCall)

              message.status = 'tool_calling'
              this.setStatus(`正在使用 ${chunk.tool.name}...`)
              this.persist(message)
              this.emitUpdate()
            }
            break
          }

          case 'tool_result': {
            if (chunk.tool) {
              const tc = this.findToolCall(message, chunk.tool.id)
              if (tc) {
                tc.status = 'complete'
                tc.output = typeof chunk.tool.output === 'string'
                  ? chunk.tool.output
                  : JSON.stringify(chunk.tool.output)
                if (chunk.tool.durationMs) tc.durationMs = chunk.tool.durationMs
              }
              message.status = 'streaming'
              this.setStatus('正在回复...')
              this.persist(message)
              this.emitUpdate()
            }
            break
          }

          case 'tool_error': {
            if (chunk.tool) {
              const tc = this.findToolCall(message, chunk.tool.id)
              if (tc) {
                tc.status = 'error'
                tc.error = chunk.tool.error
              }
              this.persist(message)
              this.emitUpdate()
            }
            break
          }

          case 'done': {
            flushThinking()
            flushToolGroup()
            this.finishMessage(message, 'complete')
            return
          }

          case 'error': {
            flushThinking()
            flushToolGroup()
            message.error = chunk.error || 'Unknown error'
            message.errorCategory = chunk.errorCategory as any
            message.errorRetryable = chunk.errorRetryable
            this.finishMessage(message, 'error')
            return
          }
        }
      }

      // Stream ended without explicit done/error
      flushThinking()
      flushToolGroup()
      if (controller.signal.aborted) {
        this.finishMessage(message, 'cancelled')
      } else if ((message.status as string) !== 'complete' && (message.status as string) !== 'error') {
        this.finishMessage(message, 'complete')
      }

    } catch (error: any) {
      flushThinking()
      flushToolGroup()
      if (error.name === 'AbortError' || controller.signal.aborted) {
        this.finishMessage(message, 'cancelled')
      } else {
        message.error = error.message || 'Stream failed'
        this.finishMessage(message, 'error')
      }
    } finally {
      this.activeRequests.delete(message.id)
    }
  }

  // ── Helpers ──

  private findToolCall(message: ChatMessage, toolId: string): ToolCall | undefined {
    // Search flat list
    const fromFlat = message.toolCalls?.find(t => t.id === toolId)
    if (fromFlat) return fromFlat

    // Search flow segments (same object reference if added correctly)
    for (const seg of message.flow || []) {
      if (seg.type === 'tool_group') {
        const found = seg.tools.find(t => t.id === toolId)
        if (found) return found
      }
    }
    return undefined
  }

  private finishMessage(message: ChatMessage, status: MessageStatus): void {
    message.status = status
    if (status === 'cancelled' && !message.content) {
      message.content = '(cancelled)'
    }
    this.setStatus(null)
    this.persist(message)
    this.emitUpdate()
  }

  private setStatus(text: string | null): void {
    this.statusText = text
  }

  private emitUpdate(): void {
    this.emit('update', this.getUpdateEvent())
  }

  private persist(message: ChatMessage): void {
    this.emit('persist', message)
  }

  private buildHistory(beforeMessageId?: string): Array<{ role: string; content: any }> {
    let msgs = this.messages
    if (beforeMessageId) {
      const idx = msgs.findIndex(m => m.id === beforeMessageId)
      if (idx >= 0) msgs = msgs.slice(0, idx)
    }
    return msgs
      .filter(m => m.status === 'complete' && m.content)
      .map(m => ({ role: m.role, content: m.content }))
  }

  private genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2)
  }
}
