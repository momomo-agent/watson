<script setup lang="ts">
/**
 * MessageActions — Cancel / Retry / Copy actions for a message
 */
import { computed } from 'vue'
import type { MessageStatus } from '../../../shared/chat-types'

const props = defineProps<{
  status: MessageStatus
  errorRetryable?: boolean
  content?: string
}>()

const emit = defineEmits<{
  cancel: []
  retry: []
  copy: []
}>()

const canCancel = computed(() =>
  ['pending', 'streaming', 'tool_calling'].includes(props.status)
)

const canRetry = computed(() =>
  props.status === 'error' && props.errorRetryable !== false
)

const canCopy = computed(() =>
  props.status === 'complete' && !!props.content?.trim()
)

const handleCopy = () => {
  if (props.content) {
    navigator.clipboard.writeText(props.content)
    emit('copy')
  }
}
</script>

<template>
  <div class="message-actions" v-if="canCancel || canRetry || canCopy">
    <button v-if="canCancel" class="action-btn btn-cancel" @click="emit('cancel')">
      取消
    </button>
    <button v-if="canRetry" class="action-btn btn-retry" @click="emit('retry')">
      ↻ 重试
    </button>
    <button v-if="canCopy" class="action-btn btn-copy" @click="handleCopy">
      复制
    </button>
  </div>
</template>

<style scoped>
.message-actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.action-btn {
  padding: 2px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.12s;
}

.action-btn:hover {
  background: var(--bg-hover, #ffffff08);
  color: var(--text-primary);
}

.btn-cancel:hover {
  border-color: var(--error, #ef4444);
  color: var(--error);
}

.btn-retry:hover {
  border-color: var(--accent-color, #3b82f6);
  color: var(--accent-color);
}
</style>
