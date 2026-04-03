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
  heartbeatStatus: () => Promise<{ running: boolean }>
  heartbeatStart: () => Promise<void>
  heartbeatStop: () => Promise<void>
  cronList: () => Promise<Array<{ id: string, schedule: string }>>
  cronAdd: (id: string, schedule: string) => Promise<void>
  cronRemove: (id: string) => Promise<void>
}

declare global {
  interface Window {
    api: IElectronAPI
    electron: IElectronAPI
  }
}
