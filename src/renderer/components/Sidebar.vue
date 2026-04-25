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

const openSettings = () => { showSettings.value = true }
const sidebarEmit = defineEmits<{ settingsClosed: [], toggleIntents: [] }>()
function handleSettingsClose() {
  showSettings.value = false
  sidebarEmit('settingsClosed')
}
defineExpose({ openSettings })

// Show all sessions — current session must always be visible
const visibleSessions = computed(() => sessions.value)

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
      <button @click="sidebarEmit('toggleIntents')" class="settings-btn">
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="6" height="6" rx="1"/><rect x="3" y="13" width="6" height="6" rx="1"/><line x1="13" y1="8" x2="21" y2="8"/><line x1="13" y1="16" x2="21" y2="16"/></svg>
Tasks
</button>
      <button @click="showSettings = true" class="settings-btn">
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
Settings
</button>
    </div>

    <SettingsPanel v-if="showSettings" @close="handleSettingsClose" />
  </div>
</template>

<style scoped>
.sidebar {
  width: 220px;
  min-width: 220px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  height: 100vh;
  -webkit-app-region: drag;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 52px 14px 10px;
  -webkit-app-region: drag;
}

.sidebar-header h2 {
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0;
  -webkit-app-region: drag;
}

.add-btn {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 1.1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) ease;
  -webkit-app-region: no-drag;
  line-height: 1;
}

.add-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 24px;
  -webkit-app-region: no-drag;
}

.session-item {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  border-radius: 7px;
  cursor: pointer;
  transition: background var(--duration-fast) ease;
  margin-bottom: 1px;
  gap: 0.375rem;
  position: relative;
}

.session-item:hover { background: var(--bg-tertiary); }
.session-item.active { background: var(--bg-primary); }
.session-item.active .session-title { color: var(--text-primary); font-weight: 500; }

.session-body { flex: 1; min-width: 0; }

.session-row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.session-title {
  font-weight: 400;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.rename-input {
  width: 100%;
  background: var(--bg-primary);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 0.8125rem;
  padding: 1px 4px;
  font-family: inherit;
  outline: none;
}

.session-time {
  font-size: 0.6875rem;
  color: var(--text-tertiary);
  margin-left: 4px;
  flex-shrink: 0;
}

.unread-badge {
  background: var(--text-primary);
  color: var(--bg-primary);
  font-size: 0.5625rem;
  font-weight: 600;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  margin-left: 4px;
  flex-shrink: 0;
}

.session-subtitle {
  font-size: 0.6875rem;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
  margin-top: 1px;
}

.session-chevron { display: none; }

.delete-btn {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 1rem;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 1;
}

.session-item:hover .delete-btn { display: flex; }
.delete-btn:hover { color: var(--error); }

.sidebar-footer {
  padding: 8px;
  border-top: 1px solid var(--border-color);
  -webkit-app-region: no-drag;
}

.settings-btn {
  width: 100%;
  padding: 7px 8px;
  background: transparent;
  border: none;
  border-radius: 7px;
  color: var(--text-tertiary);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all var(--duration-fast) ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.settings-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}
</style>
