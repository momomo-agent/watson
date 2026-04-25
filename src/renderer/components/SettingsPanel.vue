<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useTheme } from '../composables/useTheme'
import { useWorkspace } from '../composables/useWorkspace'
import { backend } from '../infrastructure/backend'

interface McpServer {
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
}

interface ProviderConfig {
  name: string
  type: 'anthropic' | 'openai'
  apiKey: string
  baseUrl?: string
  models: string[]
}

interface VoiceConfig {
  tts?: {
    provider: 'elevenlabs' | 'openai'
    apiKey?: string
    voice?: string
  }
  stt?: {
    mode: 'browser' | 'whisper'
  }
}

interface Config {
  // New format
  providers?: ProviderConfig[]
  selectedProvider?: string
  selectedModel?: string
  voice?: VoiceConfig
  
  // Legacy format (for backward compatibility)
  provider?: 'anthropic' | 'openai'
  apiKey?: string
  baseUrl?: string
  model?: string
  
  mcpServers?: Record<string, McpServer>
}

const emit = defineEmits<{
  close: []
}>()

const { theme } = useTheme()
const { currentWorkspace } = useWorkspace()

const config = ref<Config>({
  providers: [],
  selectedProvider: '',
  selectedModel: ''
})

const editingProvider = ref<ProviderConfig | null>(null)
const showProviderForm = ref(false)

const newServerName = ref('')
const newServerCommand = ref('')
const newServerArgs = ref('')

const heartbeatRunning = ref(false)
const cronJobs = ref<Array<{ id: string, schedule: string }>>([])
const newCronId = ref('')
const newCronSchedule = ref('')

onMounted(async () => {
  const loaded = await backend.invoke("settings:load", { workspacePath: currentWorkspace.value?.path })
  if (loaded) {
    config.value = loaded
    // Ensure providers array exists
    if (!config.value.providers) {
      config.value.providers = []
    }
  }
  
  const status = await backend.invoke("scheduler:heartbeat:status")
  heartbeatRunning.value = status.running
  
  cronJobs.value = await backend.invoke("scheduler:cron:list")
})

const saveConfig = async () => {
  await backend.invoke("settings:save", { config: config.value, workspacePath: currentWorkspace.value?.path })
  emit('close')
}

const addProvider = () => {
  showProviderForm.value = true
  editingProvider.value = {
    name: '',
    type: 'anthropic',
    apiKey: '',
    models: ['claude-sonnet-4-20250514']
  }
}

const editProvider = (provider: ProviderConfig) => {
  showProviderForm.value = true
  editingProvider.value = { ...provider }
}

const saveProvider = () => {
  if (!editingProvider.value || !config.value.providers) return
  
  const index = config.value.providers.findIndex(p => p.name === editingProvider.value!.name)
  if (index >= 0) {
    config.value.providers[index] = editingProvider.value
  } else {
    config.value.providers.push(editingProvider.value)
  }
  
  showProviderForm.value = false
  editingProvider.value = null
}

const deleteProvider = (name: string) => {
  if (!config.value.providers) return
  config.value.providers = config.value.providers.filter(p => p.name !== name)
  if (config.value.selectedProvider === name) {
    config.value.selectedProvider = config.value.providers[0]?.name || ''
  }
}

const cancelProviderEdit = () => {
  showProviderForm.value = false
  editingProvider.value = null
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

const toggleHeartbeat = async () => {
  if (heartbeatRunning.value) {
    await backend.invoke("scheduler:heartbeat:stop")
    heartbeatRunning.value = false
  } else {
    await backend.invoke("scheduler:heartbeat:start")
    heartbeatRunning.value = true
  }
}

const addCronJob = async () => {
  if (!newCronId.value || !newCronSchedule.value) return
  await backend.invoke("scheduler:cron:add", { id: newCronId.value, schedule: newCronSchedule.value })
  cronJobs.value = await backend.invoke("scheduler:cron:list")
  newCronId.value = ''
  newCronSchedule.value = ''
}

const removeCronJob = async (id: string) => {
  await backend.invoke("scheduler:cron:remove", { id })
  cronJobs.value = await backend.invoke("scheduler:cron:list")
}
</script>

<template>
  <Transition name="slide">
    <div class="overlay" @click="emit('close')">
      <div class="panel" @click.stop>
      <div class="header">
        <h2>Settings</h2>
        <button @click="emit('close')" class="close-btn">×</button>
      </div>

      <div class="content">
        <!-- Appearance -->
        <section>
          <h3>Appearance</h3>
          
          <label>
            <span>Theme</span>
            <select v-model="theme" class="input">
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </section>

        <!-- API Configuration -->
        <section>
          <h3>API Providers</h3>
          
          <div v-if="config.providers && config.providers.length > 0" class="provider-list">
            <div v-for="provider in config.providers" :key="provider.name" class="provider-item">
              <div class="provider-info">
                <strong>{{ provider.name }}</strong>
                <span class="provider-type">{{ provider.type }}</span>
                <code class="provider-models">{{ provider.models.join(', ') }}</code>
              </div>
              <div class="provider-actions">
                <button @click="editProvider(provider)" class="edit-btn">Edit</button>
                <button @click="deleteProvider(provider.name)" class="remove-btn">×</button>
              </div>
            </div>
          </div>
          
          <button @click="addProvider" class="add-btn">+ Add Provider</button>
          
          <!-- Provider Form Modal -->
          <div v-if="showProviderForm && editingProvider" class="provider-form">
            <h4>{{ editingProvider.name ? 'Edit' : 'Add' }} Provider</h4>
            
            <label>
              <span>Name</span>
              <input v-model="editingProvider.name" class="input" placeholder="mimo-v2-pro" />
            </label>
            
            <label>
              <span>Type</span>
              <select v-model="editingProvider.type" class="input">
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>
            
            <label>
              <span>API Key</span>
              <input v-model="editingProvider.apiKey" type="password" class="input" placeholder="sk-..." />
            </label>
            
            <label>
              <span>Base URL (optional)</span>
              <input v-model="editingProvider.baseUrl" class="input" placeholder="https://api.anthropic.com" />
            </label>
            
            <label>
              <span>Models (comma-separated)</span>
              <input :value="editingProvider.models.join(', ')" @input="editingProvider.models = ($event.target as HTMLInputElement).value.split(',').map(s => s.trim())" class="input" placeholder="claude-sonnet-4-20250514" />
            </label>
            
            <div class="form-actions">
              <button @click="saveProvider" class="save-btn">Save</button>
              <button @click="cancelProviderEdit" class="cancel-btn">Cancel</button>
            </div>
          </div>
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

        <!-- Heartbeat Scheduler -->
        <section>
          <h3>Heartbeat Scheduler</h3>
          <div class="scheduler-control">
            <span>Status: {{ heartbeatRunning ? 'Running' : 'Stopped' }}</span>
            <button @click="toggleHeartbeat" class="toggle-btn" :class="{ disabled: !heartbeatRunning }">
              {{ heartbeatRunning ? 'Stop' : 'Start' }}
            </button>
          </div>
        </section>

        <!-- Cron Jobs -->
        <section>
          <h3>Cron Jobs</h3>
          
          <div v-if="cronJobs.length" class="server-list">
            <div v-for="job in cronJobs" :key="job.id" class="server-item">
              <div class="server-info">
                <strong>{{ job.id }}</strong>
                <code>{{ job.schedule }}</code>
              </div>
              <button @click="removeCronJob(job.id)" class="remove-btn">×</button>
            </div>
          </div>

          <div class="add-server">
            <input v-model="newCronId" placeholder="Job ID" class="input small" />
            <input v-model="newCronSchedule" placeholder="Cron schedule (e.g., 0 2 * * *)" class="input" />
            <button @click="addCronJob" class="add-btn">Add</button>
          </div>
        </section>
      </div>

      <div class="footer">
        <button @click="emit('close')" class="btn-cancel">Cancel</button>
        <button @click="saveConfig" class="btn-save">Save</button>
      </div>
    </div>
  </div>
  </Transition>
</template>

<style scoped>
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  z-index: 1000;
}

.panel {
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  border-radius: 0;
  width: 420px;
  max-width: 90vw;
  height: 100vh;
  max-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Slide transition */
.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.2s ease, transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}
.slide-enter-from .panel,
.slide-leave-to .panel {
  transform: translateX(100%);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
}

.header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.125rem;
}

.close-btn {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 1.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
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
  color: var(--text-primary);
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
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.input {
  padding: 0.5rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 0.875rem;
}

.input:focus {
  outline: none;
  border-color: var(--accent-color);
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
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  transition: all 0.15s ease;
  cursor: pointer;
}

.server-item:hover {
  border-color: var(--accent-color);
  background: rgba(74, 158, 255, 0.05);
}

.server-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
}

.server-info strong {
  color: var(--text-primary);
  font-size: 0.875rem;
}

.server-info code {
  color: var(--text-secondary);
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
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--accent-color);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn.disabled {
  color: var(--text-secondary);
}

.toggle-btn:hover {
  background: var(--bg-secondary);
}

.remove-btn {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
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
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.add-btn:hover {
  background: var(--bg-secondary);
}

.scheduler-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.scheduler-control span {
  color: var(--text-primary);
  font-size: 0.875rem;
}

.footer {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color);
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
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.btn-cancel:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.btn-save {
  background: var(--accent-color);
  border: none;
  color: white;
}

.btn-save:hover {
  opacity: 0.9;
}
</style>

.provider-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.provider-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  transition: all 0.15s ease;
}

.provider-item:hover {
  border-color: var(--accent-color);
  background: rgba(74, 158, 255, 0.05);
}

.provider-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.provider-info strong {
  color: var(--text-primary);
  font-size: 0.875rem;
}

.provider-type {
  color: var(--text-secondary);
  font-size: 0.75rem;
  text-transform: uppercase;
}

.provider-models {
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-family: 'Monaco', monospace;
}

.provider-actions {
  display: flex;
  gap: 0.5rem;
}

.edit-btn {
  padding: 0.25rem 0.75rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.75rem;
}

.edit-btn:hover {
  background: var(--bg-secondary);
}

.provider-form {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.provider-form h4 {
  margin: 0 0 1rem 0;
  color: var(--text-primary);
}

.form-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.save-btn {
  padding: 0.5rem 1rem;
  background: var(--accent-color);
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
}

.cancel-btn {
  padding: 0.5rem 1rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  cursor: pointer;
}
