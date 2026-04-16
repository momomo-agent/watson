<script setup lang="ts">
/**
 * ProactiveToast — Shows proactive AI signals as dismissible toasts
 */
import { useProactive } from '../composables/useProactive'

const { currentSignal, dismiss } = useProactive()

const emit = defineEmits<{
  act: [context: Record<string, any>]
}>()

function handleClick() {
  if (currentSignal.value) {
    emit('act', currentSignal.value.context)
    dismiss()
  }
}
</script>

<template>
  <Transition name="toast">
    <div v-if="currentSignal" class="proactive-toast" :class="currentSignal.type" @click="handleClick">
      <div class="toast-icon">
        {{ currentSignal.type === 'alert' ? '⚠️' : currentSignal.type === 'suggestion' ? '💡' : '👋' }}
      </div>
      <div class="toast-body">
        <span class="toast-reason">{{ currentSignal.reason }}</span>
      </div>
      <button class="toast-dismiss" @click.stop="dismiss">×</button>
    </div>
  </Transition>
</template>

<style scoped>
.proactive-toast {
  position: fixed;
  bottom: 5rem;
  right: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.8rem;
  background: var(--surface-2, #1e1e2e);
  border: 1px solid var(--border, #333);
  border-radius: 0.5rem;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  cursor: pointer;
  max-width: 320px;
  z-index: 200;
  font-size: 0.85rem;
  color: var(--text, #cdd6f4);
  transition: opacity 0.2s, transform 0.2s;
}

.proactive-toast:hover {
  background: var(--surface-3, #2a2a3e);
}

.proactive-toast.alert {
  border-color: #f38ba8;
}

.toast-icon {
  flex-shrink: 0;
  font-size: 1rem;
}

.toast-reason {
  line-height: 1.3;
}

.toast-dismiss {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--text-muted, #6c7086);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0 0.2rem;
  line-height: 1;
}

.toast-dismiss:hover {
  color: var(--text, #cdd6f4);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(1rem);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(1rem);
}
</style>
