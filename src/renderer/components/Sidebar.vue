<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSession } from '../composables/useSession'
import { useWorkspace } from '../composables/useWorkspace'
import SettingsPanel from './SettingsPanel.vue'

const { sessions, currentSessionId, loadSessions, createSession, switchSession, deleteSession, renameSession } = useSession()
const { currentWorkspace } = useWorkspace()
const showSettings = ref(false)
const renaming = ref<string | null>(null)
const renameText = ref('')

onMounted(() => {
  loadSessions()
})

const handleNew = () => {
  if (currentWorkspace.value) {
    createSession(currentWorkspace.value.path)
  }
}

const handleSwitch = (id: string) => {
  switchSession(id)
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
        v-for="session in sessions"
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
      </div>
    </div>

    <div class="sidebar-footer">
      <button @click="showSettings = true" class="settings-btn">⚙ Settings</button>
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
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-header h2 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.add-btn {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 1.25rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.add-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.session-item {
  display: flex;
  align-items: center;
  padding: 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  margin-bottom: 0.25rem;
  gap: 0.5rem;
}

.session-item:hover {
  background: var(--bg-primary);
}

.session-item.active {
  background: rgba(74, 158, 255, 0.15);
  border: 1px solid rgba(74, 158, 255, 0.3);
}

.session-body {
  flex: 1;
  min-width: 0;
}

.session-row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}

.session-title {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 0.875rem;
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
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-left: 0.5rem;
}

.session-subtitle {
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  padding: 1rem;
  border-top: 1px solid var(--border-color);
}

.settings-btn {
  width: 100%;
  padding: 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.settings-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}
</style>
