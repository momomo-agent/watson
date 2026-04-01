import { Workspace } from './workspace-manager'

export class HeartbeatScheduler {
  private workspace: Workspace
  private interval: NodeJS.Timeout | null = null
  private isRunning = false

  constructor(workspace: Workspace) {
    this.workspace = workspace
  }

  start() {
    if (this.isRunning) return
    this.isRunning = true
    this.scheduleNext()
  }

  stop() {
    if (this.interval) {
      clearTimeout(this.interval)
      this.interval = null
    }
    this.isRunning = false
  }

  private scheduleNext() {
    if (!this.isRunning) return
    const intervalMs = this.getInterval()
    this.interval = setTimeout(() => {
      this.tick()
      this.scheduleNext()
    }, intervalMs)
  }

  private async tick() {
    // 执行 heartbeat 逻辑
    console.log('Heartbeat tick for workspace:', this.workspace.path)
  }

  private getInterval(): number {
    const hour = new Date().getHours()
    if (hour >= 8 && hour < 12) return 45 * 60 * 1000  // 45min
    if (hour >= 13 && hour < 18) return 60 * 60 * 1000 // 60min
    return 90 * 60 * 1000 // 90min
  }
}
