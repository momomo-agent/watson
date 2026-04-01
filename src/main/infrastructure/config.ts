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
  
  let config: Config = {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: 'claude-sonnet-4-20250514'
  }
  
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, 'utf8')
    const fileConfig = JSON.parse(content)
    config = { ...config, ...fileConfig }
    
    // 如果文件中 apiKey 为空，使用环境变量
    if (!config.apiKey) {
      config.apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || ''
    }
  }
  
  return config
}
