import * as cron from 'node-cron'

interface CronJob {
  id: string
  schedule: string
  task: () => void | Promise<void>
  cronTask: cron.ScheduledTask
}

export class CronScheduler {
  private wsPath: string
  private jobs: Map<string, CronJob> = new Map()

  constructor(wsPath: string) {
    this.wsPath = wsPath
  }

  addJob(id: string, schedule: string, task: () => void | Promise<void>): void {
    if (this.jobs.has(id)) throw new Error(`Job ${id} already exists`)

    const cronTask = cron.schedule(schedule, async () => {
      console.log(`[Cron] Running job ${id} at ${new Date().toISOString()}`)
      try { await task() } catch (error) {
        console.error(`[Cron] Job ${id} failed:`, error)
      }
    })

    this.jobs.set(id, { id, schedule, task, cronTask })
  }

  removeJob(id: string): void {
    const job = this.jobs.get(id)
    if (job) { job.cronTask.stop(); this.jobs.delete(id) }
  }

  start(): void {
    this.jobs.forEach(job => job.cronTask.start())
    console.log(`[Cron] Started ${this.jobs.size} jobs for workspace: ${this.wsPath}`)
  }

  stop(): void {
    this.jobs.forEach(job => job.cronTask.stop())
  }

  listJobs(): Array<{ id: string; schedule: string }> {
    return Array.from(this.jobs.values()).map(j => ({ id: j.id, schedule: j.schedule }))
  }
}
