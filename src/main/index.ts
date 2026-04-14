import { app, BrowserWindow } from 'electron'

app.commandLine.appendSwitch('remote-debugging-port', '9229')

// 设置全局代理（走 ClashX）
try {
  const { setGlobalDispatcher, ProxyAgent } = require('undici')
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7890'
  setGlobalDispatcher(new ProxyAgent(proxy))
} catch {}
import { join } from 'path'
import { registerChatHandlers } from './application/chat-handlers'
import { registerWorkspaceHandlers } from './application/workspace-handlers'
import { registerPersistenceHandlers } from './application/persistence-handlers'
import { registerCodingAgentHandlers } from './application/coding-agent-handlers'
import { registerMemoryHandlers } from './application/memory-handlers'
import { registerSettingsHandlers } from './application/settings-handlers'
import { registerSchedulerHandlers, setSchedulers } from './application/scheduler-handlers'
import { registerTrayHandlers } from './application/tray-handlers'
import { registerFileWatcherHandlers, startFileWatcher, stopAllWatchers } from './application/file-watcher-handlers'
import { HeartbeatScheduler } from './application/heartbeat-scheduler'
import { CronScheduler } from './application/cron-scheduler'
import { TrayManager } from './application/tray-manager'
import { WorkspaceManager } from './domain/workspace-manager'
import { McpManager } from './infrastructure/mcp-manager'
import { ToolRunner } from './infrastructure/tool-runner'
import { loadConfig } from './infrastructure/config'
import { SkillManager } from './domain/skill-manager'
import { configureAgentic } from './infrastructure/claw-bridge'

let mainWindow: BrowserWindow | null = null
let trayManager: TrayManager | null = null
const workspaceManager = new WorkspaceManager()
const mcpManager = new McpManager()
let skillManager: SkillManager | null = null
let heartbeat: HeartbeatScheduler | null = null
let cron: CronScheduler | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // 初始化 Tray
  trayManager = new TrayManager(mainWindow)
  trayManager.initialize()

  // 窗口关闭时隐藏而不是退出（macOS 风格）
  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' && !app.isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
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
  registerChatHandlers(mainWindow, mcpManager)
  registerWorkspaceHandlers(mainWindow)
  registerPersistenceHandlers(mainWindow)
  registerCodingAgentHandlers(mainWindow)
  registerMemoryHandlers()
  registerSettingsHandlers()
  registerSchedulerHandlers()
  registerTrayHandlers(trayManager)
  registerFileWatcherHandlers(mainWindow)
  
  // 设置 MCP 管理器到 ToolRunner
  ToolRunner.setMcpManager(mcpManager)
  
  // 启动调度器和 MCP
  const currentWorkspace = workspaceManager.getCurrentWorkspace()
  
  // 初始化 SkillManager
  skillManager = new SkillManager(currentWorkspace)
  ToolRunner.setSkillManager(skillManager)
  if (currentWorkspace) {
    // Configure Agentic from workspace config
    try {
      configureAgentic(currentWorkspace)
    } catch (err) {
      console.warn('[Agentic] Config failed:', err)
    }

    // 加载配置并连接 MCP 服务器
    try {
      const config = loadConfig(currentWorkspace)
      if (config.mcpServers) {
        mcpManager.connectAll(config.mcpServers).catch(err => {
          console.error('[MCP] Connection failed:', err)
        })
      }
    } catch (err) {
      console.warn('[MCP] Config load failed:', err)
    }
    
    heartbeat = new HeartbeatScheduler(currentWorkspace)
    heartbeat.start()
    
    cron = new CronScheduler(currentWorkspace)
    cron.addJob('daily-cleanup', '0 2 * * *', () => {
      console.log('[Cron] Daily cleanup at 2:00 AM')
    })
    cron.start()
    
    setSchedulers(heartbeat, cron)
    
    // MOMO-55: Start file watcher for memory auto-sync
    startFileWatcher(currentWorkspace, mainWindow)
  }
}

app.whenReady().then(createWindow)

app.on('before-quit', () => {
  app.isQuitting = true
})

app.on('window-all-closed', () => {
  heartbeat?.stop()
  cron?.stop()
  stopAllWatchers() // MOMO-55: Clean up file watchers
  // macOS 上保持 app 运行（tray 模式）
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  } else if (mainWindow) {
    mainWindow.show()
  }
})

app.on('will-quit', () => {
  trayManager?.destroy()
})
