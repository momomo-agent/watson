/**
 * useSession — Session management composable
 *
 * MOMO-51: Backed by SQLite via IPC (sessions:*) instead of localStorage.
 * Sessions and messages survive app restart.
 */

import { ref, computed } from 'vue'

export interface Session {
  id: string
  workspacePath: string
  title: string
  createdAt: number
  updatedAt: number
  lastMessage?: string
  mode?: string
  statusLevel?: string
  statusText?: string
}

const sessions = ref<Session[]>([])
const currentSessionId = ref<string | null>(null)

export function useSession() {
  const currentSession = computed(() => 
    sessions.value.find(s => s.id === currentSessionId.value) || null
  )

  const loadSessions = async () => {
    try {
      // Load from SQLite via IPC
      const stored = await window.api.invoke('sessions:list')
      if (stored && Array.isArray(stored)) {
        sessions.value = stored.map((s: any) => ({
          id: s.id,
          workspacePath: s.participants?.[0] || '',
          title: s.title || 'New Chat',
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          lastMessage: s.lastMessage,
          mode: s.mode,
          statusLevel: s.statusLevel,
          statusText: s.statusText
        }))
        if (sessions.value.length > 0 && !currentSessionId.value) {
          currentSessionId.value = sessions.value[0].id
        }
      }
    } catch (err) {
      console.error('[useSession] Failed to load sessions from SQLite:', err)
      // Fallback: try localStorage for migration
      const localStored = localStorage.getItem('watson:sessions')
      if (localStored) {
        try {
          const localSessions = JSON.parse(localStored) as Session[]
          sessions.value = localSessions
          if (sessions.value.length > 0 && !currentSessionId.value) {
            currentSessionId.value = sessions.value[0].id
          }
          // Migrate localStorage sessions to SQLite
          for (const s of localSessions) {
            try {
              await window.api.invoke('sessions:create', {
                id: s.id,
                title: s.title,
                participants: [s.workspacePath]
              })
            } catch { /* session may already exist */ }
          }
          // Clear localStorage after migration
          localStorage.removeItem('watson:sessions')
          console.log('[useSession] Migrated', localSessions.length, 'sessions from localStorage to SQLite')
        } catch {
          // ignore parse errors
        }
      }
    }
  }

  const createSession = async (workspacePath: string) => {
    const id = `session-${Date.now()}`
    const title = 'New Chat'
    const now = Date.now()

    const session: Session = {
      id,
      workspacePath,
      title,
      createdAt: now,
      updatedAt: now
    }

    // Persist to SQLite
    try {
      await window.api.invoke('sessions:create', {
        id,
        title,
        participants: [workspacePath]
      })
    } catch (err) {
      console.error('[useSession] Failed to create session in SQLite:', err)
    }

    sessions.value.unshift(session)
    currentSessionId.value = session.id
    return session
  }

  const switchSession = (id: string) => {
    currentSessionId.value = id
  }

  const deleteSession = async (id: string) => {
    const idx = sessions.value.findIndex(s => s.id === id)
    if (idx !== -1) {
      sessions.value.splice(idx, 1)
      if (currentSessionId.value === id) {
        currentSessionId.value = sessions.value[0]?.id || null
      }
      // Delete from SQLite
      try {
        await window.api.invoke('sessions:delete', { sessionId: id })
      } catch (err) {
        console.error('[useSession] Failed to delete session from SQLite:', err)
      }
    }
  }

  const renameSession = async (id: string, title: string) => {
    const session = sessions.value.find(s => s.id === id)
    if (session) {
      session.title = title
      // Persist to SQLite
      try {
        await window.api.invoke('sessions:rename', { sessionId: id, title })
      } catch (err) {
        console.error('[useSession] Failed to rename session in SQLite:', err)
      }
    }
  }

  const updateSessionMessage = async (id: string, message: string) => {
    const session = sessions.value.find(s => s.id === id)
    if (session) {
      session.lastMessage = message
      session.updatedAt = Date.now()
      // Move to top
      const idx = sessions.value.indexOf(session)
      if (idx > 0) {
        sessions.value.splice(idx, 1)
        sessions.value.unshift(session)
      }
      // Touch session in SQLite (update timestamp)
      try {
        await window.api.invoke('sessions:touch', { sessionId: id })
      } catch (err) {
        console.error('[useSession] Failed to touch session in SQLite:', err)
      }
    }
  }

  return {
    sessions,
    currentSession,
    currentSessionId,
    loadSessions,
    createSession,
    switchSession,
    deleteSession,
    renameSession,
    updateSessionMessage
  }
}
