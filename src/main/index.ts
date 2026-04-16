import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron'

app.commandLine.appendSwitch('remote-debugging-port', '9223')

// 设置全局代理（走 ClashX）
try {
  const { setGlobalDispatcher, ProxyAgent } = require('undici')
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7890'
  setGlobalDispatcher(new ProxyAgent(proxy))
} catch {}
import { join } from 'path'
import { registerChatHandlers, getWorkspaceManager } from './application/chat-handlers'
import { registerWorkspaceHandlers } from './application/workspace-handlers'
import { registerPersistenceHandlers } from './application/persistence-handlers'
import { registerCodingAgentHandlers } from './application/coding-agent-handlers'
import { registerMemoryHandlers } from './application/memory-handlers'
import { registerSettingsHandlers } from './application/settings-handlers'
import { registerSchedulerHandlers, setSchedulers } from './application/scheduler-handlers'
import { registerTrayHandlers } from './application/tray-handlers'
import { registerFileWatcherHandlers, startFileWatcher, stopAllWatchers } from './application/file-watcher-handlers'
import { registerProactiveHandlers, registerToolRegistryHandlers } from './application/proactive-handlers'
import { HeartbeatScheduler } from './application/heartbeat-scheduler'
import { CronScheduler } from './application/cron-scheduler'
import { TrayManager } from './application/tray-manager'
import { McpManager } from './infrastructure/mcp-manager'
import { ToolRunner } from './infrastructure/tool-runner'
import { loadConfig } from './infrastructure/config'
import { SkillManager } from './domain/skill-manager'
import { configureAgentic } from './infrastructure/claw-bridge'
import { initRegistry, getCurrentWorkspace } from './infrastructure/workspace-registry'
import { closeAll as closeAllDbs } from './infrastructure/workspace-db'
import { closeDb as closeMemoryDb } from './infrastructure/memory-index'
import { sessionBus } from './infrastructure/session-bus'
import { SenseLoop } from './domain/sense-loop'
import { ProactiveEngine } from './domain/proactive-engine'

let mainWindow: BrowserWindow | null = null
let trayManager: TrayManager | null = null
const mcpManager = new McpManager()
let skillManager: SkillManager | null = null
let heartbeat: HeartbeatScheduler | null = null
let cron: CronScheduler | null = null
let senseLoop: SenseLoop | null = null
let proactiveEngine: ProactiveEngine | null = null

function createWindow() {
  // Initialize workspace registry
  initRegistry()

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

  trayManager = new TrayManager(mainWindow)
  trayManager.initialize()

  // Bind session bus to window for event push + visibility tracking
  sessionBus.bindWindow(mainWindow)

  // Global shortcut: configurable, default Control+Space
  const shortcutKey = (() => {
    try {
      const appConfigPath = join(app.getPath('userData'), 'config.json')
      if (require('fs').existsSync(appConfigPath)) {
        const cfg = JSON.parse(require('fs').readFileSync(appConfigPath, 'utf8'))
        if (cfg.globalShortcut) return cfg.globalShortcut
      }
    } catch {}
    return 'Control+Space'
  })()
  try {
    globalShortcut.register(shortcutKey, () => {
      if (mainWindow?.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide()
      } else {
        mainWindow?.show()
        mainWindow?.focus()
        mainWindow?.webContents.send('focus-input')
      }
    })
  } catch (err) {
    console.warn(`Failed to register global shortcut '${shortcutKey}':`, err)
  }

  // macOS: hide on close instead of quit
  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' && !(app as any).isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    if (process.env.WATSON_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools()
    }
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  
  // Register IPC handlers
  registerChatHandlers(mainWindow, mcpManager, trayManager)
  registerWorkspaceHandlers(mainWindow)
  registerPersistenceHandlers(mainWindow)
  registerCodingAgentHandlers(mainWindow)
  registerMemoryHandlers()
  registerSettingsHandlers()
  registerSchedulerHandlers()
  registerTrayHandlers(trayManager)
  registerFileWatcherHandlers(mainWindow)
  
  ToolRunner.setMcpManager(mcpManager)

  // Session bus: renderer reconnect + replay
  ipcMain.handle('session-bus:replay', (_event, { sinceSeq, sessionId }) => {
    return sessionBus.getEventsSince(sinceSeq || 0, sessionId)
  })
  ipcMain.handle('session-bus:seq', () => sessionBus.getSeq())
  
  // Boot current workspace
  const current = getCurrentWorkspace()
  const wsPath = current?.path
  
  if (wsPath) {
    skillManager = new SkillManager(wsPath)
    ToolRunner.setSkillManager(skillManager)

    try { configureAgentic(wsPath) } catch (err) {
      console.warn('[Agentic] Config failed:', err)
    }

    try {
      const config = loadConfig(wsPath)
      if (config.mcpServers) {
        mcpManager.connectAll(config.mcpServers).catch(err => {
          console.error('[MCP] Connection failed:', err)
        })
      }
    } catch (err) {
      console.warn('[MCP] Config load failed:', err)
    }
    
    heartbeat = new HeartbeatScheduler(wsPath)
    heartbeat.start()
    
    cron = new CronScheduler(wsPath)
    cron.addJob('daily-cleanup', '0 2 * * *', () => {
      console.log('[Cron] Daily cleanup at 2:00 AM')
    })
    cron.start()
    
    setSchedulers(heartbeat, cron)
    startFileWatcher(wsPath, mainWindow)

    // ── SenseLoop: ambient perception ──
    try {
      // @ts-ignore — JS module without type declarations
      const { ai } = require('agentic')
      senseLoop = new SenseLoop()
      senseLoop.setAgentic(ai)

      // Push context updates to all active ChatSessions
      senseLoop.on('context', (ctx) => {
        const wm = getWorkspaceManager()
        for (const workspace of wm.list()) {
          for (const session of workspace.sessions.values()) {
            session.setSenseContext(ctx)
          }
        }
      })

      senseLoop.on('error', (err) => {
        console.warn('[SenseLoop] tick error:', err?.message || err)
      })

      senseLoop.start()
      console.log('[SenseLoop] started (5s interval)')

      // ── ProactiveEngine: ambient intelligence ──
      proactiveEngine = new ProactiveEngine()
      registerProactiveHandlers(proactiveEngine)
      registerToolRegistryHandlers(mcpManager)

      // Feed sense updates to proactive engine
      senseLoop.on('context', (ctx) => {
        proactiveEngine?.onSenseUpdate(ctx)
      })

      // Feed heartbeat ticks to proactive engine
      heartbeat?.on('tick', () => {
        proactiveEngine?.onHeartbeatTick()
      })

      // When proactive engine fires, push to renderer
      proactiveEngine.on('signal', (signal) => {
        console.log(`[Proactive] Signal: ${signal.type} — ${signal.reason}`)
        sessionBus.emit('__proactive__', 'proactive:signal', signal)
      })

      // Reset proactive engine on user messages
      sessionBus.subscribe('*', (event) => {
        if (event.type === 'user:message') {
          proactiveEngine?.onUserMessage()
        }
      })

      console.log('[ProactiveEngine] started')
    } catch (err) {
      console.warn('[SenseLoop] Failed to start:', err)
    }
  }

  // ── Sense IPC handlers ──
  ipcMain.handle('sense:status', () => {
    if (!senseLoop) return { running: false, context: null }
    return {
      running: senseLoop.isRunning(),
      context: senseLoop.getContext(),
    }
  })

  ipcMain.handle('sense:toggle', () => {
    if (!senseLoop) return { running: false }
    if (senseLoop.isRunning()) {
      senseLoop.stop()
    } else {
      senseLoop.start()
    }
    return { running: senseLoop.isRunning() }
  })
}

app.whenReady().then(createWindow)

app.on('before-quit', () => {
  ;(app as any).isQuitting = true
})

app.on('window-all-closed', () => {
  heartbeat?.stop()
  cron?.stop()
  senseLoop?.stop()
  stopAllWatchers()
  closeAllDbs()
  closeMemoryDb()
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
  globalShortcut.unregisterAll()
  trayManager?.destroy()
})
