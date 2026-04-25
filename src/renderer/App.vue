<script setup lang="ts">
import Sidebar from './components/Sidebar.vue'
import ChatView from './components/ChatView.vue'
import IntentsPanel from './components/IntentsPanel.vue'
import SenseIndicator from './components/SenseIndicator.vue'
import ProactiveToast from './components/ProactiveToast.vue'
import { useTheme } from './composables/useTheme'
import { useSession } from './composables/useSession'
import { initVoice } from './infrastructure/voice'
import { ref, computed } from 'vue'

useTheme()
const { currentSessionId } = useSession()
const sessionId = computed(() => currentSessionId.value || 'main')

const config = (window as any).__watsonConfig
if (config) initVoice(config)

const chatViewRef = ref<any>(null)
const sidebarRef = ref<any>(null)
const showIntents = ref(false)

function handleOpenSettings() {
  sidebarRef.value?.openSettings()
}

function handleSettingsClosed() {
  chatViewRef.value?.checkSetup()
}

function handleProactiveAct(context: Record<string, any>) {
  const reason = context.reason as string
  let text = ''
  if (reason === 'error_detected' && context.snippet) {
    text = `我看到屏幕上有错误：\n\`\`\`\n${context.snippet}\n\`\`\`\n帮我分析一下`
  } else if (reason === 'rapid_app_switching' && context.currentApp) {
    text = `我在 ${context.currentApp} 里遇到问题了，帮我看看`
  }
  chatViewRef.value?.prefillInput(text)
}
</script>

<template>
  <div class="app">
    <Sidebar ref="sidebarRef" @settings-closed="handleSettingsClosed" @toggle-intents="showIntents = !showIntents" />
    <ChatView ref="chatViewRef" @open-settings="handleOpenSettings" />
    <IntentsPanel v-if="showIntents" :session-id="sessionId" />
    <div class="sense-wrapper">
      <SenseIndicator />
    </div>
    <ProactiveToast @act="handleProactiveAct" />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sense-wrapper {
  position: fixed;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 100;
}
</style>
