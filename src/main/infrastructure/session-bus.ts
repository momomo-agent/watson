/**
 * SessionBus — Main Process Event Bus
 *
 * Decouples data flow from UI lifecycle.
 * All chat events go through the bus. Renderer subscribes when visible,
 * replays missed events when reconnecting.
 *
 * This is the key to "close window, data keeps running":
 * - LLM streaming continues in main process
 * - Tool execution continues in main process
 * - Events buffer in the bus
 * - Renderer catches up on show/reconnect
 * - System notifications fire when window is hidden
 */

import { BrowserWindow, Notification } from 'electron'

export interface BusEvent {
  type: string
  sessionId: string
  data: any
  timestamp: number
  seq: number
}

export class SessionBus {
  private events: BusEvent[] = []
  private seq = 0
  private maxBuffer = 1000 // Keep last N events per session
  private subscribers = new Map<string, Set<(event: BusEvent) => void>>()
  private mainWindow: BrowserWindow | null = null
  private windowVisible = true

  constructor() {}

  /** Bind to the main window for IPC push + visibility tracking */
  bindWindow(win: BrowserWindow): void {
    this.mainWindow = win
    this.windowVisible = win.isVisible()

    win.on('show', () => {
      this.windowVisible = true
    })
    win.on('hide', () => {
      this.windowVisible = false
    })
    win.on('focus', () => {
      this.windowVisible = true
    })
  }

  /** Emit an event — buffers it and pushes to renderer if visible */
  emit(sessionId: string, type: string, data: any): void {
    const event: BusEvent = {
      type,
      sessionId,
      data,
      timestamp: Date.now(),
      seq: ++this.seq,
    }

    // Buffer
    this.events.push(event)
    this.trimBuffer()

    // Push to renderer — use the original channel name so existing listeners work
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(type, data)
    }

    // Notify subscribers (internal main-process listeners)
    const subs = this.subscribers.get(sessionId) || this.subscribers.get('*')
    if (subs) {
      for (const fn of subs) {
        try { fn(event) } catch {}
      }
    }
  }

  /** Get events since a given seq number (for renderer reconnect/replay) */
  getEventsSince(seq: number, sessionId?: string): BusEvent[] {
    return this.events.filter(e =>
      e.seq > seq && (!sessionId || e.sessionId === sessionId)
    )
  }

  /** Get latest state for a session (last event of each type) */
  getLatestState(sessionId: string): Map<string, BusEvent> {
    const state = new Map<string, BusEvent>()
    for (const e of this.events) {
      if (e.sessionId === sessionId) {
        state.set(e.type, e)
      }
    }
    return state
  }

  /** Subscribe to events in main process */
  subscribe(sessionId: string, fn: (event: BusEvent) => void): () => void {
    if (!this.subscribers.has(sessionId)) {
      this.subscribers.set(sessionId, new Set())
    }
    this.subscribers.get(sessionId)!.add(fn)
    return () => this.subscribers.get(sessionId)?.delete(fn)
  }

  /** Send a system notification (when window is hidden) */
  notifyIfHidden(title: string, body: string): void {
    if (!this.windowVisible && Notification.isSupported()) {
      const notification = new Notification({ title, body, silent: false })
      notification.on('click', () => {
        this.mainWindow?.show()
        this.mainWindow?.focus()
      })
      notification.show()
    }
  }

  /** Check if window is currently visible */
  isWindowVisible(): boolean {
    return this.windowVisible
  }

  /** Get current sequence number (for renderer to track position) */
  getSeq(): number {
    return this.seq
  }

  private trimBuffer(): void {
    if (this.events.length > this.maxBuffer * 2) {
      this.events = this.events.slice(-this.maxBuffer)
    }
  }
}

// Singleton
export const sessionBus = new SessionBus()
