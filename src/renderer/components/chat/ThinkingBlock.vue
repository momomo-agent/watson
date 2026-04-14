<script setup lang="ts">
/**
 * ThinkingBlock — Collapsible thinking/reasoning display
 */
import { ref, computed } from 'vue'
import { renderMarkdown } from '../../utils/markdown'

const props = defineProps<{
  content: string
  durationMs?: number
  isStreaming?: boolean
}>()

const expanded = ref(false)
const toggle = () => { expanded.value = !expanded.value }

const rendered = computed(() => renderMarkdown(props.content))
const duration = computed(() => {
  if (!props.durationMs) return ''
  return props.durationMs < 1000
    ? `${props.durationMs}ms`
    : `${(props.durationMs / 1000).toFixed(1)}s`
})
</script>

<template>
  <div class="thinking-block" :class="{ streaming: isStreaming }">
    <div class="thinking-header" @click="toggle">
      <span class="thinking-icon">💭</span>
      <span class="thinking-label">{{ isStreaming ? '正在思考...' : '思考过程' }}</span>
      <span v-if="duration" class="thinking-duration">{{ duration }}</span>
      <span class="thinking-chevron">{{ expanded ? '▼' : '▶' }}</span>
    </div>
    <div v-if="expanded" class="thinking-content md-content" v-html="rendered" />
  </div>
</template>

<style scoped>
.thinking-block {
  margin: 4px 0;
  border-radius: 8px;
  background: var(--bg-tertiary, #1a1a2e);
  border: 1px solid var(--border-color, #2a2a3e);
  overflow: hidden;
}

.thinking-block.streaming {
  border-color: var(--accent-dim, #3b82f633);
}

.thinking-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  user-select: none;
  transition: background 0.15s;
}

.thinking-header:hover {
  background: var(--bg-hover, #ffffff08);
}

.thinking-icon { font-size: 0.875rem; }
.thinking-label { flex: 1; }
.thinking-duration { font-size: 0.75rem; opacity: 0.6; }
.thinking-chevron { font-size: 0.625rem; opacity: 0.5; }

.thinking-content {
  padding: 8px 12px;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  border-top: 1px solid var(--border-color, #2a2a3e);
  line-height: 1.6;
}
</style>
