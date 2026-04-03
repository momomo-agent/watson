import { ref, computed } from 'vue'

export interface Session {
  id: string
  workspacePath: string
  title: string
  createdAt: number
  updatedAt: number
  lastMessage?: string
}

const sessions = ref<Session[]>([])
const currentSessionId = ref<string | null>(null)

export function useSession() {
  const currentSession = computed(() => 
    sessions.value.find(s => s.id === currentSessionId.value) || null
  )

  const loadSessions = async () => {
    const stored = localStorage.getItem('watson:sessions')
    if (stored) {
      sessions.value = JSON.parse(stored)
      if (sessions.value.length > 0 && !currentSessionId.value) {
        currentSessionId.value = sessions.value[0].id
      }
    }
  }

  const saveSessions = () => {
    localStorage.setItem('watson:sessions', JSON.stringify(sessions.value))
  }

  const createSession = (workspacePath: string) => {
    const session: Session = {
      id: `session-${Date.now()}`,
      workspacePath,
      title: 'New Chat',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    sessions.value.unshift(session)
    currentSessionId.value = session.id
    saveSessions()
    return session
  }

  const switchSession = (id: string) => {
    currentSessionId.value = id
  }

  const deleteSession = (id: string) => {
    const idx = sessions.value.findIndex(s => s.id === id)
    if (idx !== -1) {
      sessions.value.splice(idx, 1)
      if (currentSessionId.value === id) {
        currentSessionId.value = sessions.value[0]?.id || null
      }
      saveSessions()
    }
  }

  const renameSession = (id: string, title: string) => {
    const session = sessions.value.find(s => s.id === id)
    if (session) {
      session.title = title
      saveSessions()
    }
  }

  const updateSessionMessage = (id: string, message: string) => {
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
      saveSessions()
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
