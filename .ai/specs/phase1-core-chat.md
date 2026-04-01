# Phase 1: 核心对话功能

## 目标

实现最基础的对话功能：用户发送消息 → LLM 回复 → 显示在界面上

## 功能范围

### In Scope
- ✅ 发送文本消息
- ✅ LLM streaming 回复
- ✅ 消息显示（Markdown 渲染）
- ✅ 错误处理（显示错误信息）
- ✅ Cancel（取消正在进行的请求）
- ✅ Retry（重试失败的消息）

### Out of Scope
- ❌ 工具调用（Phase 3）
- ❌ 多 workspace（Phase 2）
- ❌ Heartbeat/Cron（Phase 2）
- ❌ 持久化（Phase 3）

## 技术实现

### 1. ChatSession（Domain Layer）

```typescript
class ChatSession {
  id: string
  messages: Message[]
  activeRequests: Map<string, AbortController>
  
  async sendMessage(text: string): Promise<void>
  cancel(messageId: string): void
  async retry(messageId: string): Promise<void>
  private async executeRequest(message: Message): Promise<void>
}
```

### 2. LLMClient（Infrastructure Layer）

```typescript
// 临时实现，不依赖 agentic-core
class LLMClient {
  static async streamChat(options: {
    messages: Message[]
    signal: AbortSignal
  }): AsyncIterator<Chunk>
}
```

### 3. UI Components

- ChatView.vue — 主界面
- MessageCard.vue — 消息卡片
- ChatInput.vue — 输入框

## 验收标准

1. ✅ 发送消息后立刻显示在界面
2. ✅ LLM 回复实时 streaming 更新
3. ✅ 错误显示在消息卡片上
4. ✅ Cancel 按钮可以中止请求
5. ✅ Retry 按钮可以重新发送

## 测试计划

1. 发送 "hello" → 验证 LLM 回复
2. 发送长消息 → 验证 streaming 流畅
3. 断网发送 → 验证错误显示
4. 发送后立刻 Cancel → 验证中止成功
5. 失败后 Retry → 验证重试成功

## 时间估算

- ChatSession 实现：2 小时
- LLMClient 实现：1 小时
- UI 组件：2 小时
- 测试验证：1 小时
- **总计：6 小时**

## 下一步

开始实现 ChatSession。
