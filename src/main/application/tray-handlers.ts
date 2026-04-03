import { ipcMain } from 'electron'
import { TrayManager } from './tray-manager'

let trayManager: TrayManager | null = null

export function registerTrayHandlers(manager: TrayManager) {
  trayManager = manager

  ipcMain.handle('tray:update-status', async (_event, status: string) => {
    trayManager?.updateStatus(status)
    return { success: true }
  })
}

export function getTrayManager(): TrayManager | null {
  return trayManager
}
