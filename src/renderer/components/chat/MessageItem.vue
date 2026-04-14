<script setup lang="ts">
/**
 * MessageItem — Single message in the conversation
 *
 * Layout:
 *   [avatar] [header: name + time + status]
 *            [flow: thinking → tools → content → ...]
 *            [actions: cancel / retry / copy]
 *
 * Sender identity is resolved from senderId via workspace registry.
 * Falls back to role-based defaults (user → "You", assistant → workspace name).
 */
import { computed } from 'vue'
import type { ChatMessage, FlowSegment } from '../../../shared/chat-types'
import ThinkingBlock from './ThinkingBlock.vue'
import ToolGroup from './ToolGroup.vue'
import ContentBlock from './ContentBlock.vue'
import MessageActions from './MessageActions.vue'

const props = defineProps<{
  message: ChatMessage
  senderName?: string
  senderAvatar?: string
  isStreaming?: boolean
  statusText?: string
}>()

const emit = defineEmits<{
  cancel: []
  retry: []
}>()

const isUser = computed(() => props.message.role === 'user')
const isDelegate = computed(() => props.message.role === 'agent-to-agent')
const isError = computed(() => props.message.status === 'error')

const displayName = computed(() => {
  if (props.senderName) return props.senderName
  if (props.message.senderName) return props.message.senderName
  if (isUser.value) return 'You'
  return 'Assistant'
})

const avatarText = computed(() => {
  if (props.senderAvatar) return ''  // will use image
  const name = displayName.value
  return name.charAt(0).toUpperCase()
})

const timeStr = computed(() => {
  return new Date(props.message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
})

// Build flow segments from message data
// If message.flow exists, use it directly.
// Otherwise, reconstruct from flat toolCalls + content (backward compat).
const flowSegments = computed<FlowSegment[]>(() => {
  if (props.message.flow?.length) return props.message.flow

  const segments: FlowSegment[] = []

  // Thinking (from legacy thinking field)
  if ((props.message as any).thinking) {
    segments.push({
      type: 'thinking',
      content: (props.message as any).thinking.content,
      durationMs: (props.message as any).thinking.durationMs,
    })
  }

  // Tool calls
  if (props.message.toolCalls?.length) {
    segments.push({
      type: 'tool_group',
      tools: props.message.toolCalls,
    })
  }

  // Text content
  if (props.message.content?.trim()) {
    segments.push({
      type: 'text',
      content: props.message.content,
    })
  }

  return segments
})

const hasFlow = computed(() => flowSegments.value.length > 0)
</script>

<template>
  <div
    class="message-item"
    :class="{
      'is-user': isUser,
      'is-assistant': !isUser,
      'is-delegate': isDelegate,
      'is-error': isError,
      'is-streaming': isStreaming,
    }"
  >
    <!-- Avatar -->
    <div class="msg-avatar">
      <img v-if="senderAvatar" :src="senderAvatar" class="avatar-img" />
      <span v-else class="avatar-text" :class="{ 'avatar-user': isUser }">
        {{ avatarText }}
      </span>
    </div>

    <!-- Body -->
    <div class="msg-body">
      <!-- Header: name + status + time -->
      <div class="msg-header">
        <span class="msg-name" :class="{ 'name-user': isUser, 'name-delegate': isDelegate }">
          {{ displayName }}
        </span>
        <span v-if="isStreaming && statusText" class="msg-status">
          {{ statusText }}
        </span>
        <span class="msg-time">{{ timeStr }}</span>
      </div>

      <!-- User attachments -->
      <div v-if="isUser && message.attachments?.length" class="msg-attachments">
        <img
          v-for="(att, i) in message.attachments"
          :key="i"
          :src="att.url"
          :alt="att.name"
          class="attachment-img"
        />
      </div>

      <!-- Flow segments (assistant) -->
      <div v-if="!isUser && hasFlow" class="msg-flow">
        <template v-for="(seg, i) in flowSegments" :key="i">
          <ThinkingBlock
            v-if="seg.type === 'thinking'"
            :content="seg.content"
            :duration-ms="seg.durationMs"
            :is-streaming="isStreaming && i === flowSegments.length - 1"
          />
          <ToolGroup
            v-else-if="seg.type === 'tool_group'"
            :tools="seg.tools"
            :summary="seg.summary"
            :round-purpose="seg.roundPurpose"
            :is-streaming="isStreaming && i === flowSegments.length - 1"
          />
          <ContentBlock
            v-else-if="seg.type === 'text'"
            :content="seg.content"
          />
        </template>
      </div>

      <!-- User text content (simple) -->
      <div v-if="isUser && message.content" class="msg-user-text">
        {{ message.content }}
      </div>

      <!-- Error display -->
      <div v-if="isError" class="msg-error">
        <span class="error-icon">⚠</span>
        <span>{{ message.error || '发生错误' }}</span>
      </div>

      <!-- Typing indicator -->
      <span v-if="isStreaming && !hasFlow" class="typing-dots">
        <span class="dot" /><span class="dot" /><span class="dot" />
      </span>

      <!-- Actions -->
      <MessageActions
        v-if="!isUser"
        :status="message.status"
        :error-retryable="message.errorRetryable"
        :content="message.content"
        @cancel="emit('cancel')"
        @retry="emit('retry')"
      />
    </div>
  </div>
</template>

<style scoped>
.message-item {
  display: flex;
  gap: 12px;
  padding: 8px 24px;
  transition: background 0.12s;
}

.message-item:hover {
  background: var(--bg-hover, #ffffff04);
}

/* Avatar */
.msg-avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  margin-top: 2px;
}

.avatar-img {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: cover;
}

.avatar-text {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--accent-color, #3b82f6);
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 600;
}

.avatar-user {
  background: var(--text-tertiary, #555);
}

/* Body */
.msg-body {
  flex: 1;
  min-width: 0;
}

.msg-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 2px;
}

.msg-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.name-user {
  color: var(--text-secondary);
}

.name-delegate {
  color: var(--accent-color, #3b82f6);
}

.msg-status {
  font-size: 0.75rem;
  color: var(--accent-color, #3b82f6);
  animation: breathe 2s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.msg-time {
  font-size: 0.6875rem;
  color: var(--text-tertiary, #666);
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.15s;
}

.message-item:hover .msg-time {
  opacity: 1;
}

/* User text */
.msg-user-text {
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

/* Attachments */
.msg-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
}

.attachment-img {
  max-width: 300px;
  max-height: 200px;
  border-radius: 8px;
  object-fit: contain;
}

/* Flow */
.msg-flow {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Error */
.msg-error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--error-bg, #3a1a1a);
  border-radius: 6px;
  color: var(--error, #ef4444);
  font-size: 0.8125rem;
}

.error-icon {
  font-size: 0.875rem;
}

/* Typing dots */
.typing-dots {
  display: inline-flex;
  gap: 3px;
  padding: 4px 0;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-tertiary, #666);
  animation: bounce 1.2s ease-in-out infinite;
}

.dot:nth-child(2) { animation-delay: 0.15s; }
.dot:nth-child(3) { animation-delay: 0.3s; }

@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}
</style>
