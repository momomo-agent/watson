/**
 * ChatSession — Domain Layer
 * 
 * Manages a single conversation: message history, streaming, cancel, retry.
 * Delegates LLM calls to infrastructure layer (EnhancedLLMClient).
 */

import { EventEmitter } from 'events'
import { loadConfig } from '../infrastructure/config'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  status: 'pending' | 'streaming' | 'complete' | 'error' | 'cancelled'
  error?: string
}

export class ChatSession extends EventEmitter {
  id: string
  workspacePath: string
  messages: Message[] = []
  private activeRequests = new Map<string, AbortController>()

  constructor(id: string, workspacePath: string = process.cwd()) {
    super()
    this.id = id
    this.workspacePath = workspacePath
  }

  async sendMessage(text: string): Promise<string> {
    // Create user message
    const userMsg: Message = {
      id: this.generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      status: 'complete'
    }
    this.messages.push(userMsg)
    this.emit('update')

    // Create assistant message placeholder
    const assistantMsg: Message = {
      id: this.generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'pending'
    }
    this.messages.push(assistantMsg)
    this.emit('update')

    // Execute the request (streaming)
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
    const failedMsg = this.messages.find(m => m.id === messageId)
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
      status: 'pending'
    }
    this.messages.push(newMsg)
    this.emit('update')

    await this.executeRequest(newMsg)
    return newMsg.id
  }

  private async executeRequest(message: Message): Promise<void> {
    const controller = new AbortController()
    this.activeRequests.set(message.id, controller)

    try {
      message.status = 'streaming'
      this.emit('update')

      // Load config (infrastructure layer)
      const config = loadConfig(this.workspacePath)

      // Build message history for LLM
      const history = this.getHistory()

      // Call LLMClient via EnhancedLLMClient (infrastructure layer)
      const { EnhancedLLMClient } = await import('../infrastructure/enhanced-llm-client')
      const stream = EnhancedLLMClient.streamChatWithRetry({
        messages: history,
        signal: controller.signal,
        provider: config.provider,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
      }, 2)

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
      .filter(m => m.status === 'complete' && m.content)
      .map(m => ({ role: m.role, content: m.content }))
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2)
  }
}
