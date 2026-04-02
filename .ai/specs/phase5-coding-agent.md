# Phase 5.3: Coding Agent 集成

## 目标

集成 AWS Code 作为 coding agent，让 Watson 能够：
- 派发编码任务给 AWS Code
- 监控执行进度
- 接收执行结果

## 功能需求

### 1. CodingAgentSession

```typescript
class CodingAgentSession {
  start(task: string, workdir: string): void
  cancel(): void
  onProgress(callback: (data: string) => void): void
  onComplete(callback: (result: string) => void): void
}
```

### 2. 工具定义

添加 `coding_agent` 工具：

```typescript
{
  name: 'coding_agent',
  description: 'Delegate coding tasks to AWS Code agent',
  input_schema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'Coding task description' },
      workdir: { type: 'string', description: 'Working directory' }
    },
    required: ['task']
  }
}
```

## 技术方案

### 实现

使用 `child_process.spawn` 启动 AWS Code：

```bash
claude --dangerously-skip-permissions --worktree '<task>'
```

### CodingAgentSession

```typescript
export class CodingAgentSession {
  private proc: ChildProcess | null = null
  
  start(task: string, workdir: string) {
    this.proc = spawn('claude', [
      '--dangerously-skip-permissions',
      '--worktree',
      task
    ], { cwd: workdir })
    
    this.proc.stdout?.on('data', data => {
      // 处理输出
    })
  }
}
```

## 验收标准

- [ ] 能启动 AWS Code
- [ ] 能接收输出
- [ ] 能取消执行
- [ ] 工具调用正确

## 非目标

- 不做 UI 进度显示（Phase 6）
- 不做多 agent 并行（Phase 6）
