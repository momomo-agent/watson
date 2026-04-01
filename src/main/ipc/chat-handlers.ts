import { ipcMain, BrowserWindow } from 'electron'
import { ChatSession } from '../domain/chat-session'

const sessions = new Map<string, ChatSession>()

export function registerChatHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('chat:send', async (event, { sessionId, text }) => {
    let session = sessions.get(sessionId)
    if (!session) {
      // 使用当前工作目录作为 workspace
      session = new ChatSession(sessionId, process.cwd())
      sessions.set(sessionId, session)
      
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

  ipcMain.handle('chat:cancel', async (event, { sessionId, messageId }) => {
    const session = sessions.get(sessionId)
    if (session) session.cancel(messageId)
  })

  ipcMain.handle('chat:retry', async (event, { sessionId, messageId }) => {
    const session = sessions.get(sessionId)
    if (session) await session.retry(messageId)
  })
}
