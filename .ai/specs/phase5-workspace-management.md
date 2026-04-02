# Phase 5.1: Workspace 管理

## 目标

支持多 workspace，每个 workspace 独立的：
- 工作目录
- 对话历史
- 配置

## 功能需求

### 1. Workspace 数据结构

```typescript
interface Workspace {
  id: string
  name: string
  path: string
  createdAt: number
  lastUsed: number
}
```

### 2. WorkspaceManager

```typescript
class WorkspaceManager {
  listWorkspaces(): Workspace[]
  createWorkspace(name: string, path: string): Workspace
  switchWorkspace(id: string): void
  deleteWorkspace(id: string): void
  getCurrentWorkspace(): Workspace | null
}
```

### 3. UI 改动

- 左上角显示当前 workspace 名称
- 点击可切换 workspace
- 简单的下拉菜单

## 技术方案

### 存储

使用 `~/.watson/workspaces.json`：

```json
{
  "current": "ws-1",
  "workspaces": [
    {
      "id": "ws-1",
      "name": "Default",
      "path": "/Users/kenefe",
      "createdAt": 1234567890,
      "lastUsed": 1234567890
    }
  ]
}
```

### 实现步骤

1. 创建 `WorkspaceManager` 类
2. 添加 IPC handlers
3. 创建 UI 组件 `WorkspaceSwitcher.vue`
4. 集成到 `ChatView.vue`

## 验收标准

- [ ] 能创建新 workspace
- [ ] 能切换 workspace
- [ ] 切换后工作目录正确
- [ ] UI 显示当前 workspace

## 非目标

- 不做 workspace 设置（Phase 5.5）
- 不做历史迁移（手动）
