import { ipcMain, BrowserWindow } from 'electron'
import { WorkspaceManager } from '../domain/workspace-manager'

const workspaceManager = new WorkspaceManager()

export function registerWorkspaceHandlers(window: BrowserWindow) {
  ipcMain.handle('workspace:list', () => {
    return workspaceManager.listWorkspaces()
  })

  ipcMain.handle('workspace:current', () => {
    return workspaceManager.getCurrentWorkspace()
  })

  ipcMain.handle('workspace:create', (_, name: string, path: string) => {
    return workspaceManager.createWorkspace(name, path)
  })

  ipcMain.handle('workspace:switch', (_, id: string) => {
    workspaceManager.switchWorkspace(id)
    return workspaceManager.getCurrentWorkspace()
  })

  ipcMain.handle('workspace:delete', (_, id: string) => {
    workspaceManager.deleteWorkspace(id)
  })
}
