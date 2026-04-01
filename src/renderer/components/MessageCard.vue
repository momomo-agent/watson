<script setup lang="ts">
import type { Message } from '../composables/useChatSession'
import { translateToolCall } from '../utils/tool-translator'

const props = defineProps<{
  message: Message
}>()

const emit = defineEmits<{
  cancel: []
  retry: []
}>()

const canCancel = () => ['streaming', 'pending'].includes(props.message.status)
const canRetry = () => ['error', 'cancelled'].includes(props.message.status)

</script>

<template>
  <div class="message-card" :class="[message.role, message.status]">
    <div class="role-label">{{ message.role === 'user' ? 'You' : 'Watson' }}</div>

    <div class="content" v-if="message.content">{{ message.content }}</div>

    <!-- 工具调用显示 -->
    <div v-if="message.toolCalls && message.toolCalls.length > 0" class="tool-calls">
      <div v-for="(tool, idx) in message.toolCalls" :key="idx" class="tool-call">
        <span class="tool-icon">🔧</span>
        <span class="tool-text">{{ translateToolCall(tool.name, tool.input) }}</span>
      </div>
    </div>

    <div class="status-bar">
      <!-- 只在 streaming/pending 时显示详细状态 -->
      <span v-if="message.status === 'pending'" class="status pending">
        <span class="dot-pulse"></span> Thinking...
      </span>
      <span v-else-if="message.status === 'streaming'" class="status streaming">
        <span class="dot-pulse"></span>
      </span>
      <!-- 完成后只显示 ✓ -->
      <span v-else-if="message.status === 'complete'" class="status complete">✓</span>
      <!-- 错误时显示详细信息 -->
      <span v-else-if="message.status === 'error'" class="status error">✗ {{ message.error }}</span>
      <span v-else-if="message.status === 'cancelled'" class="status cancelled">⊘</span>

      <div class="actions" v-if="canCancel() || canRetry()">
        <button v-if="canCancel()" @click="emit('cancel')" class="btn-cancel">Cancel</button>
        <button v-if="canRetry()" @click="emit('retry')" class="btn-retry">Retry</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-card {
  padding: 0.75rem 1rem;
  margin-bottom: 0.75rem;
  border-radius: 8px;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
}

.message-card.user {
  background: #2a2a3a;
}

.message-card.error {
  border-left: 3px solid #ff6b6b;
}

.role-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #888;
  margin-bottom: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}

.tool-calls {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.tool-call {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  background: #0a0a0a;
  border-radius: 4px;
  font-size: 0.8rem;
  color: #999;
}

.tool-icon {
  font-size: 0.9rem;
}

.tool-text {
  flex: 1;
}

.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: #888;
}

.status.error {
  color: #ff6b6b;
}

.status.cancelled {
  color: #ffa500;
}

.dot-pulse {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4a9eff;
  animation: pulse 1s ease-in-out infinite;
  margin-right: 4px;
  vertical-align: middle;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

.actions {
  display: flex;
  gap: 0.5rem;
}

button {
  padding: 0.2rem 0.6rem;
  border: 1px solid #404040;
  border-radius: 4px;
  background: #2a2a2a;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 0.8rem;
}

button:hover {
  background: #353535;
}

.btn-cancel:hover {
  border-color: #ff6b6b;
  color: #ff6b6b;
}

.btn-retry:hover {
  border-color: #4a9eff;
  color: #4a9eff;
}
</style>
