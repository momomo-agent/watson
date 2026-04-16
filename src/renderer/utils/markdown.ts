import { marked } from 'marked'
import hljs from 'highlight.js'

// ── Workspace context ──

let _clawDir: string | null = null

export function setClawDir(dir: string | null) {
  _clawDir = dir
}

// ── Widget detection ──

function looksLikeWidget(code: string): boolean {
  if (code.length < 50) return false
  const lower = code.toLowerCase()
  const hasStyle = lower.includes('<style') || lower.includes('style="')
  const hasSvg = lower.includes('<svg')
  const hasCanvas = lower.includes('<canvas')
  const hasScript = lower.includes('<script')
  const hasInteractive = lower.includes('<button') || lower.includes('<input') ||
    lower.includes('<select') || lower.includes('<range') || lower.includes('onclick')
  const hasCssVars = lower.includes('var(--')
  const hasDiv = lower.includes('<div')
  return (hasStyle && hasDiv) || hasSvg || hasCanvas || hasScript || hasInteractive || hasCssVars
}

// ── File type detection ──

const AUDIO_EXT = /\.(mp3|wav|ogg|aac|flac|m4a|webm|opus)$/i
const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv|m4v)$/i
const IMAGE_EXT = /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|avif)$/i

function extFromHref(href: string): string {
  try {
    const clean = href.split('?')[0].split('#')[0]
    const m = clean.match(/\.(\w+)$/)
    return m ? m[1].toLowerCase() : ''
  } catch { return '' }
}

function fileNameFromHref(href: string): string {
  try {
    const clean = href.split('?')[0].split('#')[0]
    const parts = clean.split('/')
    return decodeURIComponent(parts[parts.length - 1] || 'file')
  } catch { return 'file' }
}

function encodeFilePath(p: string): string {
  return p.split('/').map(seg => encodeURIComponent(seg)).join('/')
}

function resolveLocalHref(href: string): string {
  if (!href) return href
  if (href.startsWith('http') || href.startsWith('file://') || href.startsWith('data:')) return href
  if (href.startsWith('/')) return `file://${encodeFilePath(href)}`
  if (_clawDir) return `file://${encodeFilePath(_clawDir)}/${encodeFilePath(href)}`
  return href
}

function isLocalFile(href: string): boolean {
  return href.startsWith('file://') || href.startsWith('/')
}

// ── Media renderers ──

function renderAudio(href: string, title: string): string {
  const name = title || fileNameFromHref(href)
  return `<div class="md-audio">
    <div class="md-audio-header">
      <span class="md-audio-icon">♫</span>
      <span class="md-audio-name">${escapeHtml(name)}</span>
    </div>
    <audio controls preload="metadata" src="${href}"></audio>
  </div>`
}

function renderVideo(href: string, title: string, text: string): string {
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
  return `<div class="md-video"${titleAttr}>
    <video controls preload="metadata" src="${href}">${escapeHtml(text || '')}</video>
  </div>`
}

function renderFileCard(href: string, name: string): string {
  const ext = extFromHref(href).toUpperCase() || 'FILE'
  return `<a class="md-file-card" href="#" data-path="${href}">
    <span class="md-file-icon">${ext}</span>
    <span class="md-file-name">${escapeHtml(name)}</span>
    <span class="md-file-open">↗</span>
  </a>`
}

// ── Renderer setup ──

const renderer = new marked.Renderer()

renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const code = text || ''

  // Mermaid diagrams
  if (lang === 'mermaid') {
    return `<pre class="mermaid">${escapeHtml(code)}</pre>`
  }

  // HTML widget: render as interactive container
  if (lang === 'html' && looksLikeWidget(code)) {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    return `<div class="widget-container" data-widget-code="${escaped}"><div class="widget-loading">Loading widget…</div></div>`
  }

  // Default: highlighted code with line numbers + copy button
  let highlighted: string
  let detectedLang = lang || 'plaintext'

  if (lang && hljs.getLanguage(lang)) {
    highlighted = hljs.highlight(code, { language: lang }).value
  } else {
    const result = hljs.highlightAuto(code)
    highlighted = result.value
    detectedLang = result.language || 'plaintext'
  }

  const lines = highlighted.split('\n')
  const numberedLines = lines.map((line, index) => {
    const lineNumber = index + 1
    return `<span class="code-line"><span class="line-number">${lineNumber}</span><span class="line-content">${line || ' '}</span></span>`
  }).join('\n')

  return `
    <div class="code-block-wrapper">
      <div class="code-block-header">
        <span class="code-lang">${detectedLang}</span>
      </div>
      <button class="code-copy-btn" data-code="${escapeHtml(code)}" title="Copy code">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span class="copy-text">Copy</span>
      </button>
      <pre><code class="hljs language-${detectedLang}">${numberedLines}</code></pre>
    </div>
  `
}

renderer.image = ({ href: rawHref, title, text }: { href: string; title?: string | null; text?: string }) => {
  const href = resolveLocalHref(rawHref || '')
  const caption = text || title || ''
  const escaped = escapeHtml(caption)

  const isValidHref = rawHref && (
    rawHref.startsWith('http') ||
    rawHref.startsWith('data:') ||
    rawHref.startsWith('file://') ||
    rawHref.startsWith('/') ||
    rawHref.startsWith('../') ||
    rawHref.startsWith('./') ||
    (rawHref.includes('/') && rawHref.includes('.')) ||
    IMAGE_EXT.test(rawHref) ||
    AUDIO_EXT.test(rawHref) ||
    VIDEO_EXT.test(rawHref)
  )

  if (!isValidHref) {
    if (!caption) return ''
    return `<span class="md-img-placeholder"><span class="md-img-placeholder-icon">🖼</span><span class="md-img-placeholder-text">${escaped}</span></span>`
  }

  if (AUDIO_EXT.test(href)) return renderAudio(href, title || '')
  if (VIDEO_EXT.test(href)) return renderVideo(href, title || '', text || '')

  return `<img src="${href}" alt="${escaped}" class="markdown-image" data-preview-src="${href}" loading="lazy" style="max-width:100%;border-radius:8px;margin:8px 0">`
}

renderer.link = ({ href: rawHref, title, text }: { href: string; title?: string | null; text?: string }) => {
  const href = resolveLocalHref(rawHref || '')

  if (isLocalFile(href)) {
    if (AUDIO_EXT.test(href)) return renderAudio(href, title || '')
    if (VIDEO_EXT.test(href)) return renderVideo(href, title || '', text || '')
    if (IMAGE_EXT.test(href)) {
      return `<img src="${href}" alt="${escapeHtml(text || '')}" style="max-width:100%;border-radius:8px;margin:8px 0">`
    }
    const name = text || fileNameFromHref(href)
    return renderFileCard(href, name)
  }

  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text || href}</a>`
}

// Hide empty table headers
const originalTable = renderer.table.bind(renderer)
renderer.table = (token: any) => {
  const html: string = originalTable(token)
  const allEmpty = Array.isArray(token.header) && token.header.length > 0 &&
    token.header.every((cell: any) =>
      !cell.tokens || cell.tokens.length === 0 ||
      cell.tokens.every((t: any) => t.type === 'text' && !t.raw?.trim())
    )
  if (allEmpty) {
    return html.replace(/<thead>[\s\S]*?<\/thead>/i, '')
  }
  return html
}

marked.setOptions({ renderer })

// ── Exports ──

export function renderMarkdown(text: string): string {
  return marked.parse(text) as string
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '[image]')
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]+([^*_~]+)[*_~]+/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/\n{2,}/g, ' ')
    .trim()
    .slice(0, 100)
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
