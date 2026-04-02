# Phase 5.5: 持久化

## 目标

将对话历史持久化到 SQLite。

## 最小实现

### 1. 数据库结构

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  role TEXT,
  content TEXT,
  status TEXT,
  created_at INTEGER
);
```

### 2. MessageStore

```typescript
class MessageStore {
  save(workspaceId: string, message: Message): void
  load(workspaceId: string): Message[]
  clear(workspaceId: string): void
}
```

## 验收标准

- [ ] 消息能保存到数据库
- [ ] 切换 workspace 能加载历史
- [ ] 重启后历史不丢失

## 非目标

- 不做搜索
- 不做导出
