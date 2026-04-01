export interface IElectronAPI {
  invoke: (channel: string, data?: any) => Promise<any>
  on: (channel: string, callback: Function) => () => void
  off: (channel: string, callback: Function) => void
}

declare global {
  interface Window {
    api: IElectronAPI
  }
}
