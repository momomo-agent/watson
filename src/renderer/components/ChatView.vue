<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useChatSession } from '../composables/useChatSession'
import { useSession } from '../composables/useSession'
import MessageCard from './MessageCard.vue'
import ChatInput from './ChatInput.vue'
import StatusIndicator from './StatusIndicator.vue'

const { currentSessionId, updateSessionMessage } = useSession()
const sessionId = computed(() => currentSessionId.value || 'main')

// Reactive chat session that updates when sessionId changes
const chatSessionRef = ref(useChatSession(sessionId.value))
const messages = computed(() => chatSessionRef.value.messages.value)
const isLoading = computed(() => chatSessionRef.value.isLoading.value)
const error = computed(() => chatSessionRef.value.error.value)

const messagesContainer = ref<HTMLElement | null>(null)

const appStatus = computed(() => {
  if (error.value) return 'error'
  if (isLoading.value) return 'thinking'
  if (messages.value.length > 0) return 'complete'
  return 'idle'
})

// Recreate chat session when sessionId changes
watch(sessionId, (newId) => {
  chatSessionRef.value = useChatSession(newId)
})

// Auto-scroll to bottom when messages update
watch(messages, async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}, { deep: true })

// Update session's last message
watch(messages, (msgs) => {
  if (msgs.length > 0 && sessionId.value) {
    const lastMsg = msgs[msgs.length - 1]
    if (lastMsg.role === 'assistant' && lastMsg.content) {
      const preview = lastMsg.content.slice(0, 100)
      updateSessionMessage(sessionId.value, preview)
    }
  }
}, { deep: true })

const handleSend = async (text: string, agentId?: string) => {
  await chatSessionRef.value.sendMessage(text, agentId)
}

const handleCancel = (msgId: string) => {
  chatSessionRef.value.cancel(msgId)
}

const handleRetry = (msgId: string) => {
  chatSessionRef.value.retry(msgId)
}
</script>

<template>
  <div class="chat-view">
    <div class="messages" ref="messagesContainer">
      <div v-if="messages.length === 0" class="empty-state">
        <p>Watson</p>
        <span>Send a message to start.</span>
      </div>

      <MessageCard
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        @cancel="handleCancel(msg.id)"
        @retry="handleRetry(msg.id)"
      />
    </div>

    <div v-if="error" class="global-error">
      {{ error }}
    </div>

    <ChatInput
      :disabled="isLoading"
      :workspace-path="process.cwd()"
      @send="handleSend"
    />

    <StatusIndicator :status="appStatus" />
  </div>
</template>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  flex: 1;
  background: var(--bg-primary);
}

.messages {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1rem;
  scroll-behavior: smooth;
}

/* Custom scrollbar */
.messages::-webkit-scrollbar {
  width: 8px;
}

.messages::-webkit-scrollbar-track {
  background: transparent;
  margin: 4px 0;
}

.messages::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

.messages::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
  background-clip: padding-box;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  gap: 0.5rem;
}

.empty-state p {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.empty-state span {
  font-size: 0.875rem;
}

.global-error {
  padding: 0.5rem 1rem;
  background: #3a1a1a;
  color: #ff6b6b;
  font-size: 0.875rem;
  border-top: 1px solid #ff6b6b33;
}
</style>
