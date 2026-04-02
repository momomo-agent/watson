import cron from 'node-cron'
import type { Workspace } from '../domain/workspace-manager'

interface CronJob {
  id: string
  schedule: string
  task: () => void | Promise<void>
  cronTask: cron.ScheduledTask
}

export class CronScheduler {
  private workspace: Workspace
  private jobs: Map<string, CronJob> = new Map()

  constructor(workspace: Workspace) {
    this.workspace = workspace
  }

  addJob(id: string, schedule: string, task: () => void | Promise<void>): void {
    if (this.jobs.has(id)) {
      throw new Error(`Job ${id} already exists`)
    }

    const cronTask = cron.schedule(schedule, async () => {
      console.log(`[Cron] Running job ${id} at ${new Date().toISOString()}`)
      try {
        await task()
      } catch (error) {
        console.error(`[Cron] Job ${id} failed:`, error)
      }
    }, { scheduled: false })

    this.jobs.set(id, { id, schedule, task, cronTask })
  }

  removeJob(id: string): void {
    const job = this.jobs.get(id)
    if (job) {
      job.cronTask.stop()
      this.jobs.delete(id)
    }
  }

  start(): void {
    this.jobs.forEach(job => job.cronTask.start())
    console.log(`[Cron] Started ${this.jobs.size} jobs for workspace: ${this.workspace.name}`)
  }

  stop(): void {
    this.jobs.forEach(job => job.cronTask.stop())
    console.log(`[Cron] Stopped all jobs`)
  }

  listJobs(): Array<{ id: string, schedule: string }> {
    return Array.from(this.jobs.values()).map(j => ({ id: j.id, schedule: j.schedule }))
  }
}
