# Phase 5.2: Heartbeat & Cron

## 目标

实现定时任务调度系统，支持：
- Heartbeat（心跳检查）
- Cron（定时任务）

## 功能需求

### 1. HeartbeatScheduler

每隔一段时间执行一次检查：
- 检查系统状态
- 清理过期数据
- 发送心跳消息

```typescript
class HeartbeatScheduler {
  start(intervalMs: number): void
  stop(): void
  onHeartbeat(callback: () => void): void
}
```

### 2. CronScheduler

支持 cron 表达式的定时任务：
- 每天特定时间执行
- 每周特定时间执行

```typescript
class CronScheduler {
  schedule(expression: string, callback: () => void): string
  unschedule(id: string): void
}
```

## 技术方案

### 实现

使用 `node-cron` 库：

```bash
pnpm add node-cron
pnpm add -D @types/node-cron
```

### HeartbeatScheduler

```typescript
export class HeartbeatScheduler {
  private timer: NodeJS.Timeout | null = null
  private callbacks: Array<() => void> = []

  start(intervalMs: number = 60000) {
    this.timer = setInterval(() => {
      this.callbacks.forEach(cb => cb())
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
```

### CronScheduler

```typescript
import cron from 'node-cron'

export class CronScheduler {
  private tasks = new Map<string, cron.ScheduledTask>()

  schedule(expression: string, callback: () => void): string {
    const id = `cron-${Date.now()}`
    const task = cron.schedule(expression, callback)
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
}
```

## 验收标准

- [ ] Heartbeat 每分钟执行
- [ ] Cron 表达式正确解析
- [ ] 能启动/停止调度器

## 非目标

- 不做持久化（重启后丢失）
- 不做 UI 配置（代码配置）
