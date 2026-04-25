/**
 * useSession — Session management composable
 *
 * Uses backend adapter for transport isolation.
 */

import { ref, computed } from 'vue'
import { backend } from '../infrastructure/backend'

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
      const stored = await backend.invoke('sessions:list')
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
      console.error('[useSession] Failed to load sessions:', err)
    }
  }

  const createSession = async (workspacePath: string) => {
    const id = `session-${Date.now()}`
    const title = 'New Chat'
    const now = Date.now()

    const session: Session = { id, workspacePath, title, createdAt: now, updatedAt: now }

    try {
      await backend.invoke('sessions:create', { id, title, participants: [workspacePath] })
    } catch (err) {
      console.error('[useSession] Failed to create session:', err)
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
      try {
        await backend.invoke('sessions:delete', { sessionId: id })
      } catch (err) {
        console.error('[useSession] Failed to delete session:', err)
      }
    }
  }

  const renameSession = async (id: string, title: string) => {
    const session = sessions.value.find(s => s.id === id)
    if (session) {
      session.title = title
      try {
        await backend.invoke('sessions:rename', { sessionId: id, title })
      } catch (err) {
        console.error('[useSession] Failed to rename session:', err)
      }
    }
  }

  const updateSessionMessage = async (id: string, message: string) => {
    const session = sessions.value.find(s => s.id === id)
    if (session) {
      session.lastMessage = message
      session.updatedAt = Date.now()
      try {
        await backend.invoke('sessions:touch', { sessionId: id, lastMessage: message })
      } catch (err) {
        console.error('[useSession] Failed to touch session:', err)
      }
    }
  }

  return {
    sessions, currentSession, currentSessionId,
    loadSessions, createSession, switchSession,
    deleteSession, renameSession, updateSessionMessage
  }
}
