/**
 * Screen awareness tool - captures current window content
 * Uses agent-control for macOS screen capture
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const MAX_BUFFER = 50 * 1024 * 1024 // 50MB for large JSON output

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
    const { stdout } = await execAsync('agent-control -p macos snapshot', { maxBuffer: MAX_BUFFER })
    
    let elements: UIElement[]
    try {
      elements = JSON.parse(stdout)
    } catch (parseError) {
      throw new Error(`Failed to parse snapshot JSON (output size: ${stdout.length} chars): ${parseError}`)
    }
    
    // Filter out off-screen elements (y >= 1440)
    elements = elements.filter((el: any) => !el.frame || el.frame.y < 1440)
    
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
