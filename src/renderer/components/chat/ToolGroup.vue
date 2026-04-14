<script setup lang="ts">
/**
 * ToolGroup — Collapsible group of tool calls
 *
 * Header shows summary (e.g. "读取 3 个文件" or "执行命令").
 * Expands to show individual ToolStep items.
 * Auto-expands while streaming, collapses when complete.
 */
import { ref, computed, watch } from 'vue'
import type { ToolCall } from '../../../shared/chat-types'
import { summarizeTools, humanizeTool, toolIcon } from '../../utils/tool-humanize'
import ToolStep from './ToolStep.vue'

const props = defineProps<{
  tools: ToolCall[]
  summary?: string
  roundPurpose?: string
  isStreaming?: boolean
}>()

const expanded = ref(false)
const toggle = () => { expanded.value = !expanded.value }

// Auto-expand while tools are running, collapse when done
watch(() => props.tools.map(t => t.status), (statuses) => {
  const hasActive = statuses.some(s => s === 'pending' || s === 'running')
  if (hasActive) expanded.value = true
}, { immediate: true })

const headerText = computed(() => {
  if (props.roundPurpose) return props.roundPurpose
  if (props.summary) return props.summary

  // Single tool — show its name directly
  if (props.tools.length === 1) {
    return humanizeTool(props.tools[0].name, props.tools[0].input)
  }

  // While streaming, show the last tool
  if (props.isStreaming && props.tools.length > 0) {
    const last = props.tools[props.tools.length - 1]
    return humanizeTool(last.name, last.input)
  }

  // Completed — show summary
  return summarizeTools(props.tools)
})

const headerIcon = computed(() => {
  if (props.tools.length === 1) return toolIcon(props.tools[0].name)
  return '🔧'
})

const isRunning = computed(() => props.tools.some(t => t.status === 'running' || t.status === 'pending'))
const hasError = computed(() => props.tools.some(t => t.status === 'error'))
</script>

<template>
  <div class="tool-group" :class="{ running: isRunning, 'has-error': hasError }">
    <div class="tool-group-header" @click="toggle">
      <span class="tool-group-icon">{{ headerIcon }}</span>
      <span class="tool-group-text">{{ headerText }}</span>
      <span v-if="isRunning" class="tool-group-spinner" />
      <span class="tool-group-chevron">{{ expanded ? '▼' : '▶' }}</span>
    </div>
    <div v-if="expanded" class="tool-group-body">
      <ToolStep v-for="tool in tools" :key="tool.id" :tool="tool" />
    </div>
  </div>
</template>

<style scoped>
.tool-group {
  margin: 4px 0;
  border-radius: 8px;
  background: var(--bg-tertiary, #1a1a2e);
  border: 1px solid var(--border-color, #2a2a3e);
  overflow: hidden;
}

.tool-group.running {
  border-color: var(--accent-dim, #3b82f633);
}

.tool-group.has-error {
  border-color: var(--error-dim, #ef444433);
}

.tool-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  user-select: none;
  transition: background 0.12s;
}

.tool-group-header:hover {
  background: var(--bg-hover, #ffffff08);
}

.tool-group-icon {
  font-size: 0.875rem;
  flex-shrink: 0;
}

.tool-group-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-group-spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid var(--accent-color, #3b82f6);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.tool-group-chevron {
  font-size: 0.625rem;
  opacity: 0.5;
  flex-shrink: 0;
}

.tool-group-body {
  border-top: 1px solid var(--border-color, #2a2a3e);
  padding: 2px 0;
}
</style>
