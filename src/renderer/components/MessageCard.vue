<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import type { Message, ToolCallInfo } from '../composables/useChatSession'
import { translateToolCall } from '../utils/tool-translator'
import { renderMarkdown } from '../utils/markdown'
import ImagePreview from './ImagePreview.vue'

const props = defineProps<{
  message: Message
}>()

const emit = defineEmits<{
  cancel: []
  retry: []
}>()

// MOMO-50: Load agent info if message has agentId
const agentInfo = ref<{ name: string; avatar: string; color: string } | null>(null)

onMounted(async () => {
  if (props.message.agentId && props.message.role === 'assistant') {
    try {
      const result = await window.api.ipcRenderer.invoke('agent:get', {
        workspacePath: process.cwd(),
        agentId: props.message.agentId
      })
      if (result.success && result.agent) {
        agentInfo.value = {
          name: result.agent.name,
          avatar: result.agent.avatar || 'A',
          color: result.agent.color || '#3b82f6'
        }
      }
    } catch (err) {
      console.warn('Failed to load agent info:', err)
    }
  }
})
const canCancel = () => ['streaming', 'pending', 'tool_calling'].includes(props.message.status)
const canRetry = () => ['error', 'cancelled'].includes(props.message.status)

const renderedContent = computed(() => {
  if (!props.message.content) return ''
  return renderMarkdown(props.message.content)
})

function toolStatusIcon(status: ToolCallInfo['status']): string {
  switch (status) {
    case 'pending': return '○'
    case 'running': return '●'
    case 'complete': return '✓'
    case 'error': return '✕'
    case 'blocked': return '⊘'
    default: return '·'
  }
}

// Tool loop 展开/折叠状态
const isToolsExpanded = ref(false)
const hasTools = computed(() => props.message.toolCalls && props.message.toolCalls.length > 0)

// 自动控制展开/折叠：streaming/tool_calling 时展开，complete 后折叠
watch(() => props.message.status, (newStatus) => {
  if (hasTools.value) {
    if (newStatus === 'tool_calling' || newStatus === 'streaming') {
      isToolsExpanded.value = true
    } else if (newStatus === 'complete') {
      isToolsExpanded.value = false
    }
  }
}, { immediate: true })

// 手动切换
const toggleTools = () => {
  isToolsExpanded.value = !isToolsExpanded.value
}

// 代码复制功能
const handleCopyCode = (event: Event) => {
  const btn = event.currentTarget as HTMLButtonElement
  const code = btn.getAttribute('data-code')
  if (!code) return
  
  navigator.clipboard.writeText(code).then(() => {
    const textSpan = btn.querySelector('.copy-text')
    if (textSpan) {
      textSpan.textContent = 'Copied!'
      setTimeout(() => {
        textSpan.textContent = 'Copy'
      }, 2000)
    }
  })
}

// 图片预览功能
const previewImageSrc = ref<string | null>(null)

const handleImageClick = (event: Event) => {
  const target = event.target as HTMLElement
  if (target.tagName === 'IMG' && target.classList.contains('markdown-image')) {
    const src = target.getAttribute('data-preview-src')
    if (src) {
      previewImageSrc.value = src
    }
  }
}

const closeImagePreview = () => {
  previewImageSrc.value = null
}

const handleContentClick = (event: Event) => {
  handleCopyCode(event)
  handleImageClick(event)
}

// 工具调用摘要
const toolsSummary = computed(() => {
  if (!hasTools.value) return ''
  const total = props.message.toolCalls!.length
  const complete = props.message.toolCalls!.filter(t => t.status === 'complete').length
  const running = props.message.toolCalls!.filter(t => t.status === 'running').length
  const error = props.message.toolCalls!.filter(t => t.status === 'error').length
  
  if (running > 0) return `${running}/${total} tools running...`
  if (error > 0) return `${complete}/${total} complete, ${error} failed`
  if (complete === total) return `${total} tools completed`
  return `${total} tools`
})
</script>

<template>
  <div class="message-card" :class="[message.role, message.status]">
    <div class="message-header">
      <div class="role-info">
        <span v-if="agentInfo" class="agent-avatar" :style="{ color: agentInfo.color }">
          {{ agentInfo.avatar }}
        </span>
        <div class="role-label">
          {{ message.role === 'user' ? 'You' : (agentInfo?.name || 'Watson') }}
        </div>
      </div>
    </div>

    <div class="content" v-if="message.content" v-html="renderedContent" @click="handleContentClick"></div>

    <!-- 图片预览弹窗 -->
    <Teleport to="body">
      <ImagePreview
        v-if="previewImageSrc"
        :src="previewImageSrc"
        @close="closeImagePreview"
      />
    </Teleport>

    <!-- 工具调用显示 -->
    <div v-if="hasTools" class="tool-loop-container">
      <!-- 工具调用头部：可点击折叠/展开 -->
      <div class="tool-loop-header" @click="toggleTools">
        <span class="tool-loop-icon" :class="{ expanded: isToolsExpanded }">▶</span>
        <span class="tool-loop-summary">{{ toolsSummary }}</span>
        <span v-if="message.toolRound" class="tool-round-badge">Round {{ message.toolRound }}</span>
      </div>

      <!-- 工具调用详情：可折叠 -->
      <transition name="tool-expand">
        <div v-show="isToolsExpanded" class="tool-calls">
          <div v-for="(tool, idx) in message.toolCalls" :key="tool.id || idx"
               class="tool-call" :class="tool.status">
            <span class="tool-icon">{{ toolStatusIcon(tool.status) }}</span>
            <span class="tool-text">{{ translateToolCall(tool.name, tool.input) }}</span>
            <span v-if="tool.status === 'error' && tool.error" class="tool-error">
              {{ tool.error }}
            </span>
            <span v-if="tool.status === 'blocked' && tool.error" class="tool-blocked">
              {{ tool.error }}
            </span>
          </div>
        </div>
      </transition>
    </div>

    <div class="status-bar">
      <!-- 只在 streaming/pending/tool_calling 时显示详细状态 -->
      <span v-if="message.status === 'pending'" class="status pending" title="Waiting for response">
        <span class="dot-pulse"></span> Thinking...
      </span>
      <span v-else-if="message.status === 'streaming'" class="status streaming" title="Receiving response">
        <span class="dot-pulse"></span>
      </span>
      <span v-else-if="message.status === 'tool_calling'" class="status tool-calling" title="Executing tools">
        <span class="dot-pulse"></span> Using tools...
      </span>
      <!-- 完成后只显示 ✓ -->
      <span v-else-if="message.status === 'complete'" class="status complete" title="Complete">✓</span>
      <!-- 错误时显示详细信息 -->
      <span v-else-if="message.status === 'error'" class="status error" :title="message.error">
        ✗ {{ message.errorCategory ? `[${message.errorCategory}] ` : '' }}{{ message.error }}
      </span>
      <span v-else-if="message.status === 'cancelled'" class="status cancelled" title="Cancelled by user">⊘</span>

      <div class="actions" v-if="canCancel() || canRetry()">
        <button v-if="canCancel()" @click="emit('cancel')" class="btn-cancel">Cancel</button>
        <button v-if="canRetry()" @click="emit('retry')" class="btn-retry">Retry</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import 'highlight.js/styles/github.css';

.message-card {
  padding: 1rem 1.5rem;
  margin-bottom: 0.5rem;
  border-radius: 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  transition: background var(--duration-fast);
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.message-card.user {
  background: var(--msg-user-bg);
  border: none;
  border-bottom-color: var(--msg-user-border);
  flex-direction: row-reverse;
}

.message-card.user .message-header {
  flex-direction: row-reverse;
}

.message-card.user .content {
  text-align: right;
}

.message-card.user .role-info {
  flex-direction: row-reverse;
}

.message-card:hover {
  background: rgba(0, 0, 0, 0.02);
}

.message-card.error {
  border-left: none;
  background: var(--error-bg);
}

.message-card.tool_calling {
  border-left: none;
}

.message-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0;
  flex-shrink: 0;
}

.role-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.agent-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  flex-shrink: 0;
  background: var(--accent-color);
  color: #fff;
}

.message-card.user .agent-avatar {
  background: var(--accent-color);
  font-size: 13px;
}

.role-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary);
  letter-spacing: 0.03em;
}

.content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
  color: var(--text-primary);
  font-size: var(--text-md);
  flex: 1;
  min-width: 0;
}

.content :deep(a) {
  color: var(--accent-color);
  text-decoration: none;
}

.content :deep(a:hover) {
  text-decoration: underline;
}

/* 代码块容器 */
.content :deep(.code-block-wrapper) {
  margin: 0.75rem 0;
  border-radius: 6px;
  overflow: hidden;
  background: var(--code-bg, #0d1117);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* 代码块头部 */
.content :deep(.code-block-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.content :deep(.code-lang) {
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.content :deep(.code-copy-btn) {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.75rem;
  transition: all var(--duration-fast);
}

.content :deep(.code-copy-btn:hover) {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.content :deep(.code-copy-btn svg) {
  flex-shrink: 0;
}

/* 代码块主体 */
.content :deep(.code-block-wrapper pre) {
  margin: 0;
  padding: 0.75rem;
  background: transparent;
  overflow-x: auto;
}

.content :deep(.code-block-wrapper code) {
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  display: block;
}

/* 代码行 */
.content :deep(.code-line) {
  display: flex;
  min-height: 1.5em;
}

.content :deep(.line-number) {
  display: inline-block;
  width: 2.5rem;
  text-align: right;
  padding-right: 1rem;
  color: rgba(255, 255, 255, 0.3);
  user-select: none;
  flex-shrink: 0;
}

.content :deep(.line-content) {
  flex: 1;
  padding-right: 1rem;
}

/* 行高亮（hover） */
.content :deep(.code-line:hover) {
  background: rgba(255, 255, 255, 0.05);
}

.content :deep(p) {
  margin: 0.5rem 0;
}

.content :deep(ul), .content :deep(ol) {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
}

/* 图片样式 */
.content :deep(.markdown-image) {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius-md);
  margin: 0.75rem 0;
  cursor: pointer;
  transition: all var(--duration-fast);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.content :deep(.markdown-image:hover) {
  border-color: var(--accent-color);
  box-shadow: 0 4px 12px var(--tool-accent-border);
  transform: scale(1.02);
}

.content :deep(.markdown-image:active) {
  transform: scale(0.98);
}

/* Tool Loop Container */
.tool-loop-container {
  margin-top: 1rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-tertiary);
}

.tool-loop-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  user-select: none;
  transition: background var(--duration-fast);
}

.tool-loop-header:hover {
  background: var(--bg-secondary);
}

.tool-loop-icon {
  font-size: var(--text-xs);
  color: var(--accent-color);
  transition: transform var(--duration-normal) ease;
  display: inline-block;
}

.tool-loop-icon.expanded {
  transform: rotate(90deg);
}

.tool-loop-summary {
  flex: 1;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  font-weight: 500;
}

.tool-round-badge {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0.2rem 0.5rem;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
}

.tool-calls {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  padding-top: 0;
}

/* 展开/折叠动画 */
.tool-expand-enter-active,
.tool-expand-leave-active {
  transition: all var(--duration-normal) ease;
  overflow: hidden;
}

.tool-expand-enter-from,
.tool-expand-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.tool-expand-enter-to,
.tool-expand-leave-from {
  max-height: 1000px;
  opacity: 1;
}

.tool-call {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--tool-accent-bg);
  border-radius: var(--radius-sm);
  font-size: var(--text-base);
  color: var(--text-secondary);
  border: 1px solid var(--tool-accent-border);
  transition: all var(--duration-fast);
  cursor: pointer;
}

.tool-call:hover {
  background: var(--tool-accent-bg-hover);
  border-color: var(--tool-accent-border-hover);
}

.tool-call.running {
  border-color: var(--tool-accent-border-hover);
  background: var(--tool-accent-bg-hover);
}

.tool-call.complete {
  border-color: var(--success);
  background: var(--success-bg);
}

.tool-call.error {
  border-color: var(--error);
  background: var(--error-bg);
}

.tool-call.blocked {
  border-color: var(--warning);
  background: var(--warning-bg);
}

.tool-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.tool-text {
  flex: 1;
}

.tool-error, .tool-blocked {
  font-size: var(--text-xs);
  color: var(--error);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-blocked {
  color: var(--warning);
}

.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.status {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.status.error {
  color: var(--error);
}

.status.cancelled {
  color: var(--warning);
}

.status.complete {
  color: var(--accent-color);
}

.status.tool-calling {
  color: var(--accent-color);
}

.dot-pulse {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--accent-color);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1); }
}

.actions {
  display: flex;
  gap: 0.5rem;
}

button {
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--text-sm);
  transition: all var(--duration-fast);
}

button:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.btn-cancel:hover {
  border-color: var(--error);
  color: var(--error);
  background: var(--error-bg);
}

.btn-retry:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
  background: var(--tool-accent-bg);
}
</style>
