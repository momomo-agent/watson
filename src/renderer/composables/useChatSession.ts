import { ref, onMounted, onUnmounted } from 'vue'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  status: 'pending' | 'streaming' | 'complete' | 'error' | 'cancelled'
  error?: string
}

export function useChatSession(sessionId: string) {
  const messages = ref<Message[]>([])
  const isLoading = ref(false)

  const handleUpdate = (event: any, data: { sessionId: string, messages: Message[] }) => {
    if (data.sessionId === sessionId) {
      messages.value = data.messages
    }
  }

  onMounted(() => {
    window.api.on('chat:update', handleUpdate)
  })

  onUnmounted(() => {
    window.api.off('chat:update', handleUpdate)
  })

  const sendMessage = async (text: string) => {
    isLoading.value = true
    try {
      await window.api.invoke('chat:send', { sessionId, text })
    } finally {
      isLoading.value = false
    }
  }

  const cancel = (messageId: string) => {
    window.api.invoke('chat:cancel', { sessionId, messageId })
  }

  const retry = (messageId: string) => {
    window.api.invoke('chat:retry', { sessionId, messageId })
  }

  return {
    messages,
    isLoading,
    sendMessage,
    cancel,
    retry
  }
}
