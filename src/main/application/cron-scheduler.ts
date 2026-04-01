import { Workspace } from './workspace-manager'

export class CronScheduler {
  private workspace: Workspace
  private jobs: Array<{ schedule: string, task: () => void }> = []

  constructor(workspace: Workspace) {
    this.workspace = workspace
  }

  addJob(schedule: string, task: () => void) {
    this.jobs.push({ schedule, task })
  }

  start() {
    // 简单实现：每小时检查一次
    setInterval(() => {
      this.jobs.forEach(job => job.task())
    }, 60 * 60 * 1000)
  }
}
