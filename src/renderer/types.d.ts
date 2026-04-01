export interface IElectronAPI {
  invoke: (channel: string, data?: any) => Promise<any>
  on: (channel: string, callback: (...args: any[]) => void) => () => void
  off: (channel: string, callback: (...args: any[]) => void) => void
}

declare global {
  interface Window {
    api: IElectronAPI
  }
}
