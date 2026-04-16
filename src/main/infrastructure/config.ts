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

export interface ProviderConfig {
  name: string
  type: 'anthropic' | 'openai'
  apiKey: string
  baseUrl?: string
  models: string[]
}

export interface VoiceConfig {
  tts?: {
    provider: 'elevenlabs' | 'openai'
    apiKey?: string
    voice?: string
  }
  stt?: {
    mode: 'browser' | 'whisper'
  }
}

export interface Config {
  // New multi-provider format
  providers?: ProviderConfig[]
  selectedProvider?: string
  selectedModel?: string
  voice?: VoiceConfig
  
  // Global shortcut to toggle window (default: 'Control+Space')
  globalShortcut?: string
  
  // Legacy single-provider format (for backward compatibility)
  provider?: 'anthropic' | 'openai'
  apiKey?: string
  apiKeys?: string[]
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
      if (config.providers || config.apiKey || config.apiKeys) return normalizeConfig(config)
    } catch {}
  }

  // 2. Try app-level config
  try {
    const appConfigPath = join(app.getPath('userData'), 'config.json')
    if (existsSync(appConfigPath)) {
      const content = readFileSync(appConfigPath, 'utf8')
      const config = JSON.parse(content) as Config
      if (config.providers || config.apiKey || config.apiKeys) return normalizeConfig(config)
    }
  } catch {}

  // 3. Try environment variables
  if (process.env.ANTHROPIC_API_KEY) {
    return normalizeConfig({
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.WATSON_MODEL || 'claude-sonnet-4-20250514'
    })
  }

  if (process.env.OPENAI_API_KEY) {
    return normalizeConfig({
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.WATSON_MODEL || 'gpt-4'
    })
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
            const firstModel = providerConfig.models?.[0]
            const modelId = typeof firstModel === 'object' ? firstModel.id : firstModel
            return normalizeConfig({
              provider: isAnthropic ? 'anthropic' : 'openai',
              apiKey: providerConfig.apiKey,
              baseUrl: providerConfig.baseUrl,
              model: modelId || (isAnthropic ? 'claude-sonnet-4-20250514' : 'gpt-4')
            })
          }
        }
      }
    }
  } catch {}

  throw new Error(
    'No API key found. Create .watson/config.json or set ANTHROPIC_API_KEY environment variable.'
  )
}

/**
 * Normalize config to ensure backward compatibility.
 * - New format: providers array + selectedProvider/selectedModel
 * - Legacy format: single provider/apiKey/model
 * - Convert legacy to new format if needed
 */
function normalizeConfig(config: Config): Config {
  // If new format (providers array), ensure selected provider exists
  if (config.providers && config.providers.length > 0) {
    const selected = config.selectedProvider || config.providers[0].name
    const provider = config.providers.find(p => p.name === selected) || config.providers[0]
    return {
      ...config,
      selectedProvider: provider.name,
      selectedModel: config.selectedModel || provider.models[0],
      // Also set legacy fields for backward compatibility
      provider: provider.type,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      model: config.selectedModel || provider.models[0]
    }
  }
  
  // Legacy format: convert to new format
  if (config.apiKey || config.apiKeys) {
    const apiKey = config.apiKey || config.apiKeys?.[0] || ''
    const provider: ProviderConfig = {
      name: config.provider || 'default',
      type: config.provider || 'anthropic',
      apiKey,
      baseUrl: config.baseUrl,
      models: config.model ? [config.model] : ['claude-sonnet-4-20250514']
    }
    return {
      ...config,
      providers: [provider],
      selectedProvider: provider.name,
      selectedModel: provider.models[0],
      apiKey,
      apiKeys: config.apiKeys || [apiKey]
    }
  }
  
  return config
}
