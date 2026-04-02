export interface Config {
  provider: 'anthropic' | 'openai'
  apiKey: string
  baseUrl?: string
  model?: string
  mcpServers?: Record<string, {
    command: string
    args?: string[]
    env?: Record<string, string>
    disabled?: boolean
  }>
}

export interface IElectronAPI {
  invoke: (channel: string, data?: any) => Promise<any>
  on: (channel: string, callback: (...args: any[]) => void) => () => void
  off: (channel: string, callback: (...args: any[]) => void) => void
  loadConfig: () => Promise<Config | null>
  saveConfig: (config: Config) => Promise<boolean>
}

declare global {
  interface Window {
    api: IElectronAPI
    electron: IElectronAPI
  }
}
