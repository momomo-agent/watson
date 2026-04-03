/**
 * FileWatcher — chokidar-based file monitoring for workspace memory files
 *
 * MOMO-55: Watches workspace files (MEMORY.md, memory/**\/*.md) for changes
 * and triggers automatic re-indexing into the memory system.
 *
 * Features:
 * - Debounced batch processing (300ms window)
 * - Automatic re-indexing on add/change/unlink
 * - Configurable ignore patterns
 * - EventEmitter interface for external consumers
 */

import { watch, type FSWatcher } from 'chokidar'
import { EventEmitter } from 'events'
import path from 'path'

export interface FileWatcherConfig {
  /** Debounce window in ms (default: 300) */
  debounceMs?: number
  /** File patterns to watch (default: memory files) */
  patterns?: string[]
  /** Paths to ignore */
  ignored?: (string | RegExp)[]
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink'
  /** Relative path from workspace root */
  relPath: string
  /** Absolute path */
  absPath: string
  timestamp: number
}

export interface FileChangeBatch {
  events: FileChangeEvent[]
  /** Files that need re-indexing (add/change) */
  toIndex: string[]
  /** Files that were deleted (unlink) */
  toRemove: string[]
}

/**
 * Events:
 * - 'batch' (batch: FileChangeBatch) — debounced batch of changes
 * - 'error' (err: Error) — watcher error
 * - 'ready' — initial scan complete
 */
export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null
  private workspaceDir: string
  private config: Required<FileWatcherConfig>
  private pendingEvents: FileChangeEvent[] = []
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private _ready = false

  constructor(workspaceDir: string, config: FileWatcherConfig = {}) {
    super()
    this.workspaceDir = workspaceDir
    this.config = {
      debounceMs: config.debounceMs ?? 300,
      patterns: config.patterns ?? [
        'MEMORY.md',
        'memory/**/*.md',
      ],
      ignored: config.ignored ?? [
        '**/node_modules/**',
        '**/.git/**',
        '**/.watson/**', // Don't watch our own DB
      ],
    }
  }

  get isWatching(): boolean {
    return this.watcher !== null
  }

  get ready(): boolean {
    return this._ready
  }

  /**
   * Start watching the workspace for file changes.
   *
   * Watches concrete files (MEMORY.md) and directories (memory/)
   * to ensure new files in subdirectories are detected.
   */
  start(): void {
    if (this.watcher) return

    // Build watch targets: files stay as-is, globs become parent directories
    const watchPaths: string[] = []
    for (const pattern of this.config.patterns) {
      if (pattern.includes('*')) {
        // Convert glob to its parent directory for recursive watching
        const dir = pattern.split('*')[0].replace(/\/+$/, '')
        watchPaths.push(path.join(this.workspaceDir, dir || '.'))
      } else {
        watchPaths.push(path.join(this.workspaceDir, pattern))
      }
    }

    this.watcher = watch(watchPaths, {
      ignored: this.config.ignored,
      persistent: true,
      ignoreInitial: true, // Don't fire for existing files on startup
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50,
      },
    })

    this.watcher.on('add', absPath => this.onFileEvent('add', absPath))
    this.watcher.on('change', absPath => this.onFileEvent('change', absPath))
    this.watcher.on('unlink', absPath => this.onFileEvent('unlink', absPath))
    this.watcher.on('error', err => this.emit('error', err))
    this.watcher.on('ready', () => {
      this._ready = true
      this.emit('ready')
    })

    console.log(`[file-watcher] Watching ${this.workspaceDir} for memory file changes`)
  }

  /**
   * Stop watching and clean up.
   */
  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    // Flush any pending events before stopping
    if (this.pendingEvents.length > 0) {
      this.flushBatch()
    }

    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
      this._ready = false
      console.log(`[file-watcher] Stopped watching ${this.workspaceDir}`)
    }
  }

  /**
   * Get the relative path from workspace root.
   */
  private toRelPath(absPath: string): string {
    return path.relative(this.workspaceDir, absPath)
  }

  /**
   * Handle a single file event — queue it for debounced batch processing.
   */
  private onFileEvent(type: 'add' | 'change' | 'unlink', absPath: string): void {
    const relPath = this.toRelPath(absPath)

    // Only process .md files
    if (!relPath.endsWith('.md')) return

    const event: FileChangeEvent = {
      type,
      relPath,
      absPath,
      timestamp: Date.now(),
    }

    // Deduplicate: if same file already pending, keep the latest event
    const existingIdx = this.pendingEvents.findIndex(e => e.relPath === relPath)
    if (existingIdx >= 0) {
      this.pendingEvents[existingIdx] = event
    } else {
      this.pendingEvents.push(event)
    }

    // Reset debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = setTimeout(() => {
      this.flushBatch()
    }, this.config.debounceMs)
  }

  /**
   * Flush pending events as a batch.
   */
  private flushBatch(): void {
    if (this.pendingEvents.length === 0) return

    const events = [...this.pendingEvents]
    this.pendingEvents = []
    this.debounceTimer = null

    const toIndex: string[] = []
    const toRemove: string[] = []

    for (const event of events) {
      if (event.type === 'unlink') {
        toRemove.push(event.relPath)
      } else {
        toIndex.push(event.relPath)
      }
    }

    const batch: FileChangeBatch = { events, toIndex, toRemove }

    console.log(
      `[file-watcher] Batch: ${toIndex.length} to index, ${toRemove.length} to remove`
    )

    this.emit('batch', batch)
  }
}
