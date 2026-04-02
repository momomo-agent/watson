// memory-handlers.ts — IPC handlers for memory search
import { ipcMain } from 'electron'
import * as memoryIndex from '../infrastructure/memory-index'

export function registerMemoryHandlers() {
  ipcMain.handle('memory:buildIndex', async (_, workspaceDir: string) => {
    try {
      const count = memoryIndex.buildIndex(workspaceDir)
      return { success: true, count }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('memory:search', async (_, workspaceDir: string, query: string, maxResults?: number) => {
    try {
      const results = memoryIndex.search(workspaceDir, query, maxResults)
      return { success: true, results }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('memory:indexFile', async (_, workspaceDir: string, relPath: string) => {
    try {
      memoryIndex.indexFile(workspaceDir, relPath)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
