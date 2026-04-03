<template>
  <div v-if="show" class="modal-overlay" @click="close">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2>Manage Agents</h2>
        <button class="close-button" @click="close">✕</button>
      </div>

      <div class="modal-body">
        <div class="agents-list">
          <div
            v-for="agent in agents"
            :key="agent.id"
            class="agent-card"
            :class="{ default: agent.id === defaultAgentId }"
          >
            <div class="agent-header">
              <span class="agent-avatar" :style="{ color: agent.color }">
                {{ agent.avatar || '🤖' }}
              </span>
              <div class="agent-title">
                <h3>{{ agent.name }}</h3>
                <span v-if="agent.id === defaultAgentId" class="default-badge">Default</span>
              </div>
              <div class="agent-actions">
                <button
                  v-if="agent.id !== defaultAgentId"
                  class="icon-button"
                  @click="setDefault(agent.id)"
                  title="Set as default"
                >
                  ⭐
                </button>
                <button
                  class="icon-button"
                  @click="editAgent(agent)"
                  title="Edit"
                >
                  ✏️
                </button>
                <button
                  v-if="agent.id !== 'default'"
                  class="icon-button danger"
                  @click="removeAgent(agent.id)"
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
            <p v-if="agent.description" class="agent-description">
              {{ agent.description }}
            </p>
            <div class="agent-meta">
              <span v-if="agent.model">Model: {{ agent.model }}</span>
              <span v-if="agent.provider">Provider: {{ agent.provider }}</span>
            </div>
          </div>
        </div>

        <button class="add-button" @click="addNewAgent">
          ➕ Add New Agent
        </button>
      </div>

      <!-- Agent Edit Form -->
      <div v-if="editingAgent" class="modal-overlay" @click="cancelEdit">
        <div class="modal-content small" @click.stop>
          <div class="modal-header">
            <h2>{{ editingAgent.id ? 'Edit Agent' : 'New Agent' }}</h2>
            <button class="close-button" @click="cancelEdit">✕</button>
          </div>
          <div class="modal-body">
            <form @submit.prevent="saveAgent">
              <div class="form-group">
                <label>Name *</label>
                <input v-model="editingAgent.name" required />
              </div>
              <div class="form-group">
                <label>Description</label>
                <textarea v-model="editingAgent.description" rows="2"></textarea>
              </div>
              <div class="form-group">
                <label>Avatar (emoji)</label>
                <input v-model="editingAgent.avatar" placeholder="🤖" />
              </div>
              <div class="form-group">
                <label>Color</label>
                <input v-model="editingAgent.color" type="color" />
              </div>
              <div class="form-group">
                <label>Model</label>
                <input v-model="editingAgent.model" placeholder="claude-sonnet-4-20250514" />
              </div>
              <div class="form-group">
                <label>Provider</label>
                <select v-model="editingAgent.provider">
                  <option value="">Default</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div class="form-group">
                <label>System Prompt</label>
                <textarea v-model="editingAgent.systemPrompt" rows="4"></textarea>
              </div>
              <div class="form-actions">
                <button type="button" class="button secondary" @click="cancelEdit">
                  Cancel
                </button>
                <button type="submit" class="button primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface Agent {
  id: string
  name: string
  description?: string
  avatar?: string
  color?: string
  model?: string
  provider?: 'anthropic' | 'openai'
  systemPrompt?: string
}

const props = defineProps<{
  show: boolean
  workspacePath: string
}>()

const emit = defineEmits<{
  close: []
  update: []
}>()

const agents = ref<Agent[]>([])
const defaultAgentId = ref<string>('default')
const editingAgent = ref<Agent | null>(null)

async function loadAgents() {
  const result = await window.electron.ipcRenderer.invoke('agent:list', {
    workspacePath: props.workspacePath
  })
  if (result.success) {
    agents.value = result.agents
    // Find default agent (first one or the one marked as default)
    defaultAgentId.value = agents.value[0]?.id || 'default'
  }
}

function addNewAgent() {
  editingAgent.value = {
    id: '',
    name: '',
    avatar: '🤖',
    color: '#3b82f6',
  }
}

function editAgent(agent: Agent) {
  editingAgent.value = { ...agent }
}

function cancelEdit() {
  editingAgent.value = null
}

async function saveAgent() {
  if (!editingAgent.value) return

  try {
    if (editingAgent.value.id) {
      // Update existing
      await window.electron.ipcRenderer.invoke('agent:update', {
        workspacePath: props.workspacePath,
        agentId: editingAgent.value.id,
        updates: editingAgent.value
      })
    } else {
      // Add new
      const newAgent = {
        ...editingAgent.value,
        id: editingAgent.value.name.toLowerCase().replace(/\s+/g, '-')
      }
      await window.electron.ipcRenderer.invoke('agent:add', {
        workspacePath: props.workspacePath,
        agent: newAgent
      })
    }
    await loadAgents()
    editingAgent.value = null
    emit('update')
  } catch (error: any) {
    alert(`Failed to save agent: ${error.message}`)
  }
}

async function removeAgent(agentId: string) {
  if (!confirm('Are you sure you want to delete this agent?')) return

  try {
    await window.electron.ipcRenderer.invoke('agent:remove', {
      workspacePath: props.workspacePath,
      agentId
    })
    await loadAgents()
    emit('update')
  } catch (error: any) {
    alert(`Failed to remove agent: ${error.message}`)
  }
}

async function setDefault(agentId: string) {
  try {
    await window.electron.ipcRenderer.invoke('agent:setDefault', {
      workspacePath: props.workspacePath,
      agentId
    })
    defaultAgentId.value = agentId
    emit('update')
  } catch (error: any) {
    alert(`Failed to set default agent: ${error.message}`)
  }
}

function close() {
  emit('close')
}

onMounted(() => {
  if (props.show) {
    loadAgents()
  }
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-content {
  background: var(--bg-primary);
  border-radius: 16px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.modal-content.small {
  max-width: 500px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-button {
  background: transparent;
  border: none;
  font-size: 24px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s;
}

.close-button:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
}

.agents-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.agent-card {
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  transition: all 0.2s;
}

.agent-card.default {
  border-color: var(--primary);
  background: var(--primary-alpha);
}

.agent-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.agent-avatar {
  font-size: 32px;
  line-height: 1;
}

.agent-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.default-badge {
  padding: 2px 8px;
  background: var(--primary);
  color: white;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.agent-actions {
  display: flex;
  gap: 4px;
}

.icon-button {
  background: transparent;
  border: none;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s;
}

.icon-button:hover {
  background: var(--bg-tertiary);
}

.icon-button.danger:hover {
  background: #fee;
}

.agent-description {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.agent-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.add-button {
  width: 100%;
  padding: 12px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.add-button:hover {
  background: var(--primary-hover);
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  color: var(--text-primary);
  font-family: inherit;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--primary);
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.button {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.button.primary {
  background: var(--primary);
  color: white;
}

.button.primary:hover {
  background: var(--primary-hover);
}

.button.secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.button.secondary:hover {
  background: var(--bg-quaternary);
}
</style>
