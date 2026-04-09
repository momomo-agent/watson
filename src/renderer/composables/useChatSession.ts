/**
 * useChatSession — UI Layer composable
 *
 * Reactive bridge between Vue components and main process ChatSession.
 * Handles IPC communication and state management.
 *
 * MOMO-34: Supports tool_calling status and toolCalls array.
 */

import { ref, onUnmounted } from 'vue'

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
  errorCategory?: string
  errorRetryable?: boolean
  toolCalls?: ToolCallInfo[]
  toolRound?: number
  agentId?: string // MOMO-50: Multi-agent support
}

export function useChatSession(sessionId: string) {
  const messages = ref<Message[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  let cleanup: (() => void) | null = null

  const handleUpdate = (data: { sessionId: string; messages: Message[] }) => {
    if (data.sessionId === sessionId) {
      messages.value = data.messages
      // Update loading state: loading if any message is pending/streaming/tool_calling
      isLoading.value = data.messages.some(
        m => m.status === 'pending' || m.status === 'streaming' || m.status === 'tool_calling'
      )
    }
  }

  const loadMessages = async () => {
    try {
      const result = await window.api.invoke('chat:load', { sessionId })
      if (result.success && result.messages) {
        messages.value = result.messages
      }
    } catch (err: any) {
      console.error('Failed to load messages:', err)
    }
  }

  // Load messages and register listener immediately (not in onMounted)
  loadMessages()
  cleanup = window.api.on('chat:update', handleUpdate)

  onUnmounted(() => {
    if (cleanup) {
      cleanup()
      cleanup = null
    }
  })

  const sendMessage = async (text: string, agentId?: string) => {
    if (!text.trim()) return

    isLoading.value = true
    error.value = null

    try {
      const result = await window.api.invoke('chat:send', { sessionId, text, agentId })
      if (result && !result.success) {
        error.value = result.error || 'Failed to send message'
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to send message'
    }
    // Note: isLoading will be set to false by handleUpdate when streaming completes
  }

  const cancel = async (messageId: string) => {
    try {
      await window.api.invoke('chat:cancel', { sessionId, messageId })
    } catch (err: any) {
      console.error('Cancel failed:', err)
    }
  }

  const retry = async (messageId: string) => {
    error.value = null
    try {
      const result = await window.api.invoke('chat:retry', { sessionId, messageId })
      if (result && !result.success) {
        error.value = result.error || 'Retry failed'
      }
    } catch (err: any) {
      error.value = err.message || 'Retry failed'
    }
  }

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    cancel,
    retry
  }
}
