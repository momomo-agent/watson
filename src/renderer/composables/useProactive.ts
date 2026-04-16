/**
 * useProactive — Composable for proactive AI signals
 *
 * Listens for proactive:signal events from main process
 * and exposes them as reactive state for the UI.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { backend } from '../infrastructure/backend'

export interface ProactiveSignal {
  type: 'nudge' | 'alert' | 'suggestion'
  reason: string
  context: Record<string, any>
  priority: number
}

export function useProactive() {
  const currentSignal = ref<ProactiveSignal | null>(null)
  const signalHistory = ref<ProactiveSignal[]>([])
  let cleanup: (() => void) | null = null

  function handleSignal(signal: ProactiveSignal) {
    currentSignal.value = signal
    signalHistory.value.push(signal)
    // Keep last 20
    if (signalHistory.value.length > 20) {
      signalHistory.value = signalHistory.value.slice(-20)
    }
  }

  function dismiss() {
    currentSignal.value = null
  }

  onMounted(() => {
    cleanup = backend.on('proactive:signal', handleSignal)
  })

  onUnmounted(() => {
    cleanup?.()
  })

  return {
    currentSignal,
    signalHistory,
    dismiss,
  }
}
