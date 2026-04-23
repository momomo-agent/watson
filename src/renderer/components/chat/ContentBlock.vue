<script setup lang="ts">
/**
 * ContentBlock — Rendered markdown content with code copy support
 */
import { computed, ref, onMounted, onUpdated } from 'vue'
import { renderMarkdown } from '../../utils/markdown'

const props = defineProps<{
  content: string
}>()

const contentRef = ref<HTMLElement | null>(null)
const rendered = computed(() => renderMarkdown(props.content))

// Wire up code copy buttons after render
const wireCodeCopy = () => {
  if (!contentRef.value) return
  contentRef.value.querySelectorAll('.code-copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const el = e.currentTarget as HTMLButtonElement
      const code = el.dataset.code
      if (!code) return
      navigator.clipboard.writeText(code).then(() => {
        const textEl = el.querySelector('.copy-text')
        if (textEl) {
          textEl.textContent = '已复制'
          setTimeout(() => { textEl.textContent = '复制' }, 1500)
        }
      })
    })
  })
}

onMounted(wireCodeCopy)
onUpdated(wireCodeCopy)
</script>

<template>
  <div ref="contentRef" class="content-block md-content" v-html="rendered" />
</template>

<style scoped>
.content-block {
  font-size: 0.9375rem;
  line-height: 1.7;
  color: var(--text-primary);
  word-break: break-word;
}
</style>
