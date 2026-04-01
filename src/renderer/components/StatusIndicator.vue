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
  <div class="status-indicator" :title="statusText">
    <div class="dot" :style="{ backgroundColor: statusColor }"></div>
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
  transition: background-color 0.3s;
}

.dot:hover {
  transform: scale(1.5);
}
</style>