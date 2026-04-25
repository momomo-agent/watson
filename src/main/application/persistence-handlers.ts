/**
 * Persistence IPC Handlers
 *
 * Bridges renderer (Vue) to per-workspace SQLite (workspace-db).
 * All operations require a workspace path — resolved from current workspace.
 */

import { ipcMain, BrowserWindow } from 'electron'
import * as db from '../infrastructure/workspace-db'
import { getCurrentWorkspace } from '../infrastructure/workspace-registry'

function wsPath(): string {
  const ws = getCurrentWorkspace()
  if (!ws) throw new Error('No active workspace')
  return ws.path
}

export function registerPersistenceHandlers(window: BrowserWindow) {
  // ── Messages ──

  ipcMain.handle('messages:save', (_, message) => {
    db.saveMessage(wsPath(), {
      id: message.id,
      sessionId: message.sessionId,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp || message.createdAt,
      status: message.status,
      toolCalls: message.toolCalls,
      error: message.error,
      agentId: message.agentId,
      metadata: message.metadata,
    })
  })

  ipcMain.handle('messages:load', (_, { sessionId }) => {
    return db.loadMessages(wsPath(), sessionId)
  })

  ipcMain.handle('messages:clear', (_, { sessionId }) => {
    db.clearMessages(wsPath(), sessionId)
  })

  // ── Sessions ──

  ipcMain.handle('sessions:list', () => {
    return db.listSessions(wsPath())
  })

  ipcMain.handle('sessions:get', (_, { sessionId }) => {
    return db.getSession(wsPath(), sessionId)
  })

  ipcMain.handle('sessions:create', (_, { id, title, mode, participants }) => {
    return db.createSession(wsPath(), id, title, { mode, participants })
  })

  ipcMain.handle('sessions:delete', (_, { sessionId }) => {
    db.deleteSession(wsPath(), sessionId)
  })

  ipcMain.handle('sessions:rename', (_, { sessionId, title }) => {
    db.renameSession(wsPath(), sessionId, title)
  })

  ipcMain.handle('sessions:touch', (_, { sessionId, lastMessage }) => {
    db.touchSession(wsPath(), sessionId, lastMessage)
  })
}
