/**
 * useChatSession — Reactive bridge to backend ChatSession
 *
 * Uses backend adapter (not window.api directly) for transport isolation.
 */

import { ref, onUnmounted } from 'vue'
import { backend } from '../infrastructure/backend'
import type { ChatMessage, MessageStatus } from '../../shared/chat-types'

export function useChatSession(sessionId: string) {
  const messages = ref<ChatMessage[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const statusText = ref<string | null>(null)

  let cleanup: (() => void) | null = null

  const handleUpdate = (data: { sessionId: string; messages: ChatMessage[]; statusText?: string }) => {
    if (data.sessionId === sessionId) {
      messages.value = data.messages
      statusText.value = data.statusText || null
      isLoading.value = data.messages.some(
        m => m.status === 'pending' || m.status === 'streaming' || m.status === 'tool_calling'
      )
    }
  }

  const loadMessages = async () => {
    try {
      const result = await backend.invoke('chat:load', { sessionId })
      if (result.success && result.messages) {
        messages.value = result.messages
      }
    } catch (err: any) {
      console.error('Failed to load messages:', err)
    }
  }

  loadMessages()
  cleanup = backend.on('chat:update', handleUpdate)

  onUnmounted(() => {
    if (cleanup) { cleanup(); cleanup = null }
  })

  const sendMessage = async (text: string, agentId?: string) => {
    if (!text.trim()) return
    isLoading.value = true
    error.value = null

    try {
      const result = await backend.invoke('chat:send', { sessionId, text, agentId })
      if (result && !result.success) {
        error.value = result.error || 'Failed to send message'
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to send message'
    }
  }

  const cancel = async (messageId: string) => {
    try {
      await backend.invoke('chat:cancel', { sessionId, messageId })
    } catch (err: any) {
      console.error('Cancel failed:', err)
    }
  }

  const retry = async (messageId: string) => {
    error.value = null
    try {
      const result = await backend.invoke('chat:retry', { sessionId, messageId })
      if (result && !result.success) {
        error.value = result.error || 'Retry failed'
      }
    } catch (err: any) {
      error.value = err.message || 'Retry failed'
    }
  }

  return { messages, isLoading, error, statusText, sendMessage, cancel, retry }
}
