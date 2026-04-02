<script setup lang="ts">
import { ref } from 'vue'
import { useWorkspace } from '../composables/useWorkspace'
import SettingsPanel from './SettingsPanel.vue'

const { currentWorkspace, workspaces, switchWorkspace, createWorkspace, deleteWorkspace } = useWorkspace()
const showCreateDialog = ref(false)
const showSettings = ref(false)
const newWorkspaceName = ref('')
const newWorkspacePath = ref('')

const handleSwitch = async (id: string) => {
  await switchWorkspace(id)
}

const handleCreate = async () => {
  if (!newWorkspaceName.value || !newWorkspacePath.value) return
  await createWorkspace(newWorkspaceName.value, newWorkspacePath.value)
  showCreateDialog.value = false
  newWorkspaceName.value = ''
  newWorkspacePath.value = ''
}

const handleDelete = async (id: string, event: Event) => {
  event.stopPropagation()
  if (confirm('Delete this workspace?')) {
    await deleteWorkspace(id)
  }
}
</script>

<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <h2>Workspaces</h2>
      <button @click="showCreateDialog = true" class="add-btn">+</button>
    </div>

    <div class="workspace-list">
      <div
        v-for="ws in workspaces"
        :key="ws.id"
        @click="handleSwitch(ws.id)"
        class="workspace-item"
        :class="{ active: ws.id === currentWorkspace?.id }"
      >
        <div class="workspace-info">
          <span class="name">{{ ws.name }}</span>
          <span class="path">{{ ws.path }}</span>
        </div>
        <button
          v-if="workspaces.length > 1"
          @click="handleDelete(ws.id, $event)"
          class="delete-btn"
        >×</button>
      </div>
    </div>

    <div class="sidebar-footer">
      <button @click="showSettings = true" class="settings-btn">⚙ Settings</button>
    </div>

    <div v-if="showCreateDialog" class="dialog-overlay" @click="showCreateDialog = false">
      <div class="dialog" @click.stop>
        <h3>New Workspace</h3>
        <input v-model="newWorkspaceName" placeholder="Name" class="input" />
        <input v-model="newWorkspacePath" placeholder="Path" class="input" />
        <div class="dialog-actions">
          <button @click="showCreateDialog = false" class="btn-cancel">Cancel</button>
          <button @click="handleCreate" class="btn-create">Create</button>
        </div>
      </div>
    </div>

    <SettingsPanel v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.sidebar {
  width: 240px;
  background: #0f0f0f;
  border-right: 1px solid #2a2a2a;
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid #2a2a2a;
}

.sidebar-header h2 {
  font-size: 0.875rem;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.add-btn {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  color: #888;
  font-size: 1.25rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.add-btn:hover {
  background: #2a2a2a;
  color: #e0e0e0;
}

.workspace-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.workspace-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  margin-bottom: 0.25rem;
}

.workspace-item:hover {
  background: #1a1a1a;
}

.workspace-item.active {
  background: rgba(74, 158, 255, 0.15);
  border: 1px solid rgba(74, 158, 255, 0.3);
}

.workspace-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
}

.workspace-info .name {
  font-weight: 500;
  color: #e0e0e0;
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-info .path {
  font-size: 0.75rem;
  color: #666;
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
  color: #666;
  font-size: 1.25rem;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.workspace-item:hover .delete-btn {
  display: flex;
}

.delete-btn:hover {
  background: #3a1a1a;
  color: #ff6b6b;
}

.sidebar-footer {
  padding: 1rem;
  border-top: 1px solid #2a2a2a;
}

.settings-btn {
  width: 100%;
  padding: 0.75rem;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  color: #888;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.settings-btn:hover {
  background: #2a2a2a;
  color: #e0e0e0;
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  padding: 1.5rem;
  width: 400px;
  max-width: 90vw;
}

.dialog h3 {
  margin: 0 0 1rem 0;
  color: #e0e0e0;
  font-size: 1rem;
}

.input {
  width: 100%;
  padding: 0.5rem;
  background: #0a0a0a;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
}

.input:focus {
  outline: none;
  border-color: #4a9eff;
}

.dialog-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1rem;
}

.btn-cancel, .btn-create {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: transparent;
  border: 1px solid #2a2a2a;
  color: #888;
}

.btn-cancel:hover {
  background: #1a1a1a;
  color: #e0e0e0;
}

.btn-create {
  background: #4a9eff;
  border: none;
  color: white;
}

.btn-create:hover {
  background: #3a8eef;
}
</style>
