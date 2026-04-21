<script setup lang="ts">
import Sidebar from './components/Sidebar.vue'
import ChatView from './components/ChatView.vue'
import SenseIndicator from './components/SenseIndicator.vue'
import ProactiveToast from './components/ProactiveToast.vue'
import { useTheme } from './composables/useTheme'
import { initVoice } from './infrastructure/voice'
import { ref } from 'vue'

useTheme()

const config = (window as any).__watsonConfig
if (config) initVoice(config)

const chatViewRef = ref<any>(null)
const sidebarRef = ref<any>(null)

function handleOpenSettings() {
  sidebarRef.value?.openSettings()
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
    <Sidebar ref="sidebarRef" />
    <ChatView ref="chatViewRef" @open-settings="handleOpenSettings" />
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
