<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useSession } from '../composables/useSession'
import { useWorkspace } from '../composables/useWorkspace'
import { useUnread } from '../composables/useUnread'
import SettingsPanel from './SettingsPanel.vue'

const { sessions, currentSessionId, loadSessions, createSession, switchSession, deleteSession, renameSession } = useSession()
const { currentWorkspace } = useWorkspace()
const { getCount, clearUnread } = useUnread()
const showSettings = ref(false)
const renaming = ref<string | null>(null)
const renameText = ref('')

// Hide empty "New Chat" sessions (except current)
const visibleSessions = computed(() =>
  sessions.value.filter(s =>
    s.id === currentSessionId.value || s.title !== 'New Chat' || s.lastMessage
  )
)

onMounted(() => {
  loadSessions()
})

const handleNew = () => {
  createSession(currentWorkspace.value?.path || '')
}

const handleSwitch = (id: string) => {
  switchSession(id)
  // MOMO-56: Clear unread count when switching to a session
  clearUnread(id)
}

const handleDelete = (id: string, event: Event) => {
  event.stopPropagation()
  if (confirm('Delete this session?')) {
    deleteSession(id)
  }
}

const startRename = (id: string, event: Event) => {
  event.stopPropagation()
  const session = sessions.value.find(s => s.id === id)
  if (session) {
    renaming.value = id
    renameText.value = session.title
  }
}

const submitRename = () => {
  if (renaming.value && renameText.value.trim()) {
    renameSession(renaming.value, renameText.value.trim())
  }
  renaming.value = null
}

const formatTime = (ts: number) => {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return '昨天'
  return `${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <h2>Sessions</h2>
      <button @click="handleNew" class="add-btn">+</button>
    </div>

    <div class="session-list">
      <div
        v-for="session in visibleSessions"
        :key="session.id"
        @click="handleSwitch(session.id)"
        class="session-item"
        :class="{ active: session.id === currentSessionId }"
      >
        <div class="session-body">
          <div class="session-row-top">
            <span v-if="renaming === session.id" class="session-title">
              <input
                v-model="renameText"
                @keydown.enter="submitRename"
                @keydown.esc="renaming = null"
                @blur="submitRename"
                @click.stop
                autofocus
                class="rename-input"
              />
            </span>
            <span v-else class="session-title" @dblclick="startRename(session.id, $event)">
              {{ session.title }}
            </span>
            <span v-if="getCount(session.id) > 0" class="unread-badge">
              {{ getCount(session.id) > 99 ? '99+' : getCount(session.id) }}
            </span>
            <span class="session-time">{{ formatTime(session.updatedAt) }}</span>
          </div>
          <div v-if="session.lastMessage" class="session-subtitle">
            {{ session.lastMessage }}
          </div>
        </div>
        <button
          v-if="sessions.length > 1"
          @click="handleDelete(session.id, $event)"
          class="delete-btn"
        >×</button>
        <span class="session-chevron">›</span>
      </div>
    </div>

    <div class="sidebar-footer">
      <button @click="showSettings = true" class="settings-btn">
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
Settings
</button>
    </div>

    <SettingsPanel v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.sidebar {
  width: 260px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1rem;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-header h2 {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0;
}

.add-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 1.25rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: var(--shadow-sm);
}

.add-btn:hover {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
  box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.08);
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  padding-bottom: 2rem;
}

.session-item {
  display: flex;
  align-items: center;
  padding: 0.5rem 0.625rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  margin-bottom: 2px;
  gap: 0.5rem;
  border: 1px solid transparent;
  position: relative;
}

.session-item:hover {
  background: var(--bg-primary);
  border-color: var(--border-color);
  box-shadow: var(--shadow-sm);
}

.session-item:hover .session-chevron {
  opacity: 1;
}

.session-item.active {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  box-shadow: none;
}

.session-item.active .session-title {
  color: var(--accent-color);
}

.session-body {
  flex: 1;
  min-width: 0;
}

.session-row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.125rem;
}

.session-title {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 0.875rem;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.rename-input {
  width: 100%;
  background: var(--bg-primary);
  border: 1px solid var(--accent-color);
  border-radius: 3px;
  color: var(--text-primary);
  font-size: 0.875rem;
  padding: 2px 4px;
  font-family: inherit;
}

.rename-input:focus {
  outline: none;
}

.session-time {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-left: 0.5rem;
}

.unread-badge {
  background: #4a9eff;
  color: #fff;
  font-size: 0.625rem;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  margin-left: 0.375rem;
  flex-shrink: 0;
  line-height: 1;
}

.session-subtitle {
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
  margin-top: 1px;
  opacity: 0.7;
}

.session-chevron {
  opacity: 0;
  color: var(--text-secondary);
  font-size: 0.75rem;
  flex-shrink: 0;
  transition: opacity 0.15s ease;
  margin-left: auto;
}

.delete-btn {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 1.25rem;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.session-item:hover .delete-btn {
  display: flex;
}

.delete-btn:hover {
  background: #3a1a1a;
  color: #ff6b6b;
}

.sidebar-footer {
  padding: 0.75rem;
  border-top: 1px solid var(--border-color);
}

.settings-btn {
  width: 100%;
  padding: 0.625rem 0.75rem;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.settings-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}
</style>
