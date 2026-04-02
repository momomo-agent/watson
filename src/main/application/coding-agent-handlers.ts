import { ipcMain, BrowserWindow } from 'electron'
import { CodingAgentSession } from '../domain/coding-agent-session'

const sessions = new Map<string, CodingAgentSession>()

export function registerCodingAgentHandlers(window: BrowserWindow) {
  ipcMain.handle('coding-agent:start', (_, sessionId: string, task: string, workdir: string) => {
    if (sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`)
    }

    const session = new CodingAgentSession()
    sessions.set(sessionId, session)

    session.onProgress((data) => {
      window.webContents.send('coding-agent:progress', sessionId, data)
    })

    session.onComplete((result) => {
      window.webContents.send('coding-agent:complete', sessionId, result)
      sessions.delete(sessionId)
    })

    session.start(task, workdir)
    return { success: true }
  })

  ipcMain.handle('coding-agent:cancel', (_, sessionId: string) => {
    const session = sessions.get(sessionId)
    if (session) {
      session.cancel()
      sessions.delete(sessionId)
    }
    return { success: true }
  })
}
