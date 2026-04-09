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
      <svg v-if="!capturing" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
      <span v-else>●</span>
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
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.9rem;
  resize: none;
  min-height: 42px;
  max-height: 200px;
  line-height: 1.5;
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
  padding: 0.5rem 1.25rem;
  border: none;
  border-radius: 8px;
  background: var(--accent-color);
  color: white;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.875rem;
  white-space: nowrap;
  min-height: 36px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

button:hover:not(:disabled) {
  background: var(--accent-hover);
  box-shadow: var(--shadow-md);
}

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

.capture-btn {
  padding: 0.5rem;
  min-width: 36px;
  height: 36px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 1rem;
  border-radius: 6px;
  box-shadow: none;
}

.capture-btn:hover:not(:disabled) {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  box-shadow: none;
}

.capture-btn svg {
  width: 16px;
  height: 16px;
}
</style>
