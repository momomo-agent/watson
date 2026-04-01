<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  send: [text: string]
}>()

const input = ref('')

const handleSend = () => {
  if (input.value.trim()) {
    emit('send', input.value)
    input.value = ''
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="chat-input">
    <textarea
      v-model="input"
      :disabled="disabled"
      placeholder="Type a message..."
      @keydown="handleKeydown"
    />
    <button @click="handleSend" :disabled="disabled || !input.trim()">
      Send
    </button>
  </div>
</template>

<style scoped>
.chat-input {
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
  border-top: 1px solid #404040;
  background: #1a1a1a;
}

textarea {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #404040;
  border-radius: 4px;
  background: #252525;
  color: #e0e0e0;
  font-family: inherit;
  font-size: 1rem;
  resize: none;
  min-height: 60px;
}

textarea:focus {
  outline: none;
  border-color: #606060;
}

button {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  background: #4a9eff;
  color: white;
  cursor: pointer;
  font-weight: 500;
}

button:hover:not(:disabled) {
  background: #3a8eef;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
