import { ipcMain, BrowserWindow } from 'electron'
import { MessageStore } from '../infrastructure/message-store'

const messageStore = new MessageStore()

export function registerPersistenceHandlers(window: BrowserWindow) {
  ipcMain.handle('messages:save', (_, message) => {
    messageStore.save(message)
  })

  ipcMain.handle('messages:load', (_, workspaceId: string) => {
    return messageStore.load(workspaceId)
  })

  ipcMain.handle('messages:clear', (_, workspaceId: string) => {
    messageStore.clear(workspaceId)
  })
}
