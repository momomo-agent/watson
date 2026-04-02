<script setup lang="ts">
import { computed } from 'vue'
import type { Message, ToolCallInfo } from '../composables/useChatSession'
import { translateToolCall } from '../utils/tool-translator'
import { renderMarkdown } from '../utils/markdown'

const props = defineProps<{
  message: Message
}>()

const emit = defineEmits<{
  cancel: []
  retry: []
}>()

const canCancel = () => ['streaming', 'pending', 'tool_calling'].includes(props.message.status)
const canRetry = () => ['error', 'cancelled'].includes(props.message.status)

const renderedContent = computed(() => {
  if (!props.message.content) return ''
  return renderMarkdown(props.message.content)
})

function toolStatusIcon(status: ToolCallInfo['status']): string {
  switch (status) {
    case 'pending': return '⏳'
    case 'running': return '⚙️'
    case 'complete': return '✅'
    case 'error': return '❌'
    case 'blocked': return '🚫'
    default: return '🔧'
  }
}
</script>

<template>
  <div class="message-card" :class="[message.role, message.status]">
    <div class="role-label">{{ message.role === 'user' ? 'You' : 'Watson' }}</div>

    <div class="content" v-if="message.content" v-html="renderedContent"></div>

    <!-- 工具调用显示 -->
    <div v-if="message.toolCalls && message.toolCalls.length > 0" class="tool-calls">
      <div class="tool-round" v-if="message.toolRound">
        Round {{ message.toolRound }}
      </div>
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
@import 'highlight.js/styles/github-dark.css';

.message-card {
  padding: 1rem;
  margin-bottom: 1rem;
  border-radius: 12px;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  transition: border-color 0.2s;
}

.message-card:hover {
  border-color: #3a3a3a;
}

.message-card.user {
  background: #1e1e2e;
  border-color: #2e2e3e;
}

.message-card.error {
  border-left: 3px solid #ff6b6b;
}

.message-card.tool_calling {
  border-left: 3px solid #4a9eff;
}

.role-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: #666;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
  color: #e0e0e0;
}

.content :deep(a) {
  color: #4a9eff;
  text-decoration: none;
}

.content :deep(a:hover) {
  text-decoration: underline;
}

.content :deep(pre) {
  background: #0d1117;
  border-radius: 6px;
  padding: 1rem;
  overflow-x: auto;
  margin: 0.5rem 0;
}

.content :deep(code) {
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 0.9em;
}

.content :deep(p) {
  margin: 0.5rem 0;
}

.content :deep(ul), .content :deep(ol) {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
}

.tool-calls {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tool-round {
  font-size: 0.7rem;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tool-call {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(74, 158, 255, 0.1);
  border-radius: 6px;
  font-size: 0.85rem;
  color: #aaa;
  border: 1px solid rgba(74, 158, 255, 0.2);
  transition: all 0.3s;
}

.tool-call.running {
  border-color: rgba(74, 158, 255, 0.5);
  background: rgba(74, 158, 255, 0.15);
}

.tool-call.complete {
  border-color: rgba(74, 200, 120, 0.3);
  background: rgba(74, 200, 120, 0.08);
}

.tool-call.error {
  border-color: rgba(255, 107, 107, 0.3);
  background: rgba(255, 107, 107, 0.08);
}

.tool-call.blocked {
  border-color: rgba(255, 165, 0, 0.3);
  background: rgba(255, 165, 0, 0.08);
}

.tool-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.tool-text {
  flex: 1;
}

.tool-error, .tool-blocked {
  font-size: 0.75rem;
  color: #ff6b6b;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-blocked {
  color: #ffa500;
}

.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #2a2a2a;
  font-size: 0.75rem;
  color: #666;
}

.status {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.status.error {
  color: #ff6b6b;
}

.status.cancelled {
  color: #ffa500;
}

.status.complete {
  color: #4a9eff;
}

.status.tool-calling {
  color: #4a9eff;
}

.dot-pulse {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4a9eff;
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
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  background: transparent;
  color: #999;
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.2s;
}

button:hover {
  background: #2a2a2a;
  color: #e0e0e0;
}

.btn-cancel:hover {
  border-color: #ff6b6b;
  color: #ff6b6b;
  background: rgba(255, 107, 107, 0.1);
}

.btn-retry:hover {
  border-color: #4a9eff;
  color: #4a9eff;
  background: rgba(74, 158, 255, 0.1);
}
</style>
