import { ipcMain, app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import type { Config } from '../infrastructure/config'

export function registerSettingsHandlers() {
  ipcMain.handle('settings:load', async (_, { workspacePath }: { workspacePath?: string } = {}) => {
    try {
      // Try workspace-level first
      if (workspacePath) {
        const wsConfig = join(workspacePath, '.watson', 'config.json')
        console.log('[Settings] Loading from:', wsConfig, 'exists:', existsSync(wsConfig))
        if (existsSync(wsConfig)) return JSON.parse(readFileSync(wsConfig, 'utf8')) as Config
      }
      // Fall back to app-level
      const appConfig = join(app.getPath('userData'), 'config.json')
      console.log('[Settings] Loading from:', appConfig, 'exists:', existsSync(appConfig))
      if (existsSync(appConfig)) return JSON.parse(readFileSync(appConfig, 'utf8')) as Config
      return null
    } catch (err) {
      console.error('[Settings] Load failed:', err)
      return null
    }
  })

  ipcMain.handle('settings:save', async (_, { config, workspacePath }: { config: Config, workspacePath?: string }) => {
    try {
      const configPath = workspacePath
        ? join(workspacePath, '.watson', 'config.json')
        : join(app.getPath('userData'), 'config.json')
      const dir = dirname(configPath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
      return true
    } catch (err) {
      console.error('[Settings] Save failed:', err)
      return false
    }
  })
}
