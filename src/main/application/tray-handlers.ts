/**
 * Tray + Unread IPC Handlers
 *
 * MOMO-56: Manages tray badge and unread counts.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { TrayManager } from './tray-manager'
import { UnreadStore } from '../infrastructure/unread-store'

let trayManager: TrayManager | null = null
const unreadStore = new UnreadStore()

export { unreadStore }

export function registerTrayHandlers(manager: TrayManager) {
  trayManager = manager

  ipcMain.handle('tray:update-status', async (_event, status: string) => {
    trayManager?.updateStatus(status)
    return { success: true }
  })

  // ── MOMO-56: Unread count handlers ──

  ipcMain.handle('unread:get-all', async () => {
    return { success: true, counts: unreadStore.getAll() }
  })

  ipcMain.handle('unread:clear', async (_event, { sessionId }: { sessionId: string }) => {
    unreadStore.clear(sessionId)
    syncBadge()
    return { success: true }
  })

  ipcMain.handle('unread:get-total', async () => {
    return { success: true, total: unreadStore.getTotal() }
  })
}

/**
 * Increment unread count for a session and notify renderer.
 * Called from chat-handlers when an assistant message completes.
 */
export function incrementUnread(sessionId: string, mainWindow: BrowserWindow) {
  const newCount = unreadStore.increment(sessionId)
  syncBadge()

  // Notify renderer of the updated unread counts
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('unread:updated', {
      sessionId,
      count: newCount,
      total: unreadStore.getTotal(),
      counts: unreadStore.getAll(),
    })
  }
}

/**
 * Sync the tray/dock badge with current total.
 */
function syncBadge() {
  const total = unreadStore.getTotal()
  trayManager?.setBadgeCount(total)
}

/** Get tray manager instance (reserved for future use) */
function getTrayManager(): TrayManager | null {
  return trayManager
}
