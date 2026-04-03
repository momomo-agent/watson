import { ipcMain, BrowserWindow } from 'electron'
import { MessageStore } from '../infrastructure/message-store'

const messageStore = new MessageStore()

export function registerPersistenceHandlers(window: BrowserWindow) {
  ipcMain.handle('messages:save', (_, message) => {
    messageStore.save(message)
  })

  ipcMain.handle('messages:load', (_, { sessionId, workspaceId }) => {
    return messageStore.load(sessionId, workspaceId)
  })

  ipcMain.handle('messages:clear', (_, { sessionId, workspaceId }) => {
    messageStore.clear(sessionId, workspaceId)
  })
}
