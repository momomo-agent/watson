<script setup lang="ts">
import { ref, nextTick } from 'vue'
import AgentSelector from './AgentSelector.vue'
import AgentManager from './AgentManager.vue'

const props = defineProps<{
  disabled?: boolean
  workspacePath: string
}>()

const emit = defineEmits<{
  send: [text: string, agentId?: string]
}>()

const input = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)
const capturing = ref(false)
const selectedAgentId = ref<string>()
const showAgentManager = ref(false)

const handleSend = () => {
  const text = input.value.trim()
  if (!text || props.disabled) return
  emit('send', text, selectedAgentId.value)
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

// Screen capture
const handleCapture = async () => {
  if (props.disabled || capturing.value) return
  capturing.value = true
  try {
    const result = await (window as any).api.invoke('screen:capture')
    if (result.success) {
      const { windowTitle, appName, content } = result.data
      const prefix = `[Screen: ${appName} - ${windowTitle}]\n\n${content}\n\n`
      input.value = prefix + input.value
      nextTick(() => handleInput())
    }
  } catch (error) {
    console.error('Screen capture failed:', error)
  } finally {
    capturing.value = false
  }
}

const handleAgentSelect = (agentId: string) => {
  selectedAgentId.value = agentId
}

const handleManageAgents = () => {
  showAgentManager.value = true
}

const handleCloseManager = () => {
  showAgentManager.value = false
}
</script>

<template>
  <div class="chat-input">
    <AgentSelector
      :workspace-path="workspacePath"
      :selected-agent-id="selectedAgentId"
      @select="handleAgentSelect"
      @manage="handleManageAgents"
    />
    <button 
      class="capture-btn" 
      @click="handleCapture" 
      :disabled="disabled || capturing"
      title="Capture screen context"
    >
      {{ capturing ? '📸...' : '📸' }}
    </button>
    <textarea
      ref="textarea"
      v-model="input"
      :disabled="disabled"
      placeholder="Send a message... (Shift+Enter for newline, @agent to mention)"
      @keydown="handleKeydown"
      @input="handleInput"
      rows="1"
    />
    <button @click="handleSend" :disabled="disabled || !input.trim()">
      {{ disabled ? '...' : 'Send' }}
    </button>

    <AgentManager
      :show="showAgentManager"
      :workspace-path="workspacePath"
      @close="handleCloseManager"
      @update="handleCloseManager"
    />
  </div>
</template>

<style scoped>
.chat-input {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
  align-items: flex-end;
}

textarea {
  flex: 1;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
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
  border-color: var(--accent-color);
}

textarea:disabled {
  opacity: 0.6;
}

button {
  padding: 0.6rem 1.25rem;
  border: none;
  border-radius: 6px;
  background: var(--accent-color);
  color: white;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.9rem;
  white-space: nowrap;
  min-height: 38px;
}

button:hover:not(:disabled) {
  opacity: 0.9;
}

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.capture-btn {
  padding: 0.6rem;
  min-width: 38px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  font-size: 1.1rem;
}

.capture-btn:hover:not(:disabled) {
  background: var(--bg-secondary);
}
</style>
