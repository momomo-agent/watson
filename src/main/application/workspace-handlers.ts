import { ipcMain, BrowserWindow } from 'electron'
import * as registry from '../infrastructure/workspace-registry'

export function registerWorkspaceHandlers(window: BrowserWindow) {
  ipcMain.handle('workspace:list', () => {
    return registry.listWorkspaces()
  })

  ipcMain.handle('workspace:current', () => {
    return registry.getCurrentWorkspace()
  })

  ipcMain.handle('workspace:create', (_, name: string, path: string) => {
    return registry.createWorkspace(name, path)
  })

  ipcMain.handle('workspace:switch', (_, id: string) => {
    return registry.switchWorkspace(id)
  })

  ipcMain.handle('workspace:delete', (_, id: string) => {
    registry.removeWorkspace(id)
  })

  ipcMain.handle('workspace:add', (_, path: string) => {
    return registry.addWorkspace(path)
  })

  ipcMain.handle('workspace:update-identity', (_, id: string, updates: any) => {
    return registry.updateIdentity(id, updates)
  })
}
