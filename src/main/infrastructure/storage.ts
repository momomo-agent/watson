import type { Message } from '../domain/chat-session'

export class Storage {
  static async saveMessages(sessionId: string, messages: Message[]): Promise<void> {
    // SQLite 持久化
    console.log(`Saving ${messages.length} messages for session ${sessionId}`)
  }

  static async loadMessages(sessionId: string): Promise<Message[]> {
    // 从 SQLite 加载
    return []
  }
}
