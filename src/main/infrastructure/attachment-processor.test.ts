import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron's nativeImage before importing
vi.mock('electron', () => ({
  nativeImage: {
    createFromPath: vi.fn().mockReturnValue({
      getSize: () => ({ width: 4000, height: 3000 }),
      resize: vi.fn().mockReturnValue({
        toJPEG: () => Buffer.from('compressed-jpeg'),
        toPNG: () => Buffer.from('compressed-png'),
      }),
      toJPEG: () => Buffer.from('jpeg-data'),
      toPNG: () => Buffer.from('png-data'),
    }),
  },
}))

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { processAttachments, type ProcessedAttachment } from './attachment-processor'
import type { MessageAttachment } from '../../shared/chat-types'

describe('attachment-processor', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watson-test-'))
  })

  // ── Image Processing ──

  it('processes small image as base64', async () => {
    const imgPath = path.join(tmpDir, 'test.png')
    // Write a tiny valid-ish file
    fs.writeFileSync(imgPath, Buffer.from('fake-png-data'))

    const result = await processAttachments([
      { name: 'test.png', type: 'image/png', path: imgPath, size: 13 },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('image')
    expect(result[0].content).toMatch(/^data:image\/png;base64,/)
    expect(result[0].metadata.name).toBe('test.png')
    expect(result[0].metadata.path).toBe(imgPath)
  })

  it('compresses large image (>5MB)', async () => {
    const imgPath = path.join(tmpDir, 'big.jpg')
    // Write a file larger than 5MB
    fs.writeFileSync(imgPath, Buffer.alloc(6 * 1024 * 1024))

    const result = await processAttachments([
      { name: 'big.jpg', type: 'image/jpeg', path: imgPath, size: 6 * 1024 * 1024 },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('image')
    // Should use nativeImage compression (mocked)
    expect(result[0].content).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('enforces max 5 images', async () => {
    const attachments: MessageAttachment[] = []
    for (let i = 0; i < 8; i++) {
      const p = path.join(tmpDir, `img${i}.png`)
      fs.writeFileSync(p, Buffer.from(`img-${i}`))
      attachments.push({ name: `img${i}.png`, type: 'image/png', path: p, size: 5 })
    }

    const result = await processAttachments(attachments)
    const images = result.filter(r => r.type === 'image')
    const refs = result.filter(r => r.type === 'file_ref')

    expect(images).toHaveLength(5)
    expect(refs).toHaveLength(3) // overflow becomes file_ref
  })

  // ── Text File Processing ──

  it('processes small text file', async () => {
    const filePath = path.join(tmpDir, 'code.ts')
    fs.writeFileSync(filePath, 'const x = 42;\nexport default x;')

    const result = await processAttachments([
      { name: 'code.ts', type: 'text/typescript', path: filePath, size: 30 },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('text')
    expect(result[0].content).toContain('const x = 42')
  })

  it('detects text files by extension', async () => {
    const filePath = path.join(tmpDir, 'config.yaml')
    fs.writeFileSync(filePath, 'key: value\nlist:\n  - item1')

    const result = await processAttachments([
      { name: 'config.yaml', type: 'application/octet-stream', path: filePath, size: 25 },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('text')
    expect(result[0].content).toContain('key: value')
  })

  it('treats large text file as file_ref', async () => {
    const filePath = path.join(tmpDir, 'huge.ts')
    fs.writeFileSync(filePath, 'x'.repeat(200 * 1024)) // 200KB

    const result = await processAttachments([
      { name: 'huge.ts', type: 'text/typescript', path: filePath, size: 200 * 1024 },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('file_ref')
    expect(result[0].content).toContain('文件:')
    expect(result[0].content).toContain(filePath)
  })

  // ── File Reference ──

  it('processes binary file as file_ref', async () => {
    const filePath = path.join(tmpDir, 'doc.pdf')
    fs.writeFileSync(filePath, Buffer.alloc(1024))

    const result = await processAttachments([
      { name: 'doc.pdf', type: 'application/pdf', path: filePath, size: 1024 },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('file_ref')
    expect(result[0].content).toContain('doc.pdf')
    expect(result[0].content).toContain('1KB')
  })

  // ── Directory Processing ──

  it('processes directory as tree', async () => {
    const dirPath = path.join(tmpDir, 'project')
    fs.mkdirSync(dirPath)
    fs.mkdirSync(path.join(dirPath, 'src'))
    fs.writeFileSync(path.join(dirPath, 'package.json'), '{}')
    fs.writeFileSync(path.join(dirPath, 'src', 'index.ts'), 'export {}')

    const result = await processAttachments([
      { name: 'project', type: 'inode/directory', path: dirPath, isDirectory: true },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('directory')
    expect(result[0].content).toContain('src/')
    expect(result[0].content).toContain('package.json')
    expect(result[0].content).toContain('index.ts')
  })

  it('limits directory depth to 3 levels', async () => {
    // Create 5-level deep structure
    let current = path.join(tmpDir, 'deep')
    for (let i = 0; i < 5; i++) {
      current = path.join(current, `level${i}`)
      fs.mkdirSync(current, { recursive: true })
      fs.writeFileSync(path.join(current, `file${i}.txt`), `level ${i}`)
    }

    const result = await processAttachments([
      { name: 'deep', type: 'inode/directory', path: path.join(tmpDir, 'deep'), isDirectory: true },
    ])

    expect(result[0].content).toContain('level0')
    expect(result[0].content).toContain('level1')
    expect(result[0].content).toContain('level2')
    // level3+ should be truncated
    expect(result[0].content).toContain('超过')
  })

  // ── Limits ──

  it('enforces max 20 files', async () => {
    const attachments: MessageAttachment[] = []
    for (let i = 0; i < 25; i++) {
      const p = path.join(tmpDir, `file${i}.txt`)
      fs.writeFileSync(p, `content ${i}`)
      attachments.push({ name: `file${i}.txt`, type: 'text/plain', path: p, size: 10 })
    }

    const result = await processAttachments(attachments)
    expect(result).toHaveLength(20)
  })

  // ── Error Handling ──

  it('handles missing file gracefully', async () => {
    const result = await processAttachments([
      { name: 'ghost.txt', type: 'text/plain', path: '/nonexistent/ghost.txt', size: 0 },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('file_ref')
    expect(result[0].content).toContain('处理失败')
  })

  it('handles attachment without path', async () => {
    const result = await processAttachments([
      { name: 'no-path.txt', type: 'text/plain', size: 0 },
    ])

    expect(result).toHaveLength(0)
  })

  // ── Mixed Attachments ──

  it('processes mixed attachment types', async () => {
    const imgPath = path.join(tmpDir, 'photo.png')
    fs.writeFileSync(imgPath, Buffer.from('png'))

    const codePath = path.join(tmpDir, 'app.ts')
    fs.writeFileSync(codePath, 'console.log("hi")')

    const pdfPath = path.join(tmpDir, 'report.pdf')
    fs.writeFileSync(pdfPath, Buffer.alloc(500))

    const dirPath = path.join(tmpDir, 'src')
    fs.mkdirSync(dirPath)
    fs.writeFileSync(path.join(dirPath, 'main.ts'), 'export {}')

    const result = await processAttachments([
      { name: 'photo.png', type: 'image/png', path: imgPath, size: 3 },
      { name: 'app.ts', type: 'text/typescript', path: codePath, size: 17 },
      { name: 'report.pdf', type: 'application/pdf', path: pdfPath, size: 500 },
      { name: 'src', type: 'inode/directory', path: dirPath, isDirectory: true },
    ])

    expect(result).toHaveLength(4)
    expect(result.map(r => r.type)).toEqual(['image', 'text', 'file_ref', 'directory'])
  })
})
