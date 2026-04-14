<script setup lang="ts">
/**
 * MessageList — Scrollable message container
 *
 * Responsibilities:
 * - Auto-scroll to bottom on new messages (unless user scrolled up)
 * - Resolve sender identity from workspace registry
 * - Pass streaming state to the active message
 */
import { ref, watch, nextTick, computed } from 'vue'
import type { ChatMessage, ChatUpdateEvent } from '../../../shared/chat-types'
import MessageItem from './MessageItem.vue'

const props = defineProps<{
  messages: ChatMessage[]
  statusText?: string
}>()

const emit = defineEmits<{
  cancel: [msgId: string]
  retry: [msgId: string]
}>()

const containerRef = ref<HTMLElement | null>(null)
const userScrolledUp = ref(false)

// Track if user has scrolled away from bottom
const handleScroll = () => {
  if (!containerRef.value) return
  const { scrollTop, scrollHeight, clientHeight } = containerRef.value
  userScrolledUp.value = scrollHeight - scrollTop - clientHeight > 80
}

// Auto-scroll to bottom when messages change (unless user scrolled up)
watch(() => props.messages.length, async () => {
  if (userScrolledUp.value) return
  await nextTick()
  if (containerRef.value) {
    containerRef.value.scrollTop = containerRef.value.scrollHeight
  }
})

// Also scroll when last message content updates (streaming)
watch(
  () => props.messages[props.messages.length - 1]?.content,
  async () => {
    if (userScrolledUp.value) return
    await nextTick()
    if (containerRef.value) {
      containerRef.value.scrollTop = containerRef.value.scrollHeight
    }
  }
)

// Determine which message is currently streaming
const streamingMsgId = computed(() => {
  const last = props.messages[props.messages.length - 1]
  if (!last) return null
  if (['pending', 'streaming', 'tool_calling'].includes(last.status)) {
    return last.id
  }
  return null
})
</script>

<template>
  <div class="message-list" ref="containerRef" @scroll="handleScroll">
    <slot name="empty" v-if="messages.length === 0" />

    <MessageItem
      v-for="msg in messages"
      :key="msg.id"
      :message="msg"
      :is-streaming="msg.id === streamingMsgId"
      :status-text="msg.id === streamingMsgId ? statusText : undefined"
      @cancel="emit('cancel', msg.id)"
      @retry="emit('retry', msg.id)"
    />

    <!-- Scroll anchor -->
    <div class="scroll-anchor" />
  </div>
</template>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 0;
  scroll-behavior: smooth;
}

/* Scrollbar */
.message-list::-webkit-scrollbar {
  width: 6px;
}

.message-list::-webkit-scrollbar-track {
  background: transparent;
}

.message-list::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.message-list::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

.scroll-anchor {
  height: 1px;
}
</style>
