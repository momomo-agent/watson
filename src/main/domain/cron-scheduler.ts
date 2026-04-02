import cron from 'node-cron'

export class CronScheduler {
  private tasks = new Map<string, cron.ScheduledTask>()

  schedule(expression: string, callback: () => void): string {
    const id = `cron-${Date.now()}`
    const task = cron.schedule(expression, () => {
      try {
        callback()
      } catch (error) {
        console.error('Cron task error:', error)
      }
    })
    this.tasks.set(id, task)
    return id
  }

  unschedule(id: string) {
    const task = this.tasks.get(id)
    if (task) {
      task.stop()
      this.tasks.delete(id)
    }
  }

  stop() {
    this.tasks.forEach(task => task.stop())
    this.tasks.clear()
  }
}
