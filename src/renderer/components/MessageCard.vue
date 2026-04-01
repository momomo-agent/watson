<script setup lang="ts">
import type { Message } from '../composables/useChatSession'

const props = defineProps<{
  message: Message
}>()

const emit = defineEmits<{
  cancel: []
  retry: []
}>()

const canCancel = () => ['streaming', 'pending'].includes(props.message.status)
const canRetry = () => props.message.status === 'error'
</script>

<template>
  <div class="message-card" :class="message.role">
    <div class="content">{{ message.content }}</div>
    
    <div class="status">
      <span v-if="message.status === 'streaming'">⏳ Streaming...</span>
      <span v-if="message.status === 'complete'">✓</span>
      <span v-if="message.status === 'error'" class="error">✗ {{ message.error }}</span>
    </div>
    
    <div class="actions" v-if="canCancel() || canRetry()">
      <button v-if="canCancel()" @click="emit('cancel')">Cancel</button>
      <button v-if="canRetry()" @click="emit('retry')">Retry</button>
    </div>
  </div>
</template>

<style scoped>
.message-card {
  padding: 1rem;
  margin-bottom: 1rem;
  border-radius: 8px;
  background: #252525;
}

.message-card.user {
  background: #2a2a3a;
}

.content {
  white-space: pre-wrap;
  word-break: break-word;
}

.status {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #888;
}

.error {
  color: #ff6b6b;
}

.actions {
  margin-top: 0.5rem;
  display: flex;
  gap: 0.5rem;
}

button {
  padding: 0.25rem 0.75rem;
  border: 1px solid #404040;
  border-radius: 4px;
  background: #2a2a2a;
  color: #e0e0e0;
  cursor: pointer;
}

button:hover {
  background: #353535;
}
</style>
