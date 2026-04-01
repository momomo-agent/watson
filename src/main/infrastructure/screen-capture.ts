/**
 * Screen awareness tool - captures current window content
 * Uses agent-control for macOS screen capture
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface ScreenContext {
  windowTitle: string
  appName: string
  content: string
  timestamp: number
}

/**
 * Capture current active window content
 */
export async function captureCurrentWindow(): Promise<ScreenContext> {
  try {
    const { stdout } = await execAsync('agent-control -p macos --action screen_sense')
    const data = JSON.parse(stdout)
    
    return {
      windowTitle: data.windowTitle || '',
      appName: data.appName || '',
      content: data.content || '',
      timestamp: Date.now()
    }
  } catch (error) {
    throw new Error(`Failed to capture screen: ${error}`)
  }
}
