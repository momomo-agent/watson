<script setup lang="ts">
/**
 * ChatInput — Message input with file attachments and screen capture
 *
 * Features:
 * - Auto-resize textarea
 * - File drag & drop / paste / picker (files + folders)
 * - Screen capture button
 * - Agent selector
 * - Shift+Enter for newline, Enter to send
 * - Attachment limits: 20 files, 5 images
 */
import { ref, nextTick, computed, onBeforeUnmount } from 'vue'
import { backend } from '../infrastructure/backend'
import AgentSelector from './AgentSelector.vue'
import AgentManager from './AgentManager.vue'
import type { MessageAttachment } from '../../shared/chat-types'

const MAX_FILES = 20
const MAX_IMAGES = 5

interface AttachmentEntry {
  name: string
  type: string          // mime type
  size: number
  path: string          // Electron File.path — absolute path
  isDirectory?: boolean
  fileCount?: number    // for directories
  previewUrl?: string   // object URL for image thumbnail (renderer only)
}

const props = defineProps<{
  disabled?: boolean
  workspacePath: string
}>()

const emit = defineEmits<{
  send: [text: string, agentId?: string, attachments?: MessageAttachment[]]
}>()

const input = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)
const capturing = ref(false)
const selectedAgentId = ref<string>()
const showAgentManager = ref(false)
const entries = ref<AttachmentEntry[]>([])
const dragOver = ref(false)

// IME composition tracking
const composing = ref(false)

const hasContent = computed(() => input.value.trim() || entries.value.length > 0)

const imageCount = computed(() => entries.value.filter(e => e.type.startsWith('image/')).length)

// ── Send ──

const handleSend = async () => {
  if (!hasContent.value || props.disabled) return

  // Build attachments — pass paths, not data URLs (T6: no OOM)
  const attachments: MessageAttachment[] = entries.value.map(e => ({
    name: e.name,
    type: e.type,
    path: e.path,
    size: e.size,
    isDirectory: e.isDirectory,
    fileCount: e.fileCount,
  }))

  emit('send', input.value.trim(), selectedAgentId.value, attachments.length ? attachments : undefined)
  input.value = ''
  revokeAllPreviews()
  entries.value = []
  nextTick(() => {
    if (textarea.value) textarea.value.style.height = 'auto'
  })
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey && !composing.value) {
    e.preventDefault()
    handleSend()
  }
}

// ── Auto-resize ──

const handleInput = () => {
  if (textarea.value) {
    textarea.value.style.height = 'auto'
    textarea.value.style.height = Math.min(textarea.value.scrollHeight, 200) + 'px'
  }
}

// ── Screen Capture ──

const handleCapture = async () => {
  if (props.disabled || capturing.value) return
  capturing.value = true
  try {
    const result = await backend.invoke('screen:capture')
    if (result.success) {
      const { windowTitle, appName, content } = result.data
      const prefix = `[Screen: ${appName} - ${windowTitle}]\n\n${content}\n\n`
      input.value = prefix + input.value
      nextTick(() => handleInput())
    }
  } catch (error) {
    console.error('Screen capture failed:', error)
  } finally {
    capturing.value = false
  }
}

// ── File Handling ──

function addFileEntries(fileList: FileList | File[]) {
  const arr = Array.from(fileList)
  for (const file of arr) {
    if (entries.value.length >= MAX_FILES) break
    if (file.type.startsWith('image/') && imageCount.value >= MAX_IMAGES) continue
    const entry: AttachmentEntry = {
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      path: (file as any).path || '', // Electron File.path
    }
    // Create object URL for image preview (lightweight, no base64 conversion)
    if (file.type.startsWith('image/')) {
      entry.previewUrl = URL.createObjectURL(file)
    }
    entries.value.push(entry)
  }
}

function addDirectoryEntry(name: string, dirPath: string, fileCount: number) {
  if (entries.value.length >= MAX_FILES) return
  entries.value.push({
    name,
    type: 'inode/directory',
    size: 0,
    path: dirPath,
    isDirectory: true,
    fileCount,
  })
}

const removeEntry = (index: number) => {
  const entry = entries.value[index]
  if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl)
  entries.value.splice(index, 1)
}

function revokeAllPreviews() {
  for (const e of entries.value) {
    if (e.previewUrl) URL.revokeObjectURL(e.previewUrl)
  }
}

onBeforeUnmount(() => revokeAllPreviews())

// ── Drag & Drop (T4: folder support via webkitGetAsEntry) ──

const handleDrop = async (e: DragEvent) => {
  e.preventDefault()
  dragOver.value = false
  if (!e.dataTransfer) return

  const items = e.dataTransfer.items
  if (items?.length) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const entry = item.webkitGetAsEntry?.()
      if (entry?.isDirectory) {
        // Count files in directory (shallow)
        const count = await countDirectoryFiles(entry as FileSystemDirectoryEntry)
        const dirPath = (e.dataTransfer.files[i] as any)?.path || entry.fullPath
        addDirectoryEntry(entry.name, dirPath, count)
      } else {
        const file = item.getAsFile()
        if (file) addFileEntries([file])
      }
    }
  } else if (e.dataTransfer.files?.length) {
    addFileEntries(e.dataTransfer.files)
  }
}

function countDirectoryFiles(dirEntry: FileSystemDirectoryEntry): Promise<number> {
  return new Promise(resolve => {
    const reader = dirEntry.createReader()
    let count = 0
    const readBatch = () => {
      reader.readEntries(results => {
        if (!results.length) { resolve(count); return }
        count += results.length
        if (count > 200) { resolve(count); return }
        readBatch()
      }, () => resolve(count))
    }
    readBatch()
  })
}

const handlePaste = (e: ClipboardEvent) => {
  const items = e.clipboardData?.items
  if (!items) return
  const pastedFiles: File[] = []
  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) pastedFiles.push(file)
    }
  }
  if (pastedFiles.length) addFileEntries(pastedFiles)
}

const openFilePicker = () => {
  const inp = document.createElement('input')
  inp.type = 'file'
  inp.multiple = true
  inp.onchange = () => { if (inp.files) addFileEntries(inp.files) }
  inp.click()
}

const openFolderPicker = () => {
  const inp = document.createElement('input')
  inp.type = 'file'
  ;(inp as any).webkitdirectory = true
  inp.onchange = () => {
    if (!inp.files?.length) return
    // All files share the same root folder via webkitRelativePath
    const first = inp.files[0]
    const relPath = (first as any).webkitRelativePath || ''
    const folderName = relPath.split('/')[0] || 'folder'
    // Get the directory path from the first file's path
    const filePath = (first as any).path || ''
    const dirPath = filePath ? filePath.substring(0, filePath.length - relPath.length + folderName.length) : ''
    addDirectoryEntry(folderName, dirPath, inp.files.length)
  }
  inp.click()
}

// ── Helpers ──

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function isImage(entry: AttachmentEntry): boolean {
  return entry.type.startsWith('image/')
}

function fileTypeIcon(entry: AttachmentEntry): string {
  if (entry.isDirectory) return '📁'
  if (entry.type.startsWith('image/')) return '🖼'
  if (entry.type.startsWith('text/') || /\.(md|ts|js|py|json|yaml|yml|html|css|vue)$/i.test(entry.name)) return '📄'
  if (entry.type.startsWith('video/')) return '🎬'
  if (entry.type.startsWith('audio/')) return '🎵'
  if (entry.type === 'application/pdf') return '📕'
  return '📎'
}
</script>

<template>
  <div
    class="chat-input-wrap"
    :class="{ 'drag-over': dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop="handleDrop"
  >
    <!-- File previews -->
    <div v-if="entries.length" class="file-previews">
      <div v-for="(entry, i) in entries" :key="i" class="file-preview">
        <img v-if="isImage(entry) && entry.previewUrl" :src="entry.previewUrl" class="file-thumb" />
        <span v-else class="file-icon">{{ fileTypeIcon(entry) }}</span>
        <span class="file-name">{{ entry.name }}</span>
        <span v-if="entry.isDirectory && entry.fileCount" class="file-size">{{ entry.fileCount }} 文件</span>
        <span v-else-if="entry.size" class="file-size">{{ formatSize(entry.size) }}</span>
        <button class="file-remove" @click="removeEntry(i)">✕</button>
      </div>
    </div>

    <div class="chat-input">
      <AgentSelector
        :workspace-path="workspacePath"
        :selected-agent-id="selectedAgentId"
        @select="(id: string) => selectedAgentId = id"
        @manage="showAgentManager = true"
      />

      <button class="icon-btn" @click="openFilePicker" :disabled="disabled" title="Attach file">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
        </svg>
      </button>

      <button class="icon-btn" @click="openFolderPicker" :disabled="disabled" title="Attach folder">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      <button class="icon-btn" @click="handleCapture" :disabled="disabled || capturing" title="Capture screen">
        <svg v-if="!capturing" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        <span v-else class="capturing-dot">●</span>
      </button>

      <textarea
        ref="textarea"
        v-model="input"
        :disabled="disabled"
        placeholder="Message... (Shift+Enter for newline)"
        @keydown="handleKeydown"
        @input="handleInput"
        @paste="handlePaste"
        @compositionstart="composing = true"
        @compositionend="composing = false"
        rows="1"
      />

      <button class="send-btn" :class="{ active: hasContent }" @click="handleSend" :disabled="disabled || !hasContent">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 19V5"/>
          <path d="m5 12 7-7 7 7"/>
        </svg>
      </button>
    </div>

    <AgentManager
      :show="showAgentManager"
      :workspace-path="workspacePath"
      @close="showAgentManager = false"
      @update="showAgentManager = false"
    />
  </div>
</template>

<style scoped>
.chat-input-wrap {
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
  transition: border-color 0.15s;
}

.chat-input-wrap.drag-over {
  border-color: var(--accent-color);
  background: var(--accent-dim, #3b82f60a);
}

/* File previews */
.file-previews {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px 0;
}

.file-preview {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.file-thumb {
  width: 24px;
  height: 24px;
  border-radius: 3px;
  object-fit: cover;
}

.file-icon { font-size: 0.875rem; }
.file-name { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-size { opacity: 0.6; }

.file-remove {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0 2px;
  font-size: 0.625rem;
}

.file-remove:hover { color: var(--error, #ef4444); }

/* Input bar */
.chat-input {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  align-items: flex-end;
}

.icon-btn {
  padding: 6px;
  min-width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
  flex-shrink: 0;
}

.icon-btn:hover:not(:disabled) {
  background: var(--bg-hover, #ffffff08);
  color: var(--text-primary);
}

.icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.capturing-dot {
  color: var(--error, #ef4444);
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

textarea {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.9rem;
  resize: none;
  min-height: 36px;
  max-height: 200px;
  line-height: 1.5;
  overflow-y: auto;
}

textarea:focus {
  outline: none;
  border-color: var(--accent-color);
}

textarea:disabled { opacity: 0.5; }

.send-btn {
  padding: 6px;
  min-width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}

.send-btn.active {
  background: var(--accent-color);
  color: #fff;
}

.send-btn:disabled { opacity: 0.3; cursor: not-allowed; }
</style>
