<script setup lang="ts">
import Sidebar from './components/Sidebar.vue'
import ChatView from './components/ChatView.vue'
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
