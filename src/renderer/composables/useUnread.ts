/**
 * useUnread — Unread message count composable
 *
 * MOMO-56: Reactive unread counts per session.
 * Listens for 'unread:updated' events from main process.
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'

const unreadCounts = ref<Record<string, number>>({})
const totalUnread = computed(() => {
  let total = 0
  for (const count of Object.values(unreadCounts.value)) {
    total += count
  }
  return total
})

let initialized = false
let cleanup: (() => void) | null = null

function initListener() {
  if (initialized) return
  initialized = true

  // Load initial counts
  window.api.invoke('unread:get-all').then((result: any) => {
    if (result?.success && result.counts) {
      unreadCounts.value = { ...result.counts }
    }
  }).catch(() => {})

  // Listen for real-time updates from main process
  cleanup = window.api.on('unread:updated', (data: {
    sessionId: string
    count: number
    total: number
    counts: Record<string, number>
  }) => {
    unreadCounts.value = { ...data.counts }
  })
}

export function useUnread() {
  onMounted(() => {
    initListener()
  })

  /**
   * Get unread count for a specific session.
   */
  const getCount = (sessionId: string): number => {
    return unreadCounts.value[sessionId] || 0
  }

  /**
   * Clear unread count for a session (user switched to it).
   */
  const clearUnread = async (sessionId: string) => {
    // Optimistic update
    const newCounts = { ...unreadCounts.value }
    delete newCounts[sessionId]
    unreadCounts.value = newCounts

    // Persist via IPC
    try {
      await window.api.invoke('unread:clear', { sessionId })
    } catch (err) {
      console.error('[useUnread] Failed to clear unread:', err)
    }

    // Tell main process which session is now active
    try {
      await window.api.invoke('session:set-active', { sessionId })
    } catch (err) {
      console.error('[useUnread] Failed to set active session:', err)
    }
  }

  return {
    unreadCounts,
    totalUnread,
    getCount,
    clearUnread
  }
}
