// memory-handlers.ts — IPC handlers for memory search
import { ipcMain } from 'electron'
import * as memoryIndex from '../infrastructure/memory-index'

export function registerMemoryHandlers() {
  ipcMain.handle('memory:buildIndex', async (_, workspaceDir: string, config?: { apiKey?: string; baseUrl?: string }) => {
    try {
      const count = await memoryIndex.buildIndex(workspaceDir, config)
      return { success: true, count }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('memory:search', async (_, workspaceDir: string, query: string, maxResults?: number) => {
    try {
      const results = await memoryIndex.search(workspaceDir, query, maxResults)
      return { success: true, results }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('memory:indexFile', async (_, workspaceDir: string, relPath: string) => {
    try {
      await memoryIndex.indexFile(workspaceDir, relPath)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
