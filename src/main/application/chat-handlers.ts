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

const workspaceManager = new WorkspaceManager()

// Track which sessions have listeners attached
const attachedListeners = new Set<string>()

function ensureSessionListener(session: any, sessionId: string, mainWindow: BrowserWindow) {
  const key = `${sessionId}`
  if (attachedListeners.has(key)) return

  session.on('update', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('chat:update', {
        sessionId,
        messages: JSON.parse(JSON.stringify(session.messages))  // deep clone to avoid reactivity issues
      })
    }
  })
  attachedListeners.add(key)
}

export function registerChatHandlers(mainWindow: BrowserWindow, mcpManager: McpManager) {
  // 设置 MCP 管理器到 workspace manager
  workspaceManager.setMcpManager(mcpManager)
  
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
}
