<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const api = (window as any).api

const running = ref(false)
const context = ref<{ activeApp?: string; activeWindow?: string; activity?: string } | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null

async function fetchStatus() {
  try {
    const status = await api.invoke('sense:status')
    running.value = status.running
    context.value = status.context
  } catch {
    running.value = false
    context.value = null
  }
}

async function toggle() {
  try {
    const result = await api.invoke('sense:toggle')
    running.value = result.running
    if (!running.value) context.value = null
  } catch {}
}

onMounted(() => {
  fetchStatus()
  pollTimer = setInterval(fetchStatus, 5000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="sense-indicator" @click="toggle">
    <div class="dot" :class="{ active: running }"></div>
    <div class="tooltip">
      <template v-if="running && context">
        <div class="tooltip-title">感知运行中</div>
        <div class="tooltip-detail" v-if="context.activeApp">{{ context.activeApp }}</div>
        <div class="tooltip-detail" v-if="context.activeWindow">{{ context.activeWindow }}</div>
      </template>
      <template v-else-if="running">
        <div class="tooltip-title">感知运行中</div>
        <div class="tooltip-detail">等待数据...</div>
      </template>
      <template v-else>
        <div class="tooltip-title">感知已关闭</div>
        <div class="tooltip-detail">点击开启</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sense-indicator {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #666;
  transition: all 0.2s;
}

.dot.active {
  background-color: #10b981;
}

.tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  padding: 0.4rem 0.6rem;
  background: var(--bg-secondary, #1e1e1e);
  color: var(--text-primary, #e0e0e0);
  font-size: 0.7rem;
  border-radius: 6px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
  border: 1px solid var(--border-color, #333);
  min-width: 100px;
}

.sense-indicator:hover .dot {
  transform: scale(1.5);
}

.sense-indicator:hover .tooltip {
  opacity: 1;
}

.tooltip-title {
  font-weight: 600;
  margin-bottom: 2px;
}

.tooltip-detail {
  opacity: 0.7;
  font-size: 0.65rem;
}
</style>
