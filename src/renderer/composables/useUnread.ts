/**
 * useUnread — Unread message count composable
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { backend } from '../infrastructure/backend'

const unreadCounts = ref<Record<string, number>>({})
const totalUnread = computed(() =>
  Object.values(unreadCounts.value).reduce((sum, c) => sum + c, 0)
)

let initialized = false
let cleanup: (() => void) | null = null

function initListener() {
  if (initialized) return
  initialized = true

  backend.invoke('unread:get-all').then((result: any) => {
    if (result?.success && result.counts) {
      unreadCounts.value = { ...result.counts }
    }
  }).catch(() => {})

  cleanup = backend.on('unread:updated', (data: {
    sessionId: string
    count: number
    total: number
    counts: Record<string, number>
  }) => {
    unreadCounts.value = { ...data.counts }
  })
}

export function useUnread() {
  onMounted(() => initListener())

  const getCount = (sessionId: string): number => unreadCounts.value[sessionId] || 0

  const clearUnread = async (sessionId: string) => {
    const newCounts = { ...unreadCounts.value }
    delete newCounts[sessionId]
    unreadCounts.value = newCounts

    try { await backend.invoke('unread:clear', { sessionId }) } catch {}
    try { await backend.invoke('session:set-active', { sessionId }) } catch {}
  }

  return { unreadCounts, totalUnread, getCount, clearUnread }
}
