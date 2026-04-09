<script setup lang="ts">
import Sidebar from './components/Sidebar.vue'
import ChatView from './components/ChatView.vue'
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
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100vh;
  overflow: hidden;
}
</style>
