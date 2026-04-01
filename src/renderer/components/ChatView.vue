<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useChatSession } from '../composables/useChatSession'
import MessageCard from './MessageCard.vue'
import ChatInput from './ChatInput.vue'
import StatusIndicator from './StatusIndicator.vue'

const { messages, isLoading, error, sendMessage, cancel, retry } = useChatSession('main')
const messagesContainer = ref<HTMLElement | null>(null)

const appStatus = computed(() => {
  if (error.value) return 'error'
  if (isLoading.value) return 'thinking'
  if (messages.value.length > 0) return 'complete'
  return 'idle'
})

// Auto-scroll to bottom when messages update
watch(messages, async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}, { deep: true })

const handleSend = async (text: string) => {
  await sendMessage(text)
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
        @cancel="cancel(msg.id)"
        @retry="retry(msg.id)"
      />
    </div>

    <div v-if="error" class="global-error">
      {{ error }}
    </div>

    <ChatInput
      :disabled="isLoading"
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
  background: #0a0a0a;
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
  width: 6px;
}

.messages::-webkit-scrollbar-track {
  background: transparent;
}

.messages::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}

.messages::-webkit-scrollbar-thumb:hover {
  background: #444;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  gap: 0.5rem;
}

.empty-state p {
  font-size: 1.5rem;
  font-weight: 600;
  color: #888;
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
