/**
 * Chat IPC Handlers — Application Layer bridge
 * 
 * Connects renderer (Vue) to domain (ChatSession) via Electron IPC.
 * Manages listener lifecycle to prevent leaks.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { WorkspaceManager } from '../application/workspace-manager'
import { captureCurrentWindow } from '../infrastructure/screen-capture'

const workspaceManager = new WorkspaceManager()

// Track which sessions have listeners attached
const attachedListeners = new Set<string>()

function ensureSessionListener(session: any, sessionId: string, mainWindow: BrowserWindow) {
  const key = `${sessionId}`
  if (attachedListeners.has(key)) return

  session.on('update', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('chat:update', {
        sessionId,
        messages: JSON.parse(JSON.stringify(session.messages))  // deep clone to avoid reactivity issues
      })
    }
  })
  attachedListeners.add(key)
}

export function registerChatHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('chat:send', async (_event, { sessionId, text, workspacePath }) => {
    try {
      const workspace = workspaceManager.getOrCreate(workspacePath || process.cwd())
      const session = workspace.getOrCreateSession(sessionId)

      // Attach listener once per session
      ensureSessionListener(session, sessionId, mainWindow)

      await session.sendMessage(text)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('chat:cancel', async (_event, { sessionId, messageId, workspacePath }) => {
    try {
      const workspace = workspaceManager.getOrCreate(workspacePath || process.cwd())
      const session = workspace.sessions.get(sessionId)
      if (session) {
        session.cancel(messageId)
        return { success: true }
      }
      return { success: false, error: 'Session not found' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('chat:retry', async (_event, { sessionId, messageId, workspacePath }) => {
    try {
      const workspace = workspaceManager.getOrCreate(workspacePath || process.cwd())
      const session = workspace.sessions.get(sessionId)
      if (session) {
        ensureSessionListener(session, sessionId, mainWindow)
        await session.retry(messageId)
        return { success: true }
      }
      return { success: false, error: 'Session not found' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('screen:capture', async () => {
    try {
      const context = await captureCurrentWindow()
      return { success: true, data: context }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}
