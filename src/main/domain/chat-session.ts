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
    // 创建 user message
    const userMsg: Message = {
      id: this.generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      status: 'complete'
    }
    this.messages.push(userMsg)
    this.emit('update')

    // 创建 assistant message
    const assistantMsg: Message = {
      id: this.generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'pending'
    }
    this.messages.push(assistantMsg)
    this.emit('update')

    // 执行请求
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

    failedMsg.status = 'cancelled'
    this.emit('update')

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

      // 加载配置
      const config = loadConfig(this.workspacePath)
      
      // 调用 LLMClient
      const { LLMClient } = await import('../infrastructure/llm-client')
      const stream = LLMClient.streamChat({
        messages: this.getHistory(),
        signal: controller.signal,
        provider: config.provider,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
      })

      for await (const chunk of stream) {
        if (chunk.type === 'text' && chunk.text) {
          message.content += chunk.text
          this.emit('update')
        }
      }

      message.status = 'complete'
      this.emit('update')

    } catch (error: any) {
      if (controller.signal.aborted) {
        message.status = 'cancelled'
      } else {
        message.status = 'error'
        message.error = error.message
      }
      this.emit('update')

    } finally {
      this.activeRequests.delete(message.id)
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2)
  }
}
