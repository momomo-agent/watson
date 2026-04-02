import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerChatHandlers } from './application/chat-handlers'
import { registerWorkspaceHandlers } from './application/workspace-handlers'
import { registerPersistenceHandlers } from './application/persistence-handlers'
import { HeartbeatScheduler } from './domain/heartbeat-scheduler'
import { CronScheduler } from './domain/cron-scheduler'

let mainWindow: BrowserWindow | null = null
const heartbeat = new HeartbeatScheduler()
const cron = new CronScheduler()

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
  
  // 启动调度器
  heartbeat.onHeartbeat(() => {
    console.log('[Heartbeat]', new Date().toISOString())
  })
  heartbeat.start(60000) // 每分钟
  
  // 示例 cron 任务：每天 9:00
  cron.schedule('0 9 * * *', () => {
    console.log('[Cron] Daily task at 9:00')
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  heartbeat.stop()
  cron.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
