<script setup lang="ts">
import Sidebar from './components/Sidebar.vue'
import ChatView from './components/ChatView.vue'
import SenseIndicator from './components/SenseIndicator.vue'
import { useTheme } from './composables/useTheme'
import { initVoice } from './infrastructure/voice'

useTheme()

// Init voice from config (config is passed via IPC or window.__watsonConfig)
const config = (window as any).__watsonConfig
if (config) initVoice(config)
</script>

<template>
  <div class="app">
    <Sidebar />
    <ChatView />
    <div class="sense-wrapper">
      <SenseIndicator />
    </div>
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
