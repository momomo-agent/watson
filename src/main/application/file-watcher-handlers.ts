/**
 * FileWatcherHandlers — Application layer for MOMO-55
 *
 * Bridges FileWatcher (infrastructure) with MemoryIndex (infrastructure).
 * Manages lifecycle, wires events, and exposes IPC controls.
 *
 * Architecture:
 * - FileWatcher detects changes → emits 'batch'
 * - This handler receives batches → calls memoryIndex.indexFile / delete
 * - IPC handlers let renderer start/stop/query status
 */

import { ipcMain, BrowserWindow } from 'electron'
import { FileWatcher, type FileChangeBatch, type FileWatcherConfig } from '../infrastructure/file-watcher'
import * as memoryIndex from '../infrastructure/memory-index'

/** Per-workspace watcher instances */
const watchers = new Map<string, FileWatcher>()

/** Stats for monitoring */
interface WatcherStats {
  workspaceDir: string
  isWatching: boolean
  ready: boolean
  totalIndexed: number
  totalRemoved: number
  lastBatchAt: number | null
  errors: string[]
}

const stats = new Map<string, WatcherStats>()

function getStats(workspaceDir: string): WatcherStats {
  if (!stats.has(workspaceDir)) {
    stats.set(workspaceDir, {
      workspaceDir,
      isWatching: false,
      ready: false,
      totalIndexed: 0,
      totalRemoved: 0,
      lastBatchAt: null,
      errors: [],
    })
  }
  return stats.get(workspaceDir)!
}

/**
 * Start watching a workspace directory for memory file changes.
 * Automatically re-indexes changed files.
 */
export function startFileWatcher(
  workspaceDir: string,
  mainWindow: BrowserWindow | null,
  config?: FileWatcherConfig
): FileWatcher {
  // Stop existing watcher for this workspace
  stopFileWatcher(workspaceDir)

  const watcher = new FileWatcher(workspaceDir, config)
  const watcherStats = getStats(workspaceDir)

  watcher.on('ready', () => {
    watcherStats.ready = true
    watcherStats.isWatching = true
    console.log(`[file-watcher-handler] Ready: ${workspaceDir}`)
    mainWindow?.webContents.send('file-watcher:ready', { workspaceDir })
  })

  watcher.on('batch', async (batch: FileChangeBatch) => {
    watcherStats.lastBatchAt = Date.now()

    // Process deletions first
    for (const relPath of batch.toRemove) {
      try {
        await memoryIndex.indexFile(workspaceDir, relPath) // indexFile handles missing files
        watcherStats.totalRemoved++
        console.log(`[file-watcher-handler] Removed from index: ${relPath}`)
      } catch (err) {
        const msg = `Failed to remove ${relPath}: ${(err as Error).message}`
        console.error(`[file-watcher-handler] ${msg}`)
        watcherStats.errors.push(msg)
        if (watcherStats.errors.length > 50) watcherStats.errors.shift()
      }
    }

    // Then re-index changed/added files
    for (const relPath of batch.toIndex) {
      try {
        await memoryIndex.indexFile(workspaceDir, relPath)
        watcherStats.totalIndexed++
        console.log(`[file-watcher-handler] Indexed: ${relPath}`)
      } catch (err) {
        const msg = `Failed to index ${relPath}: ${(err as Error).message}`
        console.error(`[file-watcher-handler] ${msg}`)
        watcherStats.errors.push(msg)
        if (watcherStats.errors.length > 50) watcherStats.errors.shift()
      }
    }

    // Notify renderer
    mainWindow?.webContents.send('file-watcher:batch', {
      workspaceDir,
      indexed: batch.toIndex.length,
      removed: batch.toRemove.length,
      events: batch.events.map(e => ({ type: e.type, path: e.relPath })),
    })
  })

  watcher.on('error', (err: Error) => {
    const msg = `Watcher error: ${err.message}`
    console.error(`[file-watcher-handler] ${msg}`)
    watcherStats.errors.push(msg)
    if (watcherStats.errors.length > 50) watcherStats.errors.shift()
    mainWindow?.webContents.send('file-watcher:error', {
      workspaceDir,
      error: err.message,
    })
  })

  watcher.start()
  watchers.set(workspaceDir, watcher)
  watcherStats.isWatching = true

  return watcher
}

/**
 * Stop watching a workspace directory.
 */
export async function stopFileWatcher(workspaceDir: string): Promise<void> {
  const watcher = watchers.get(workspaceDir)
  if (watcher) {
    await watcher.stop()
    watchers.delete(workspaceDir)
    const watcherStats = getStats(workspaceDir)
    watcherStats.isWatching = false
    watcherStats.ready = false
  }
}

/**
 * Stop all watchers (for app shutdown).
 */
export async function stopAllWatchers(): Promise<void> {
  const dirs = [...watchers.keys()]
  await Promise.all(dirs.map(dir => stopFileWatcher(dir)))
}

/**
 * Register IPC handlers for file watcher control.
 */
export function registerFileWatcherHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('file-watcher:start', (_, workspaceDir: string, config?: FileWatcherConfig) => {
    try {
      startFileWatcher(workspaceDir, mainWindow, config)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('file-watcher:stop', async (_, workspaceDir: string) => {
    try {
      await stopFileWatcher(workspaceDir)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('file-watcher:status', (_, workspaceDir: string) => {
    const watcherStats = getStats(workspaceDir)
    return {
      success: true,
      ...watcherStats,
    }
  })

  ipcMain.handle('file-watcher:status-all', () => {
    return {
      success: true,
      watchers: [...stats.values()],
    }
  })
}
