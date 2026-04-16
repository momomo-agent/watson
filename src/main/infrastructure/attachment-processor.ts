/**
 * Attachment Processor — Infrastructure Layer
 *
 * Processes file attachments in the main process (safe from renderer OOM).
 * Strategies:
 *   - image/*: read as base64 data URL (compress if >5MB via nativeImage)
 *   - text files (<100KB): read content as string
 *   - large/binary files: pass path reference only
 *   - directories: recursive tree listing (max 3 levels, 200 entries)
 */

import * as fs from 'fs'
import * as path from 'path'
import { nativeImage } from 'electron'
import type { MessageAttachment } from '../../shared/chat-types'

export interface ProcessedAttachment {
  type: 'image' | 'text' | 'file_ref' | 'directory'
  content: string
  metadata: { name: string; path: string; size: number; mimeType: string }
}

// Limits
const MAX_FILES = 20
const MAX_IMAGES = 5
const IMAGE_COMPRESS_THRESHOLD = 5 * 1024 * 1024 // 5MB
const IMAGE_MAX_DIMENSION = 2048
const JPEG_QUALITY = 85
const TEXT_SIZE_LIMIT = 100 * 1024 // 100KB
const DIR_MAX_DEPTH = 3
const DIR_MAX_ENTRIES = 200

const TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go', '.rs',
  '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.hpp', '.cs', '.php',
  '.html', '.css', '.scss', '.less', '.json', '.yaml', '.yml', '.toml',
  '.xml', '.sql', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat',
  '.env', '.gitignore', '.dockerignore', '.editorconfig',
  '.vue', '.svelte', '.astro', '.mdx', '.csv', '.log', '.ini', '.cfg',
  '.r', '.R', '.lua', '.zig', '.nim', '.ex', '.exs', '.erl', '.hrl',
  '.clj', '.cljs', '.scala', '.sbt', '.gradle', '.cmake', '.makefile',
])

function isTextFile(filePath: string, mimeType: string): boolean {
  if (mimeType.startsWith('text/')) return true
  const ext = path.extname(filePath).toLowerCase()
  return TEXT_EXTENSIONS.has(ext)
}

function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

async function processImage(filePath: string, mimeType: string): Promise<ProcessedAttachment> {
  const stat = fs.statSync(filePath)
  let dataUrl: string

  if (stat.size > IMAGE_COMPRESS_THRESHOLD) {
    // Use Electron's nativeImage to resize large images
    const img = nativeImage.createFromPath(filePath)
    const size = img.getSize()
    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(size.width, size.height))
    const resized = scale < 1
      ? img.resize({ width: Math.round(size.width * scale), height: Math.round(size.height * scale) })
      : img
    const buf = mimeType === 'image/png' ? resized.toPNG() : resized.toJPEG(JPEG_QUALITY)
    const base64 = buf.toString('base64')
    const mt = mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
    dataUrl = `data:${mt};base64,${base64}`
  } else {
    const buf = fs.readFileSync(filePath)
    const base64 = buf.toString('base64')
    dataUrl = `data:${mimeType};base64,${base64}`
  }

  return {
    type: 'image',
    content: dataUrl,
    metadata: { name: path.basename(filePath), path: filePath, size: stat.size, mimeType },
  }
}

function processTextFile(filePath: string, mimeType: string): ProcessedAttachment {
  const stat = fs.statSync(filePath)
  const content = fs.readFileSync(filePath, 'utf-8')
  return {
    type: 'text',
    content,
    metadata: { name: path.basename(filePath), path: filePath, size: stat.size, mimeType },
  }
}

function processFileRef(filePath: string, mimeType: string): ProcessedAttachment {
  const stat = fs.statSync(filePath)
  const sizeStr = formatBytes(stat.size)
  return {
    type: 'file_ref',
    content: `[文件: ${filePath} (${sizeStr}, ${mimeType})]`,
    metadata: { name: path.basename(filePath), path: filePath, size: stat.size, mimeType },
  }
}

function processDirectory(dirPath: string): ProcessedAttachment {
  const tree = buildDirectoryTree(dirPath, 0)
  return {
    type: 'directory',
    content: tree.lines.join('\n'),
    metadata: { name: path.basename(dirPath), path: dirPath, size: 0, mimeType: 'inode/directory' },
  }
}

function buildDirectoryTree(
  dirPath: string,
  depth: number,
  counter = { count: 0 },
): { lines: string[] } {
  const lines: string[] = []
  if (depth >= DIR_MAX_DEPTH || counter.count >= DIR_MAX_ENTRIES) {
    if (depth >= DIR_MAX_DEPTH) lines.push(`${'  '.repeat(depth)}...（超过 ${DIR_MAX_DEPTH} 层）`)
    return { lines }
  }

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    lines.push(`${'  '.repeat(depth)}[无法读取]`)
    return { lines }
  }

  // Sort: directories first, then files
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name)
  })

  for (const entry of entries) {
    if (counter.count >= DIR_MAX_ENTRIES) {
      lines.push(`${'  '.repeat(depth)}...（超过 ${DIR_MAX_ENTRIES} 条目）`)
      break
    }
    counter.count++
    const prefix = '  '.repeat(depth)
    if (entry.isDirectory()) {
      lines.push(`${prefix}📁 ${entry.name}/`)
      const sub = buildDirectoryTree(path.join(dirPath, entry.name), depth + 1, counter)
      lines.push(...sub.lines)
    } else {
      lines.push(`${prefix}${entry.name}`)
    }
  }

  return { lines }
}

/**
 * Process an array of MessageAttachments from the renderer.
 * Enforces limits: max 20 files, max 5 images.
 */
export async function processAttachments(attachments: MessageAttachment[]): Promise<ProcessedAttachment[]> {
  const results: ProcessedAttachment[] = []
  let imageCount = 0

  // Enforce total file limit
  const limited = attachments.slice(0, MAX_FILES)

  for (const att of limited) {
    const filePath = att.path
    if (!filePath) continue

    try {
      // Directory
      if (att.isDirectory) {
        results.push(processDirectory(filePath))
        continue
      }

      const stat = fs.statSync(filePath)
      const mimeType = att.type || 'application/octet-stream'

      // Image
      if (isImageMime(mimeType) && imageCount < MAX_IMAGES) {
        imageCount++
        results.push(await processImage(filePath, mimeType))
        continue
      }

      // Text file under size limit
      if (isTextFile(filePath, mimeType) && stat.size <= TEXT_SIZE_LIMIT) {
        results.push(processTextFile(filePath, mimeType))
        continue
      }

      // Everything else: file reference
      results.push(processFileRef(filePath, mimeType))
    } catch (err) {
      console.warn(`[attachment-processor] Failed to process ${filePath}:`, err)
      // Still add as file_ref so the LLM knows about it
      results.push({
        type: 'file_ref',
        content: `[文件: ${filePath} (处理失败)]`,
        metadata: { name: att.name, path: filePath, size: att.size || 0, mimeType: att.type || 'unknown' },
      })
    }
  }

  return results
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
