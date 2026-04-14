/**
 * Backend Adapter — Abstraction layer between UI and backend
 *
 * The UI never touches IPC/Electron/HTTP directly.
 * All communication goes through this adapter.
 *
 * Two implementations:
 *   - ElectronAdapter: uses window.api (IPC via preload)
 *   - HttpAdapter: uses fetch + EventSource (future web version)
 *
 * Usage:
 *   import { backend } from './backend'
 *   const result = await backend.invoke('chat:send', { sessionId, text })
 *   const cleanup = backend.on('chat:update', handler)
 */

export interface BackendAdapter {
  /** Request-response call to backend */
  invoke(channel: string, data?: any): Promise<any>

  /** Subscribe to push events from backend. Returns cleanup function. */
  on(channel: string, callback: (...args: any[]) => void): () => void

  /** Unsubscribe (optional — prefer using the cleanup function from on()) */
  off?(channel: string, callback: (...args: any[]) => void): void
}

// ── Electron Adapter (IPC via preload) ──

class ElectronAdapter implements BackendAdapter {
  invoke(channel: string, data?: any): Promise<any> {
    return (window as any).api.invoke(channel, data)
  }

  on(channel: string, callback: (...args: any[]) => void): () => void {
    return (window as any).api.on(channel, callback)
  }

  off(channel: string, callback: (...args: any[]) => void): void {
    (window as any).api.off?.(channel, callback)
  }
}

// ── HTTP Adapter (future — pure fetch + SSE) ──

class HttpAdapter implements BackendAdapter {
  private baseUrl: string
  private eventSources = new Map<string, EventSource>()

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async invoke(channel: string, data?: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/${channel.replace(/:/g, '/')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
    })
    if (!res.ok) throw new Error(`Backend error: ${res.status}`)
    return res.json()
  }

  on(channel: string, callback: (...args: any[]) => void): () => void {
    const url = `${this.baseUrl}/events/${channel.replace(/:/g, '/')}`
    const es = new EventSource(url)
    es.onmessage = (e) => {
      try { callback(JSON.parse(e.data)) } catch {}
    }
    this.eventSources.set(channel, es)
    return () => {
      es.close()
      this.eventSources.delete(channel)
    }
  }
}

// ── Singleton ──

function createAdapter(): BackendAdapter {
  // Detect environment: Electron has window.api from preload
  if (typeof window !== 'undefined' && (window as any).api?.invoke) {
    return new ElectronAdapter()
  }

  // Web mode: look for backend URL in meta tag or env
  const meta = document.querySelector('meta[name="watson-backend"]')
  const baseUrl = meta?.getAttribute('content') || '//'
  return new HttpAdapter(baseUrl)
}

export const backend: BackendAdapter = createAdapter()
