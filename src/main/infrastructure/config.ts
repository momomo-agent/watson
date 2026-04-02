/**
 * Config — Infrastructure Layer
 * 
 * Loads LLM provider configuration.
 * Priority: .watson/config.json > environment variables > openclaw config
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
}

export interface Config {
  provider: 'anthropic' | 'openai'
  apiKey: string
  baseUrl?: string
  model?: string
  mcpServers?: Record<string, McpServerConfig>
}

export function loadConfig(workspacePath: string): Config {
  // 1. Try workspace-level config
  const workspaceConfigPath = join(workspacePath, '.watson', 'config.json')
  if (existsSync(workspaceConfigPath)) {
    try {
      const content = readFileSync(workspaceConfigPath, 'utf8')
      const config = JSON.parse(content) as Config
      if (config.apiKey) return config
    } catch {}
  }

  // 2. Try app-level config (~/Library/Application Support/watson/)
  try {
    const appConfigPath = join(app.getPath('userData'), 'config.json')
    if (existsSync(appConfigPath)) {
      const content = readFileSync(appConfigPath, 'utf8')
      const config = JSON.parse(content) as Config
      if (config.apiKey) return config
    }
  } catch {}

  // 3. Try environment variables
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.WATSON_MODEL || 'claude-sonnet-4-20250514'
    }
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.WATSON_MODEL || 'gpt-4'
    }
  }

  // 4. Try openclaw config as last resort
  try {
    const openclawConfigPath = join(process.env.HOME || '', '.openclaw', 'openclaw.json')
    if (existsSync(openclawConfigPath)) {
      const content = readFileSync(openclawConfigPath, 'utf8')
      const openclawConfig = JSON.parse(content)
      const providers = openclawConfig?.providers
      if (providers) {
        // Find first provider with an API key
        for (const [name, providerConfig] of Object.entries(providers) as any) {
          if (providerConfig.apiKey) {
            const api = providerConfig.api || ''
            const isAnthropic = api.includes('anthropic') || name.includes('anthropic')
            return {
              provider: isAnthropic ? 'anthropic' : 'openai',
              apiKey: providerConfig.apiKey,
              baseUrl: providerConfig.baseUrl,
              model: providerConfig.models?.[0] || (isAnthropic ? 'claude-sonnet-4-20250514' : 'gpt-4')
            }
          }
        }
      }
    }
  } catch {}

  throw new Error(
    'No API key found. Create .watson/config.json or set ANTHROPIC_API_KEY environment variable.'
  )
}
