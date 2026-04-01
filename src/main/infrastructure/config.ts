import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface Config {
  provider: 'anthropic' | 'openai'
  apiKey: string
  baseUrl?: string
  model?: string
}

export function loadConfig(workspacePath: string): Config {
  const configPath = join(workspacePath, '.watson', 'config.json')
  
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, 'utf8')
    return JSON.parse(content)
  }
  
  // 默认配置
  return {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: 'claude-sonnet-4-20250514'
  }
}
