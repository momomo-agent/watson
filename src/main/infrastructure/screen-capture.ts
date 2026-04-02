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

interface UIElement {
  label?: string
  value?: string
  role?: string
  interactive?: boolean
}

/**
 * Capture current active window content
 */
export async function captureCurrentWindow(): Promise<ScreenContext> {
  try {
    const { stdout } = await execAsync('agent-control -p macos snapshot')
    const elements: UIElement[] = JSON.parse(stdout)
    
    // Extract window title and app name from menu bar items
    let windowTitle = ''
    let appName = ''
    
    for (const el of elements) {
      if (el.role === 'MenuBarItem' && el.label && el.label !== 'Apple') {
        appName = el.label
        break
      }
    }
    
    // Extract meaningful content from UI elements
    const contentParts: string[] = []
    for (const el of elements) {
      if (el.label && el.label.trim()) {
        contentParts.push(el.label)
      }
      if (el.value && el.value.trim()) {
        contentParts.push(el.value)
      }
    }
    
    return {
      windowTitle,
      appName,
      content: contentParts.join(' '),
      timestamp: Date.now()
    }
  } catch (error) {
    throw new Error(`Failed to capture screen: ${error}`)
  }
}
