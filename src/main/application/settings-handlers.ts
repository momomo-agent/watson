import { ipcMain, app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import type { Config } from '../infrastructure/config'

/** Resolve config path: workspace .watson/config.json > userData config.json */
function resolveConfigPath(): string {
  // Check workspace-level first (same as loadConfig in config.ts)
  const cwd = process.cwd()
  const workspacePath = join(cwd, '.watson', 'config.json')
  if (existsSync(workspacePath)) return workspacePath

  // Fall back to app-level
  return join(app.getPath('userData'), 'config.json')
}

/** Resolve save path: always write to userData (safe default) */
function resolveSavePath(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function registerSettingsHandlers() {
  ipcMain.handle('settings:load', async () => {
    try {
      const configPath = resolveConfigPath()
      console.log('[Settings] Loading from:', configPath, 'exists:', existsSync(configPath))
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
      const configPath = resolveSavePath()
      console.log('[Settings] Saving to:', configPath)
      console.log('[Settings] Config:', JSON.stringify(config).slice(0, 200))
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
