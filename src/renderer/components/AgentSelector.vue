<template>
  <div class="agent-selector">
    <button 
      class="agent-button"
      :class="{ active: showDropdown }"
      @click="toggleDropdown"
      :title="`Current agent: ${currentAgent?.name || 'Default'}`"
    >
      <span class="agent-avatar">{{ currentAgent?.avatar || '🤖' }}</span>
      <span class="agent-name">{{ currentAgent?.name || 'Watson' }}</span>
      <span class="dropdown-icon">▼</span>
    </button>

    <div v-if="showDropdown" class="agent-dropdown">
      <div class="agent-list">
        <button
          v-for="agent in agents"
          :key="agent.id"
          class="agent-item"
          :class="{ selected: agent.id === selectedAgentId }"
          @click="selectAgent(agent.id)"
        >
          <span class="agent-avatar" :style="{ color: agent.color }">
            {{ agent.avatar || '🤖' }}
          </span>
          <div class="agent-info">
            <div class="agent-name">{{ agent.name }}</div>
            <div v-if="agent.description" class="agent-description">
              {{ agent.description }}
            </div>
          </div>
          <span v-if="agent.id === selectedAgentId" class="check-icon">✓</span>
        </button>
      </div>

      <div class="agent-actions">
        <button class="action-button" @click="manageAgents">
          ⚙️ Manage Agents
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

interface Agent {
  id: string
  name: string
  description?: string
  avatar?: string
  color?: string
}

const props = defineProps<{
  workspacePath: string
  selectedAgentId?: string
}>()

const emit = defineEmits<{
  select: [agentId: string]
  manage: []
}>()

const agents = ref<Agent[]>([])
const showDropdown = ref(false)

const currentAgent = computed(() => {
  return agents.value.find(a => a.id === props.selectedAgentId) || agents.value[0]
})

async function loadAgents() {
  const result = await window.electron.ipcRenderer.invoke('agent:list', {
    workspacePath: props.workspacePath
  })
  if (result.success) {
    agents.value = result.agents
  }
}

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
}

function selectAgent(agentId: string) {
  emit('select', agentId)
  showDropdown.value = false
}

function manageAgents() {
  emit('manage')
  showDropdown.value = false
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.agent-selector')) {
    showDropdown.value = false
  }
}

onMounted(() => {
  loadAgents()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.agent-selector {
  position: relative;
}

.agent-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.agent-button:hover,
.agent-button.active {
  background: var(--bg-tertiary);
  border-color: var(--primary);
}

.agent-avatar {
  font-size: 20px;
  line-height: 1;
}

.agent-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.dropdown-icon {
  font-size: 10px;
  color: var(--text-secondary);
  transition: transform 0.2s;
}

.agent-button.active .dropdown-icon {
  transform: rotate(180deg);
}

.agent-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 280px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
}

.agent-list {
  max-height: 400px;
  overflow-y: auto;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
  text-align: left;
}

.agent-item:hover {
  background: var(--bg-tertiary);
}

.agent-item.selected {
  background: var(--primary-alpha);
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-item .agent-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.agent-description {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.check-icon {
  color: var(--primary);
  font-size: 16px;
  font-weight: bold;
}

.agent-actions {
  border-top: 1px solid var(--border);
  padding: 8px;
}

.action-button {
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all 0.2s;
  text-align: left;
}

.action-button:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}
</style>
