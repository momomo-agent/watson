<template>
  <div class="intents-panel">
    <div class="intents-header">
      <span class="intents-title">Tasks</span>
      <span v-if="intents.length > 0" class="intents-count">{{ intents.length }}</span>
    </div>
    <div class="intents-list">
      <div v-if="intents.length === 0" class="intents-empty">暂无任务</div>
      <div
        v-for="intent in intents"
        :key="intent.id"
        class="intent-item"
        :class="'intent-' + intent.status"
      >
        <div class="intent-status-dot" />
        <div class="intent-content">
          <div class="intent-goal">{{ intent.goal }}</div>
          <div class="intent-meta">
            <span class="intent-status-label">{{ statusLabel(intent.status) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useIntents } from '../composables/useIntents'

const props = defineProps<{ sessionId: string }>()
const { intents, hasIntents } = useIntents(props.sessionId)

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '等待中',
    running: '执行中',
    done: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }
  return labels[status] || status
}
</script>

<style scoped>
.intents-panel {
  border-left: 1px solid var(--border-color, #e0e0e0);
  width: 260px;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary, #f8f8f8);
  overflow-y: auto;
}

.intents-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.intents-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #333);
}

.intents-count {
  font-size: 11px;
  background: var(--accent-color, #007aff);
  color: white;
  border-radius: 10px;
  padding: 1px 7px;
  min-width: 18px;
  text-align: center;
}

.intents-empty {
  padding: 16px 10px;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  text-align: center;
}

.intents-list {
  padding: 8px;
}

.intent-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  margin-bottom: 4px;
  transition: background 0.15s;
}

.intent-item:hover {
  background: var(--bg-hover, rgba(0, 0, 0, 0.04));
}

.intent-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
  background: #999;
}

.intent-pending .intent-status-dot { background: #f5a623; }
.intent-running .intent-status-dot { background: #007aff; animation: pulse 1.5s infinite; }
.intent-done .intent-status-dot { background: #34c759; }
.intent-failed .intent-status-dot { background: #ff3b30; }
.intent-cancelled .intent-status-dot { background: #999; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.intent-content {
  flex: 1;
  min-width: 0;
}

.intent-goal {
  font-size: 12px;
  color: var(--text-primary, #333);
  line-height: 1.4;
  word-break: break-word;
}

.intent-meta {
  margin-top: 2px;
}

.intent-status-label {
  font-size: 11px;
  color: var(--text-secondary, #888);
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .intents-panel {
    background: var(--bg-secondary, #1e1e1e);
    border-left-color: var(--border-color, #333);
  }
  .intents-header {
    border-bottom-color: var(--border-color, #333);
  }
  .intent-goal {
    color: var(--text-primary, #e0e0e0);
  }
}
</style>
