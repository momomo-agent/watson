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
  },

  loadConfig: () => ipcRenderer.invoke('settings:load'),
  saveConfig: (config: any) => ipcRenderer.invoke('settings:save', config),
  
  // Scheduler APIs
  heartbeatStatus: () => ipcRenderer.invoke('scheduler:heartbeat:status'),
  heartbeatStart: () => ipcRenderer.invoke('scheduler:heartbeat:start'),
  heartbeatStop: () => ipcRenderer.invoke('scheduler:heartbeat:stop'),
  cronList: () => ipcRenderer.invoke('scheduler:cron:list'),
  cronAdd: (id: string, schedule: string) => ipcRenderer.invoke('scheduler:cron:add', id, schedule),
  cronRemove: (id: string) => ipcRenderer.invoke('scheduler:cron:remove', id)
})

// Alias for compatibility
contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: Function) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
  off: (channel: string, callback: Function) => {
    ipcRenderer.removeListener(channel, callback as any)
  }
})
