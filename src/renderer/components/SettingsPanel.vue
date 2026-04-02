<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface McpServer {
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
}

interface Config {
  provider: 'anthropic' | 'openai'
  apiKey: string
  baseUrl?: string
  model?: string
  mcpServers?: Record<string, McpServer>
}

const emit = defineEmits<{
  close: []
}>()

const config = ref<Config>({
  provider: 'anthropic',
  apiKey: '',
  model: 'claude-sonnet-4-20250514'
})

const newServerName = ref('')
const newServerCommand = ref('')
const newServerArgs = ref('')

onMounted(async () => {
  const loaded = await window.api.loadConfig()
  if (loaded) {
    config.value = loaded
  }
})

const saveConfig = async () => {
  await window.api.saveConfig(config.value)
  emit('close')
}

const addMcpServer = () => {
  if (!newServerName.value || !newServerCommand.value) return
  
  if (!config.value.mcpServers) {
    config.value.mcpServers = {}
  }
  
  config.value.mcpServers[newServerName.value] = {
    command: newServerCommand.value,
    args: newServerArgs.value ? newServerArgs.value.split(' ') : [],
    disabled: false
  }
  
  newServerName.value = ''
  newServerCommand.value = ''
  newServerArgs.value = ''
}

const removeMcpServer = (name: string) => {
  if (config.value.mcpServers) {
    delete config.value.mcpServers[name]
  }
}

const toggleMcpServer = (name: string) => {
  if (config.value.mcpServers?.[name]) {
    config.value.mcpServers[name].disabled = !config.value.mcpServers[name].disabled
  }
}
</script>

<template>
  <div class="overlay" @click="emit('close')">
    <div class="panel" @click.stop>
      <div class="header">
        <h2>Settings</h2>
        <button @click="emit('close')" class="close-btn">×</button>
      </div>

      <div class="content">
        <!-- API Configuration -->
        <section>
          <h3>API Configuration</h3>
          
          <label>
            <span>Provider</span>
            <select v-model="config.provider" class="input">
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </label>

          <label>
            <span>API Key</span>
            <input v-model="config.apiKey" type="password" class="input" placeholder="sk-..." />
          </label>

          <label>
            <span>Model</span>
            <input v-model="config.model" class="input" placeholder="claude-sonnet-4-20250514" />
          </label>

          <label>
            <span>Base URL (optional)</span>
            <input v-model="config.baseUrl" class="input" placeholder="https://api.anthropic.com" />
          </label>
        </section>

        <!-- MCP Servers -->
        <section>
          <h3>MCP Servers</h3>
          
          <div v-if="config.mcpServers" class="server-list">
            <div v-for="(server, name) in config.mcpServers" :key="name" class="server-item">
              <div class="server-info">
                <strong>{{ name }}</strong>
                <code>{{ server.command }} {{ server.args?.join(' ') }}</code>
              </div>
              <div class="server-actions">
                <button @click="toggleMcpServer(name)" class="toggle-btn" :class="{ disabled: server.disabled }">
                  {{ server.disabled ? 'Disabled' : 'Enabled' }}
                </button>
                <button @click="removeMcpServer(name)" class="remove-btn">×</button>
              </div>
            </div>
          </div>

          <div class="add-server">
            <input v-model="newServerName" placeholder="Server name" class="input small" />
            <input v-model="newServerCommand" placeholder="Command" class="input small" />
            <input v-model="newServerArgs" placeholder="Args (space-separated)" class="input small" />
            <button @click="addMcpServer" class="add-btn">Add</button>
          </div>
        </section>
      </div>

      <div class="footer">
        <button @click="emit('close')" class="btn-cancel">Cancel</button>
        <button @click="saveConfig" class="btn-save">Save</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.panel {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  width: 600px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #2a2a2a;
}

.header h2 {
  margin: 0;
  color: #e0e0e0;
  font-size: 1.125rem;
}

.close-btn {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: transparent;
  border: none;
  color: #888;
  font-size: 1.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #2a2a2a;
  color: #e0e0e0;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

section {
  margin-bottom: 2rem;
}

section:last-child {
  margin-bottom: 0;
}

h3 {
  margin: 0 0 1rem 0;
  color: #e0e0e0;
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

label span {
  color: #888;
  font-size: 0.875rem;
}

.input {
  padding: 0.5rem;
  background: #0a0a0a;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 0.875rem;
}

.input:focus {
  outline: none;
  border-color: #4a9eff;
}

.input.small {
  flex: 1;
}

.server-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.server-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  background: #0a0a0a;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
}

.server-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
}

.server-info strong {
  color: #e0e0e0;
  font-size: 0.875rem;
}

.server-info code {
  color: #888;
  font-size: 0.75rem;
  font-family: 'Monaco', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.server-actions {
  display: flex;
  gap: 0.5rem;
}

.toggle-btn {
  padding: 0.25rem 0.75rem;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #4a9eff;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn.disabled {
  color: #888;
}

.toggle-btn:hover {
  background: #3a3a3a;
}

.remove-btn {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: transparent;
  border: 1px solid #2a2a2a;
  color: #888;
  font-size: 1.25rem;
  cursor: pointer;
  transition: all 0.2s;
}

.remove-btn:hover {
  background: #3a1a1a;
  color: #ff6b6b;
}

.add-server {
  display: flex;
  gap: 0.5rem;
}

.add-btn {
  padding: 0.5rem 1rem;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.add-btn:hover {
  background: #3a3a3a;
}

.footer {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  padding: 1rem 1.5rem;
  border-top: 1px solid #2a2a2a;
}

.btn-cancel, .btn-save {
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

.btn-save {
  background: #4a9eff;
  border: none;
  color: white;
}

.btn-save:hover {
  background: #3a8eef;
}
</style>
