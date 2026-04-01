import { ipcMain, BrowserWindow } from 'electron'
import { WorkspaceManager } from '../application/workspace-manager'

const workspaceManager = new WorkspaceManager()

export function registerChatHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('chat:send', async (event, { sessionId, text, workspacePath }) => {
    const workspace = workspaceManager.getOrCreate(workspacePath || process.cwd())
    const session = workspace.getOrCreateSession(sessionId)      
      // 监听更新
      session.on('update', () => {
        mainWindow.webContents.send('chat:update', {
          sessionId,
          messages: session!.messages
        })
      })
    }
    
    await session.sendMessage(text)
  })

  ipcMain.handle('chat:cancel', async (event, { sessionId, workspacePath }) => {
    const workspace = workspaceManager.getOrCreate(workspacePath || process.cwd())
    const session = workspace.sessions.get(sessionId)
    if (session) session.cancel(messageId)
  })

  ipcMain.handle('chat:retry', async (event, { sessionId, messageId, workspacePath }) => {
    const workspace = workspaceManager.getOrCreate(workspacePath || process.cwd())
    const session = workspace.sessions.get(sessionId)
    if (session) await session.retry(messageId)
  })
}
