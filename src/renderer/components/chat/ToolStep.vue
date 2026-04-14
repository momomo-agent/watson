<script setup lang="ts">
/**
 * ToolStep — Single tool call display
 *
 * Shows: icon + humanized name + status indicator
 * Expandable to show input/output details
 */
import { ref, computed } from 'vue'
import type { ToolCall } from '../../../shared/chat-types'
import { humanizeTool, toolIcon } from '../../utils/tool-humanize'

const props = defineProps<{
  tool: ToolCall
}>()

const expanded = ref(false)
const toggle = () => { expanded.value = !expanded.value }

const displayName = computed(() => props.tool.displayName || humanizeTool(props.tool.name, props.tool.input))
const icon = computed(() => toolIcon(props.tool.name))
const duration = computed(() => {
  if (!props.tool.durationMs) return ''
  return props.tool.durationMs < 1000
    ? `${props.tool.durationMs}ms`
    : `${(props.tool.durationMs / 1000).toFixed(1)}s`
})

const statusClass = computed(() => `status-${props.tool.status}`)

const outputPreview = computed(() => {
  if (props.tool.error) return props.tool.error
  if (!props.tool.output) return ''
  return props.tool.output.length > 200
    ? props.tool.output.slice(0, 200) + '…'
    : props.tool.output
})
</script>

<template>
  <div class="tool-step" :class="statusClass" @click="toggle">
    <span class="tool-icon">{{ icon }}</span>
    <span class="tool-name">{{ displayName }}</span>
    <span v-if="tool.status === 'running'" class="tool-spinner" />
    <span v-if="tool.status === 'error'" class="tool-error-badge">✕</span>
    <span v-if="tool.status === 'complete' && duration" class="tool-duration">{{ duration }}</span>

    <div v-if="expanded && outputPreview" class="tool-output">
      <pre>{{ outputPreview }}</pre>
    </div>
  </div>
</template>

<style scoped>
.tool-step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.12s;
}

.tool-step:hover {
  background: var(--bg-hover, #ffffff06);
}

.tool-icon {
  font-size: 0.75rem;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}

.tool-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid var(--accent-color, #3b82f6);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.tool-error-badge {
  color: var(--error, #ef4444);
  font-size: 0.75rem;
  font-weight: 600;
}

.tool-duration {
  font-size: 0.6875rem;
  opacity: 0.5;
  flex-shrink: 0;
}

.tool-output {
  width: 100%;
  margin-top: 4px;
  padding: 6px 8px;
  background: var(--bg-primary, #0a0a1a);
  border-radius: 4px;
  font-size: 0.75rem;
  overflow-x: auto;
}

.tool-output pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-tertiary, #888);
}

.status-error .tool-name {
  color: var(--error, #ef4444);
}
</style>
