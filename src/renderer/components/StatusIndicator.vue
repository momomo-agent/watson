<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: 'idle' | 'thinking' | 'complete' | 'error'
}>()

const statusColor = computed(() => {
  switch (props.status) {
    case 'idle': return '#666'
    case 'thinking': return '#3b82f6'
    case 'complete': return '#10b981'
    case 'error': return '#ef4444'
  }
})

const statusText = computed(() => {
  switch (props.status) {
    case 'idle': return 'Ready'
    case 'thinking': return 'Thinking...'
    case 'complete': return 'Complete'
    case 'error': return 'Error'
  }
})
</script>

<template>
  <div class="status-indicator">
    <div class="dot" :style="{ backgroundColor: statusColor }"></div>
    <div class="tooltip">{{ statusText }}</div>
  </div>
</template>

<style scoped>
.status-indicator {
  position: fixed;
  bottom: 1rem;
  left: 1rem;
  z-index: 100;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: all 0.2s;
  cursor: pointer;
}

.tooltip {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 0.5rem;
  padding: 0.25rem 0.5rem;
  background: #2a2a2a;
  color: #f0f0f0;
  font-size: 0.75rem;
  border-radius: 4px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}

.status-indicator:hover .dot {
  transform: scale(1.5);
}

.status-indicator:hover .tooltip {
  opacity: 1;
}
</style>