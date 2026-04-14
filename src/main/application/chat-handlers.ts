/**
 * Chat IPC Handlers — Application Layer bridge
 * 
 * Connects renderer (Vue) to domain (ChatSession) via Electron IPC.
 * Manages listener lifecycle to prevent leaks.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { WorkspaceManager } from '../application/workspace-manager'
import { captureCurrentWindow } from '../infrastructure/screen-capture'
import { McpManager } from '../infrastructure/mcp-manager'
import { BUILTIN_TOOLS } from '../infrastructure/tools'
import { incrementUnread } from './tray-handlers'

const workspaceManager = new WorkspaceManager()

// Track which sessions have listeners attached
const attachedListeners = new Set<string>()

// MOMO-56: Track the currently active session in the renderer
let activeSessionId: string | null = null

/**
 * MOMO-52: Handle message routing to coding agent.
 * Creates user message, streams coding agent response, and updates UI.
 */
async function handleCodingAgentMessage(
  workspace: any,
  session: any,
  sessionId: string,
  text: string,
  agent: any,
  mainWindow: BrowserWindow
) {
  // Create user message
  const userMsg = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    role: 'user',
    content: text,
    timestamp: Date.now(),
    status: 'complete',
  }
  session.messages.push(userMsg)
  session.emit('persist', userMsg)
  session.emit('update')

  // Create assistant message placeholder
  const assistantMsg = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    status: 'streaming',
    agentId: agent.id,
  }
  session.messages.push(assistantMsg)
  session.emit('persist', assistantMsg)
  session.emit('update')

  // Create abort controller
  const controller = new AbortController()
  session.activeRequests?.set(assistantMsg.id, controller)

  try {
    // Route to coding agent with streaming
    const result = await workspace.routeToCodingAgent(agent, text, {
      sessionId,
      signal: controller.signal,
      onToken: (token: string) => {
        assistantMsg.content += token
        session.emit('persist', assistantMsg)
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('chat:update', {
            sessionId,
            messages: JSON.parse(JSON.stringify(session.messages)),
            statusText: '正在回复...',
          })
        }
      }
    })

    // Mark as complete
    assistantMsg.status = 'complete'
    session.emit('persist', assistantMsg)
    session.emit('update')

    return { success: true }
  } catch (error: any) {
    assistantMsg.status = 'error'
    assistantMsg.error = error.message
    session.emit('persist', assistantMsg)
    session.emit('update')
    return { success: false, error: error.message }
  } finally {
    session.activeRequests?.delete(assistantMsg.id)
  }
}

function ensureSessionListener(session: any, sessionId: string, mainWindow: BrowserWindow) {
  const key = `${sessionId}`
  if (attachedListeners.has(key)) return

  // MOMO-56: Track which message IDs we've already counted as unread.
  // Pre-populate with existing completed assistant messages so they're not re-counted.
  const countedMessageIds = new Set<string>()
  if (session.messages) {
    for (const msg of session.messages) {
      if (msg.role === 'assistant' && msg.status === 'complete') {
        countedMessageIds.add(msg.id)
      }
    }
  }

  session.on('update', (event?: any) => {
    if (!mainWindow.isDestroyed()) {
      const messages = session.messages || []

      // MOMO-56: Detect newly completed assistant messages → increment unread
      if (sessionId !== activeSessionId) {
        for (const msg of messages) {
          if (
            msg.role === 'assistant' &&
            msg.status === 'complete' &&
            !countedMessageIds.has(msg.id)
          ) {
            countedMessageIds.add(msg.id)
            incrementUnread(sessionId, mainWindow)
          }
        }
      } else {
        for (const msg of messages) {
          if (msg.role === 'assistant' && msg.status === 'complete') {
            countedMessageIds.add(msg.id)
          }
        }
      }

      mainWindow.webContents.send('chat:update', {
        sessionId,
        messages: JSON.parse(JSON.stringify(messages)),
        statusText: event?.statusText || null,
      })
    }
  })
  attachedListeners.add(key)
}

export function registerChatHandlers(mainWindow: BrowserWindow, mcpManager: McpManager) {
  // 设置 MCP 管理器到 workspace manager
  workspaceManager.setMcpManager(mcpManager)

  // MOMO-56: Track which session the renderer is currently viewing
  ipcMain.handle('session:set-active', async (_event, { sessionId }: { sessionId: string | null }) => {
    activeSessionId = sessionId
    return { success: true }
  })
  
  ipcMain.handle('chat:send', async (_event, { sessionId, text, workspacePath, agentId }) => {
    try {
      const workspace = workspaceManager.getOrCreate(workspacePath || process.cwd())
      const session = workspace.getOrCreateSession(sessionId)
      const agentManager = workspace.getAgentManager()

      // MOMO-50: Parse @mention from text
      let finalAgentId = agentId
      const mentionedAgentId = agentManager.parseAgentMention(text)
      if (mentionedAgentId) {
        finalAgentId = mentionedAgentId
        text = agentManager.stripAgentMention(text)
      }

      // If no agent specified, use default
      if (!finalAgentId) {
        finalAgentId = agentManager.getDefaultAgent().id
      }

      // MOMO-52: Check if this is a coding agent
      const agent = agentManager.getAgent(finalAgentId)
      if (agent?.type === 'coding-agent') {
        // MOMO-56: Attach listener for unread tracking
        ensureSessionListener(session, sessionId, mainWindow)
        // Route to coding agent
        return await handleCodingAgentMessage(workspace, session, sessionId, text, agent, mainWindow)
      }

      // Attach listener once per session
      ensureSessionListener(session, sessionId, mainWindow)

      await session.sendMessage(text, finalAgentId)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('chat:load', async (_event, { sessionId, workspacePath }) => {
    try {
      const workspace = workspaceManager.getOrCreate(workspacePath || process.cwd())
      const session = workspace.getOrCreateSession(sessionId)
      
      // Attach listener once per session
      ensureSessionListener(session, sessionId, mainWindow)
      
      // Return loaded messages
      return { success: true, messages: session.messages }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('chat:cancel', async (_event, { sessionId, messageId, workspacePath }) => {
    try {
      const workspace = workspaceManager.getOrCreate(workspacePath || process.cwd())
      const session = workspace.sessions.get(sessionId)
      if (session) {
        session.cancel(messageId)
        return { success: true }
      }
      return { success: false, error: 'Session not found' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('chat:retry', async (_event, { sessionId, messageId, workspacePath }) => {
    try {
      const workspace = workspaceManager.getOrCreate(workspacePath || process.cwd())
      const session = workspace.sessions.get(sessionId)
      if (session) {
        ensureSessionListener(session, sessionId, mainWindow)
        await session.retry(messageId)
        return { success: true }
      }
      return { success: false, error: 'Session not found' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('screen:capture', async () => {
    try {
      const context = await captureCurrentWindow()
      return { success: true, data: context }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // MOMO-50: Agent management handlers
  ipcMain.handle('agent:list', async (_event, { workspacePath }) => {
    try {
      const workspace = workspaceManager.getOrCreate(workspacePath || process.cwd())
      const agentManager = workspace.getAgentManager()
      return { success: true, agents: agentManager.listAgents() }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('agent:get', async (_event, { workspacePath, agentId }) => {
    try {
      const workspace = workspaceManager.getOrCreate(workspacePath || process.cwd())
      const agentManager = workspace.getAgentManager()
      const agent = agentManager.getAgent(agentId)
      if (!agent) {
        return { success: false, error: 'Agent not found' }
      }
      return { success: true, agent }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('agent:add', async (_event, { workspacePath, agent }) => {
    try {
      const workspace = workspaceManager.getOrCreate(workspacePath || process.cwd())
      const agentManager = workspace.getAgentManager()
      agentManager.addAgent(agent)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('agent:update', async (_event, { workspacePath, agentId, updates }) => {
    try {
      const workspace = workspaceManager.getOrCreate(workspacePath || process.cwd())
      const agentManager = workspace.getAgentManager()
      agentManager.updateAgent(agentId, updates)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('agent:remove', async (_event, { workspacePath, agentId }) => {
    try {
      const workspace = workspaceManager.getOrCreate(workspacePath || process.cwd())
      const agentManager = workspace.getAgentManager()
      agentManager.removeAgent(agentId)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('agent:setDefault', async (_event, { workspacePath, agentId }) => {
    try {
      const workspace = workspaceManager.getOrCreate(workspacePath || process.cwd())
      const agentManager = workspace.getAgentManager()
      agentManager.setDefaultAgent(agentId)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // MOMO-52: Coding agent management handlers
  ipcMain.handle('coding-agent:list', async () => {
    try {
      const codingAgentManager = workspaceManager.getCodingAgentManager()
      return { success: true, agents: codingAgentManager.listAvailable() }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('coding-agent:init', async (_event, { configs }) => {
    try {
      const codingAgentManager = workspaceManager.getCodingAgentManager()
      codingAgentManager.init(configs)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}
