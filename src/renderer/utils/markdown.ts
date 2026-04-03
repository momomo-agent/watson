import { marked } from 'marked'
import hljs from 'highlight.js'

const renderer = new marked.Renderer()

renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  // 高亮代码
  let highlighted: string
  let detectedLang = lang || 'plaintext'
  
  if (lang && hljs.getLanguage(lang)) {
    highlighted = hljs.highlight(text, { language: lang }).value
  } else {
    const result = hljs.highlightAuto(text)
    highlighted = result.value
    detectedLang = result.language || 'plaintext'
  }
  
  // 添加行号
  const lines = highlighted.split('\n')
  const numberedLines = lines.map((line, index) => {
    const lineNumber = index + 1
    return `<span class="code-line"><span class="line-number">${lineNumber}</span><span class="line-content">${line || ' '}</span></span>`
  }).join('\n')
  
  // 生成完整的代码块结构
  return `
    <div class="code-block-wrapper">
      <div class="code-block-header">
        <span class="code-lang">${detectedLang}</span>
        <button class="code-copy-btn" data-code="${escapeHtml(text)}" title="Copy code">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span class="copy-text">Copy</span>
        </button>
      </div>
      <pre><code class="hljs language-${detectedLang}">${numberedLines}</code></pre>
    </div>
  `
}

renderer.link = ({ href, text }: { href: string; text: string }) => {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`
}

marked.setOptions({ renderer })

// HTML 转义函数，用于 data 属性
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function renderMarkdown(text: string): string {
  return marked.parse(text) as string
}
