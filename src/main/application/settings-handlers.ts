import { ipcMain, app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import type { Config } from '../infrastructure/config'

export function registerSettingsHandlers() {
  ipcMain.handle('settings:load', async () => {
    try {
      const configPath = join(app.getPath('userData'), 'config.json')
      if (existsSync(configPath)) {
        const content = readFileSync(configPath, 'utf8')
        return JSON.parse(content) as Config
      }
      return null
    } catch (err) {
      console.error('[Settings] Load failed:', err)
      return null
    }
  })

  ipcMain.handle('settings:save', async (_, config: Config) => {
    try {
      const configPath = join(app.getPath('userData'), 'config.json')
      const dir = dirname(configPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
      return true
    } catch (err) {
      console.error('[Settings] Save failed:', err)
      return false
    }
  })
}
