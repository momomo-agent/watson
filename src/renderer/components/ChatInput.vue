<script setup lang="ts">
import { ref, nextTick } from 'vue'

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  send: [text: string]
}>()

const input = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)

const handleSend = () => {
  const text = input.value.trim()
  if (!text || props.disabled) return
  emit('send', text)
  input.value = ''
  // Reset textarea height
  nextTick(() => {
    if (textarea.value) {
      textarea.value.style.height = 'auto'
    }
  })
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

// Auto-resize textarea
const handleInput = () => {
  if (textarea.value) {
    textarea.value.style.height = 'auto'
    textarea.value.style.height = Math.min(textarea.value.scrollHeight, 200) + 'px'
  }
}
</script>

<template>
  <div class="chat-input">
    <textarea
      ref="textarea"
      v-model="input"
      :disabled="disabled"
      placeholder="Send a message... (Shift+Enter for newline)"
      @keydown="handleKeydown"
      @input="handleInput"
      rows="1"
    />
    <button @click="handleSend" :disabled="disabled || !input.trim()">
      {{ disabled ? '...' : 'Send' }}
    </button>
  </div>
</template>

<style scoped>
.chat-input {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid #333;
  background: #1e1e1e;
  align-items: flex-end;
}

textarea {
  flex: 1;
  padding: 0.6rem 0.75rem;
  border: 1px solid #404040;
  border-radius: 6px;
  background: #252525;
  color: #e0e0e0;
  font-family: inherit;
  font-size: 0.9rem;
  resize: none;
  min-height: 38px;
  max-height: 200px;
  line-height: 1.4;
  overflow-y: auto;
}

textarea:focus {
  outline: none;
  border-color: #4a9eff;
}

textarea:disabled {
  opacity: 0.6;
}

button {
  padding: 0.6rem 1.25rem;
  border: none;
  border-radius: 6px;
  background: #4a9eff;
  color: white;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.9rem;
  white-space: nowrap;
  min-height: 38px;
}

button:hover:not(:disabled) {
  background: #3a8eef;
}

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
