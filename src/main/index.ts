import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerChatHandlers } from './application/chat-handlers'
import { registerWorkspaceHandlers } from './application/workspace-handlers'
import { registerPersistenceHandlers } from './application/persistence-handlers'
import { registerCodingAgentHandlers } from './application/coding-agent-handlers'
import { HeartbeatScheduler } from './application/heartbeat-scheduler'
import { CronScheduler } from './application/cron-scheduler'
import { WorkspaceManager } from './domain/workspace-manager'

let mainWindow: BrowserWindow | null = null
const workspaceManager = new WorkspaceManager()
let heartbeat: HeartbeatScheduler | null = null
let cron: CronScheduler | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    // DevTools 只在 WATSON_DEVTOOLS=1 时打开
    if (process.env.WATSON_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools()
    }
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  
  // 注册 IPC handlers
  registerChatHandlers(mainWindow)
  registerWorkspaceHandlers(mainWindow)
  registerPersistenceHandlers(mainWindow)
  registerCodingAgentHandlers(mainWindow)
  
  // 启动调度器
  const currentWorkspace = workspaceManager.getCurrentWorkspace()
  if (currentWorkspace) {
    heartbeat = new HeartbeatScheduler(currentWorkspace)
    heartbeat.start()
    
    cron = new CronScheduler(currentWorkspace)
    cron.addJob('daily-cleanup', '0 2 * * *', () => {
      console.log('[Cron] Daily cleanup at 2:00 AM')
    })
    cron.start()
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  heartbeat?.stop()
  cron?.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
