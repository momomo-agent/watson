/**
 * Persistence IPC Handlers
 *
 * Bridges renderer (Vue) to SQLite stores (SessionStore, MessageStore)
 * for full session + message persistence.
 *
 * MOMO-51: Complete persistence — sessions and messages survive restart.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { MessageStore } from '../infrastructure/message-store'
import { SessionStore } from '../infrastructure/session-store'

const messageStore = new MessageStore()
const sessionStore = new SessionStore()

export { messageStore, sessionStore }

export function registerPersistenceHandlers(window: BrowserWindow) {
  // ── Message persistence ──

  ipcMain.handle('messages:save', (_, message) => {
    messageStore.save(message)
  })

  ipcMain.handle('messages:load', (_, { sessionId, workspaceId }) => {
    return messageStore.load(sessionId, workspaceId)
  })

  ipcMain.handle('messages:clear', (_, { sessionId, workspaceId }) => {
    messageStore.clear(sessionId, workspaceId)
  })

  // ── Session persistence ──

  ipcMain.handle('sessions:list', (_) => {
    return sessionStore.listSessions()
  })

  ipcMain.handle('sessions:get', (_, { sessionId }) => {
    return sessionStore.getSession(sessionId)
  })

  ipcMain.handle('sessions:create', (_, { id, title, mode, participants }) => {
    return sessionStore.createSession(id, title, { mode, participants })
  })

  ipcMain.handle('sessions:update', (_, { sessionId, updates }) => {
    sessionStore.updateSession(sessionId, updates)
  })

  ipcMain.handle('sessions:delete', (_, { sessionId }) => {
    // Delete session and its messages
    sessionStore.deleteSession(sessionId)
    // Also clear messages (use a broad workspace match — messages store uses workspace_id)
    // We iterate known workspace IDs from the messages table
    const sessionIds = messageStore.listSessionIds()
    // Actually, just delete all messages with this session_id directly
    messageStore.clearBySessionId(sessionId)
  })

  ipcMain.handle('sessions:rename', (_, { sessionId, title }) => {
    sessionStore.updateSession(sessionId, { title })
  })

  ipcMain.handle('sessions:touch', (_, { sessionId }) => {
    sessionStore.touchSession(sessionId)
  })
}
