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
    console.log(`[Heartbeat] Tick at ${new Date().toISOString()} for workspace: ${this.workspace.name}`)
    
    // 执行心跳任务：检查 workspace 状态、清理临时文件等
    try {
      const { existsSync } = await import('fs')
      if (!existsSync(this.workspace.path)) {
        console.warn(`[Heartbeat] Workspace path not found: ${this.workspace.path}`)
        return
      }
      
      // 可以在这里添加更多心跳逻辑：
      // - 检查磁盘空间
      // - 清理过期缓存
      // - 同步配置
      console.log(`[Heartbeat] Workspace ${this.workspace.name} is healthy`)
    } catch (error) {
      console.error('[Heartbeat] Error during tick:', error)
    }
  }

  private getInterval(): number {
    const hour = new Date().getHours()
    if (hour >= 8 && hour < 12) return 45 * 60 * 1000  // 45min
    if (hour >= 13 && hour < 18) return 60 * 60 * 1000 // 60min
    return 90 * 60 * 1000 // 90min
  }
}
