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

async function checkSetup() {
  const config = await backend.invoke('settings:load')
  const hasProviders = config?.providers?.length && config.providers.some((p: any) => p.apiKey)
  const hasLegacy = config?.apiKey
  needsSetup.value = !hasProviders && !hasLegacy
}

onMounted(checkSetup)

defineExpose({ checkSetup, prefillInput })

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
  // Auto-title with first message — use first sentence or first 30 chars
  if (messages.value.length === 0 && sessionId.value) {
    const raw = text.trim()
    // Try first sentence (split on Chinese/English punctuation)
    const sentenceMatch = raw.match(/^[^。！？.!?\n]+/)
    let title = sentenceMatch ? sentenceMatch[0].trim() : raw
    if (title.length > 40) title = title.slice(0, 38) + '…'
    if (title) renameSession(sessionId.value, title)
  }
  await chatSession.value.sendMessage(text, agentId, attachments)
}

const handleCancel = (msgId: string) => chatSession.value.cancel(msgId)
const handleRetry = (msgId: string) => chatSession.value.retry(msgId)

const chatInputRef = ref<any>(null)

const quickActions = [
  { icon: '📁', title: '分析项目', desc: '了解项目结构', text: () => `分析 ${workspacePath.value} 的项目结构，给我一个概览` },
  { icon: '🖥️', title: '看看屏幕', desc: '截图并分析', text: () => `截取当前屏幕截图，告诉我你看到了什么` },
  { icon: '💻', title: '写代码', desc: '开始一段代码', text: () => `我需要写一段代码，帮我开始` },
  { icon: '🔍', title: '搜索文件', desc: '在项目里搜索', text: () => `在 ${workspacePath.value} 里搜索` },
]

const handleQuickAction = (action: typeof quickActions[0]) => {
  handleSend(action.text())
}

/** Called from App.vue when ProactiveToast is acted on */
function prefillInput(text: string) {
  chatInputRef.value?.prefill(text)
}

</script>

<template>
  <div class="chat-view">
    <MessageList
      :messages="messages"
      :status-text="chatStatusText"
      :session-id="sessionId"
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
  gap: 0;
  padding-bottom: 80px;
}

.empty-logo {
  width: 44px;
  height: 44px;
  border-radius: 11px;
  background: var(--text-primary);
  color: var(--bg-primary);
  font-size: 1.25rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  letter-spacing: -0.02em;
}

.empty-state p {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.025em;
  margin: 0 0 5px;
}

.empty-state span {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  margin-bottom: 24px;
}

.quick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  width: 100%;
  max-width: 340px;
}

.quick-action {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: background var(--duration-fast) ease, border-color var(--duration-fast) ease;
}

.quick-action:hover {
  background: var(--bg-tertiary);
  border-color: var(--border-strong);
}

.qa-icon { font-size: 0.9375rem; margin-bottom: 2px; }
.qa-title { font-size: var(--text-sm); font-weight: 500; color: var(--text-primary); }
.qa-desc { font-size: var(--text-xs); color: var(--text-tertiary); }

.global-error {
  padding: 8px 16px;
  background: var(--error-bg);
  color: var(--error);
  font-size: var(--text-sm);
}

.input-wrapper { padding: 0; background: var(--bg-primary); }

.setup-hint { font-size: var(--text-base); color: var(--text-secondary); margin-bottom: 16px; }

.setup-btn {
  padding: 8px 24px;
  background: var(--text-primary);
  color: var(--bg-primary);
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: opacity var(--duration-fast);
}
.setup-btn:hover { opacity: 0.75; }
</style>
