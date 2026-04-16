/**
 * Proactive + ToolRegistry IPC handlers
 */

import { ipcMain } from 'electron'
import type { ProactiveEngine, ProactiveConfig } from '../domain/proactive-engine'
import { getToolRegistry, warmupTools } from '../infrastructure/claw-bridge'
import type { McpManager } from '../infrastructure/mcp-manager'

export function registerProactiveHandlers(engine: ProactiveEngine): void {
  ipcMain.handle('proactive:get-config', () => {
    return engine.getConfig()
  })

  ipcMain.handle('proactive:set-config', (_e, patch: Partial<ProactiveConfig>) => {
    engine.updateConfig(patch)
    return engine.getConfig()
  })
}

export function registerToolRegistryHandlers(mcpManager: McpManager | null): void {
  ipcMain.handle('tools:stats', (_e, { workspacePath }: { workspacePath: string }) => {
    const registry = getToolRegistry(workspacePath, mcpManager)
    return registry.getStats()
  })

  ipcMain.handle('tools:search', (_e, { workspacePath, query, maxResults }: { workspacePath: string; query: string; maxResults?: number }) => {
    const registry = getToolRegistry(workspacePath, mcpManager)
    const result = registry.search(query, maxResults)
    return {
      matches: result.matches.map(t => ({ name: t.name, description: t.description })),
      query: result.query,
      totalDeferred: result.totalDeferred,
    }
  })

  ipcMain.handle('tools:warmup', async (_e, { workspacePath, firstMessage }: { workspacePath: string; firstMessage?: string }) => {
    const loaded = await warmupTools(workspacePath, mcpManager, { firstMessage })
    return { loaded }
  })
}
