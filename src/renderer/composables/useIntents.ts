/**
 * useIntents — Reactive bridge to conductor intent state
 */

import { ref, onUnmounted } from 'vue'
import { backend } from '../infrastructure/backend'

export interface Intent {
  id: number
  goal: string
  status: string
  priority?: number
}

export function useIntents(sessionId: string) {
  const intents = ref<Intent[]>([])
  const hasIntents = ref(false)

  let cleanup: (() => void) | null = null

  const handleUpdate = (data: { sessionId: string; intents: Intent[] }) => {
    if (data.sessionId === sessionId) {
      intents.value = data.intents
      hasIntents.value = data.intents.length > 0
    }
  }

  cleanup = backend.on('intents:update', handleUpdate)

  onUnmounted(() => {
    if (cleanup) { cleanup(); cleanup = null }
  })

  return { intents, hasIntents }
}
