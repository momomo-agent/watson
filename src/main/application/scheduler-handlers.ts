import { ipcMain } from 'electron'
import { HeartbeatScheduler } from './heartbeat-scheduler'
import { CronScheduler } from './cron-scheduler'

let heartbeat: HeartbeatScheduler | null = null
let cron: CronScheduler | null = null

export function registerSchedulerHandlers() {
  ipcMain.handle('scheduler:heartbeat:status', () => {
    return heartbeat ? { running: true } : { running: false }
  })

  ipcMain.handle('scheduler:heartbeat:start', () => {
    heartbeat?.start()
  })

  ipcMain.handle('scheduler:heartbeat:stop', () => {
    heartbeat?.stop()
  })

  ipcMain.handle('scheduler:cron:list', () => {
    return cron?.listJobs() || []
  })

  ipcMain.handle('scheduler:cron:add', (_, id: string, schedule: string) => {
    cron?.addJob(id, schedule, () => {
      console.log(`[Cron] Job ${id} executed`)
    })
  })

  ipcMain.handle('scheduler:cron:remove', (_, id: string) => {
    cron?.removeJob(id)
  })
}

export function setSchedulers(hb: HeartbeatScheduler, cr: CronScheduler) {
  heartbeat = hb
  cron = cr
}
