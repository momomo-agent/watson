<script setup lang="ts">
/**
 * ChatView — Main conversation view
 *
 * Composes: MessageList + ChatInput + StatusIndicator
 * Manages session lifecycle and message routing.
 */
import { ref, watch, computed, shallowRef, watchEffect, useTemplateRef, onMounted } from 'vue'
import { useChatSession } from '../composables/useChatSession'
import { useSession } from '../composables/useSession'
import { useUnread } from '../composables/useUnread'
import { useWorkspace } from '../composables/useWorkspace'
import { speak, isVoiceEnabled } from '../infrastructure/voice'
import { backend } from '../infrastructure/backend'
import type { MessageAttachment } from '../../shared/chat-types'
import MessageList from './chat/MessageList.vue'
import ChatInput from './ChatInput.vue'
import StatusIndicator from './StatusIndicator.vue'

const { currentSessionId, updateSessionMessage, renameSession } = useSession()
const emit = defineEmits<{ openSettings: [] }>()  
const { clearUnread } = useUnread()
const { currentWorkspace } = useWorkspace()
const workspacePath = computed(() => currentWorkspace.value?.path ?? '/tmp')
const sessionId = computed(() => currentSessionId.value || 'main')
const needsSetup = ref(false)

onMounted(async () => {
  const config = await backend.invoke('settings:load')
  needsSetup.value = !config?.providers?.length || !config.providers.some((p: any) => p.apiKey)
})

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

const handleSend = async (text: string, agentId?: string, attachments?: MessageAttachment[]) => {
  // Auto-title with first message
  if (messages.value.length === 0 && sessionId.value) {
    const title = text.slice(0, 30).trim()
    if (title) renameSession(sessionId.value, title)
  }
  await chatSession.value.sendMessage(text, agentId, attachments)
}

const handleCancel = (msgId: string) => chatSession.value.cancel(msgId)
const handleRetry = (msgId: string) => chatSession.value.retry(msgId)

const chatInputRef = ref<any>(null)

const quickActions = [
  { icon: '📁', title: '分析项目', desc: '了解当前项目结构', text: () => `分析 ${workspacePath.value} 的项目结构，给我一个概览` },
  { icon: '🖥️', title: '看看屏幕', desc: '截图并分析当前内容', text: () => `用 screen_sense 截图，告诉我你看到了什么` },
  { icon: '💻', title: '写代码', desc: '帮我开始一段代码', text: () => `我需要写一段代码，帮我开始` },
  { icon: '🔍', title: '搜索文件', desc: '在项目里搜索内容', text: () => `在 ${workspacePath.value} 里搜索` },
]

const handleQuickAction = (action: typeof quickActions[0]) => {
  chatInputRef.value?.prefill(action.text())
}

/** Called from App.vue when ProactiveToast is acted on */
function prefillInput(text: string) {
  chatInputRef.value?.prefill(text)
}

defineExpose({ prefillInput })
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
          <template v-if="needsSetup">
            <span class="setup-hint">开始之前，需要配置 API Key</span>
            <button class="setup-btn" @click="emit('openSettings')">
              打开设置
            </button>
          </template>
          <template v-else>
            <div class="quick-actions">
              <button
                v-for="action in quickActions"
                :key="action.title"
                class="quick-action"
                @click="handleQuickAction(action)"
              >
                <span class="qa-icon">{{ action.icon }}</span>
                <span class="qa-title">{{ action.title }}</span>
                <span class="qa-desc">{{ action.desc }}</span>
              </button>
            </div>
          </template>
        </div>
      </template>
    </MessageList>

    <div v-if="error" class="global-error">{{ error }}</div>

    <div class="input-wrapper">
      <ChatInput
        ref="chatInputRef"
        :disabled="isLoading"
        :workspace-path="workspacePath"
        @send="handleSend"
      />
    </div>

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
  box-shadow: 0 4px 16px rgba(232, 164, 74, 0.2);
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

.quick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-top: 0.5rem;
  width: 100%;
  max-width: 400px;
}

.quick-action {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  padding: 0.75rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}

.quick-action:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent-color);
}

.qa-icon { font-size: 1.25rem; }

.qa-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.qa-desc {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.global-error {
  padding: 0.5rem 1rem;
  background: #3a1a1a;
  color: #ff6b6b;
  font-size: 0.875rem;
  border-top: 1px solid #ff6b6b33;
}

.input-wrapper {
  padding: 8px 16px 12px;
  background: var(--bg-primary);
  border-top: 1px solid var(--border-color);
}

.setup-hint {
  font-size: 0.9375rem;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.setup-btn {
  padding: 0.625rem 1.5rem;
  background: var(--accent-color);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.setup-btn:hover { opacity: 0.85; }
</style>
