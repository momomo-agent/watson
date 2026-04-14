<script setup lang="ts">
/**
 * ChatView — Main conversation view
 *
 * Composes: MessageList + ChatInput + StatusIndicator
 * Manages session lifecycle and message routing.
 */
import { ref, watch, computed, shallowRef, watchEffect } from 'vue'
import { useChatSession } from '../composables/useChatSession'
import { useSession } from '../composables/useSession'
import { useUnread } from '../composables/useUnread'
import { useWorkspace } from '../composables/useWorkspace'
import { speak, isVoiceEnabled } from '../infrastructure/voice'
import MessageList from './chat/MessageList.vue'
import ChatInput from './ChatInput.vue'
import StatusIndicator from './StatusIndicator.vue'

const { currentSessionId, updateSessionMessage, renameSession } = useSession()
const { clearUnread } = useUnread()
const { currentWorkspace } = useWorkspace()
const workspacePath = computed(() => currentWorkspace.value?.path ?? '/tmp')
const sessionId = computed(() => currentSessionId.value || 'main')

// Reactive chat session — recreated when sessionId changes
const chatSession = shallowRef(useChatSession(sessionId.value))
watchEffect(() => {
  chatSession.value = useChatSession(sessionId.value)
})

const messages = computed(() => chatSession.value.messages.value)
const isLoading = computed(() => chatSession.value.isLoading.value)
const error = computed(() => chatSession.value.error.value)
const chatStatusText = computed(() => chatSession.value.statusText.value)

const appStatus = computed(() => {
  if (error.value) return 'error'
  if (isLoading.value) return 'thinking'
  if (messages.value.length > 0) return 'complete'
  return 'idle'
})

watch(sessionId, (newId) => clearUnread(newId))

// TTS: speak assistant messages when they complete
watch(messages, (newMsgs, oldMsgs) => {
  if (!isVoiceEnabled()) return
  const lastNew = newMsgs[newMsgs.length - 1]
  const lastOld = oldMsgs?.[oldMsgs.length - 1]
  if (lastNew?.role === 'assistant' && lastNew.status === 'complete' && lastNew !== lastOld) {
    const text = typeof lastNew.content === 'string' ? lastNew.content : ''
    if (text) speak(text).catch(e => console.error('TTS failed:', e))
  }
}, { deep: true })

// Update session's last message preview
watch(messages, (msgs) => {
  if (msgs.length > 0 && sessionId.value) {
    const lastMsg = msgs[msgs.length - 1]
    if (lastMsg.role === 'assistant' && lastMsg.content) {
      updateSessionMessage(sessionId.value, lastMsg.content.slice(0, 100))
    }
  }
}, { deep: true })

const handleSend = async (text: string, agentId?: string) => {
  // Auto-title with first message
  if (messages.value.length === 0 && sessionId.value) {
    const title = text.slice(0, 30).trim()
    if (title) renameSession(sessionId.value, title)
  }
  await chatSession.value.sendMessage(text, agentId)
}

const handleCancel = (msgId: string) => chatSession.value.cancel(msgId)
const handleRetry = (msgId: string) => chatSession.value.retry(msgId)
</script>

<template>
  <div class="chat-view">
    <MessageList
      :messages="messages"
      :status-text="chatStatusText"
      @cancel="handleCancel"
      @retry="handleRetry"
    >
      <template #empty>
        <div class="empty-state">
          <div class="empty-logo">W</div>
          <p>Watson</p>
          <span>How can I help you today?</span>
        </div>
      </template>
    </MessageList>

    <div v-if="error" class="global-error">{{ error }}</div>

    <ChatInput
      :disabled="isLoading"
      :workspace-path="workspacePath"
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

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  gap: 0.75rem;
}

.empty-logo {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: var(--accent-color);
  color: #fff;
  font-size: 1.75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;
  box-shadow: 0 4px 16px rgba(96, 165, 250, 0.25);
}

.empty-state p {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.empty-state span {
  font-size: 0.9375rem;
  color: var(--text-secondary);
}

.global-error {
  padding: 0.5rem 1rem;
  background: #3a1a1a;
  color: #ff6b6b;
  font-size: 0.875rem;
  border-top: 1px solid #ff6b6b33;
}
</style>
