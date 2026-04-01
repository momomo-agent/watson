<script setup lang="ts">
import { ref } from 'vue'
import { useChatSession } from '../composables/useChatSession'
import MessageCard from './MessageCard.vue'
import ChatInput from './ChatInput.vue'

const { messages, isLoading, sendMessage, cancel, retry } = useChatSession('main')

const handleSend = async (text: string) => {
  await sendMessage(text)
}
</script>

<template>
  <div class="chat-view">
    <div class="messages">
      <MessageCard
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        @cancel="cancel(msg.id)"
        @retry="retry(msg.id)"
      />
    </div>
    
    <ChatInput
      :disabled="isLoading"
      @send="handleSend"
    />
  </div>
</template>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1a1a1a;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}
</style>
