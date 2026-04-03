import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import { join } from 'path'

export class TrayManager {
  private tray: Tray | null = null
  private statusText: string = 'Watson Ready'
  private mainWindow: BrowserWindow | null = null
  private badgeCount: number = 0

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
  }

  initialize() {
    // 创建简单的 tray 图标（临时方案，后续可以替换为实际图标）
    const icon = this.createTrayIcon()
    this.tray = new Tray(icon)
    this.tray.setToolTip('Watson')
    this.updateMenu()

    // 点击 tray 图标显示窗口
    this.tray.on('click', () => {
      this.showWindow()
    })
  }

  private createTrayIcon() {
    // 创建一个简单的 16x16 黑白图标
    // macOS 会自动适配明暗主题
    const size = 16
    const canvas = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" 
              font-family="Arial" font-size="12" fill="black">W</text>
      </svg>
    `
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(canvas).toString('base64')}`
    return nativeImage.createFromDataURL(dataUrl).resize({ width: size, height: size })
  }

  updateStatus(text: string) {
    this.statusText = text
    this.updateMenu()
  }

  /**
   * MOMO-56: Update the dock badge and tray title with unread count.
   */
  setBadgeCount(count: number) {
    this.badgeCount = count

    // macOS dock badge
    if (process.platform === 'darwin') {
      app.dock?.setBadge(count > 0 ? String(count) : '')
    }

    // Update tray tooltip with count
    if (this.tray) {
      const tooltip = count > 0 ? `Watson (${count} unread)` : 'Watson'
      this.tray.setToolTip(tooltip)
    }

    // Update tray title (macOS shows this next to tray icon)
    if (this.tray && process.platform === 'darwin') {
      this.tray.setTitle(count > 0 ? String(count) : '')
    }

    this.updateMenu()
  }

  private updateMenu() {
    if (!this.tray) return

    const statusLabel = this.badgeCount > 0
      ? `${this.statusText} (${this.badgeCount} unread)`
      : this.statusText

    const menu = Menu.buildFromTemplate([
      { 
        label: statusLabel, 
        enabled: false 
      },
      { type: 'separator' },
      { 
        label: 'Show Window', 
        click: () => this.showWindow() 
      },
      { 
        label: 'Hide Window', 
        click: () => this.hideWindow() 
      },
      { type: 'separator' },
      { 
        label: 'Quit Watson', 
        click: () => app.quit() 
      }
    ])

    this.tray.setContextMenu(menu)
  }

  private showWindow() {
    if (this.mainWindow) {
      this.mainWindow.show()
      this.mainWindow.focus()
    }
  }

  private hideWindow() {
    if (this.mainWindow) {
      this.mainWindow.hide()
    }
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}
