export class HeartbeatScheduler {
  private timer: NodeJS.Timeout | null = null
  private callbacks: Array<() => void> = []

  start(intervalMs: number = 60000) {
    if (this.timer) return
    
    this.timer = setInterval(() => {
      this.callbacks.forEach(cb => {
        try {
          cb()
        } catch (error) {
          console.error('Heartbeat callback error:', error)
        }
      })
    }, intervalMs)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  onHeartbeat(callback: () => void) {
    this.callbacks.push(callback)
  }
}
