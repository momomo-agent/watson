/**
 * Preload — IPC Bridge
 * 
 * Exposes a safe API from main process to renderer.
 * Uses contextBridge for security (contextIsolation: true).
 */

import { contextBridge, ipcRenderer } from 'electron'

// Track listeners so we can properly remove them
const listenerMap = new Map<string, Map<Function, Function>>()

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, data?: any) => ipcRenderer.invoke(channel, data),

  on: (channel: string, callback: Function) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args)

    // Store the mapping so off() can find the right listener
    if (!listenerMap.has(channel)) {
      listenerMap.set(channel, new Map())
    }
    listenerMap.get(channel)!.set(callback, subscription)

    ipcRenderer.on(channel, subscription)

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(channel, subscription)
      listenerMap.get(channel)?.delete(callback)
    }
  },

  off: (channel: string, callback: Function) => {
    const channelListeners = listenerMap.get(channel)
    if (channelListeners) {
      const subscription = channelListeners.get(callback)
      if (subscription) {
        ipcRenderer.removeListener(channel, subscription as any)
        channelListeners.delete(callback)
      }
    }
  }
})
