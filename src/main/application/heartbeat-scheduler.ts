import { existsSync } from 'fs'
import { EventEmitter } from 'events'

export class HeartbeatScheduler extends EventEmitter {
  private wsPath: string
  private interval: NodeJS.Timeout | null = null
  private isRunning = false

  constructor(wsPath: string) {
    super()
    this.wsPath = wsPath
  }

  start() {
    if (this.isRunning) return
    this.isRunning = true
    this.scheduleNext()
  }

  stop() {
    if (this.interval) { clearTimeout(this.interval); this.interval = null }
    this.isRunning = false
  }

  private scheduleNext() {
    if (!this.isRunning) return
    this.interval = setTimeout(() => {
      this.tick()
      this.scheduleNext()
    }, this.getInterval())
  }

  private tick() {
    if (!existsSync(this.wsPath)) {
      console.warn(`[Heartbeat] Workspace path not found: ${this.wsPath}`)
      return
    }
    console.log(`[Heartbeat] Tick at ${new Date().toISOString()} for ${this.wsPath}`)
    this.emit('tick')
  }

  private getInterval(): number {
    const hour = new Date().getHours()
    if (hour >= 8 && hour < 12) return 45 * 60 * 1000
    if (hour >= 13 && hour < 18) return 60 * 60 * 1000
    return 90 * 60 * 1000
  }
}
