<script setup lang="ts">
import { ref } from 'vue'
import { useWorkspace } from '../composables/useWorkspace'

const { currentWorkspace, workspaces, switchWorkspace } = useWorkspace()
const showMenu = ref(false)

const handleSwitch = async (id: string) => {
  await switchWorkspace(id)
  showMenu.value = false
}
</script>

<template>
  <div class="workspace-switcher">
    <button @click="showMenu = !showMenu" class="current-workspace">
      <span class="workspace-name">{{ currentWorkspace?.name || 'Loading...' }}</span>
      <span class="arrow">▼</span>
    </button>

    <div v-if="showMenu" class="workspace-menu">
      <div
        v-for="ws in workspaces"
        :key="ws.id"
        @click="handleSwitch(ws.id)"
        class="workspace-item"
        :class="{ active: ws.id === currentWorkspace?.id }"
      >
        <span class="name">{{ ws.name }}</span>
        <span class="path">{{ ws.path }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-switcher {
  position: relative;
}

.current-workspace {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.current-workspace:hover {
  background: #2a2a2a;
  border-color: #3a3a3a;
}

.workspace-name {
  font-weight: 500;
}

.arrow {
  font-size: 0.7rem;
  color: #666;
}

.workspace-menu {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  min-width: 250px;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  padding: 0.5rem;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.workspace-item {
  display: flex;
  flex-direction: column;
  padding: 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.workspace-item:hover {
  background: #2a2a2a;
}

.workspace-item.active {
  background: rgba(74, 158, 255, 0.1);
  border: 1px solid rgba(74, 158, 255, 0.3);
}

.workspace-item .name {
  font-weight: 500;
  color: #e0e0e0;
  margin-bottom: 0.25rem;
}

.workspace-item .path {
  font-size: 0.75rem;
  color: #666;
}
</style>
