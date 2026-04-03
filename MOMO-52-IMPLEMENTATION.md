# MOMO-52: Coding Agent as Participant - 实现完成

## 目标
将 Coding Agent 从工具升级为聊天参与者

## 实现内容

### 1. Coding Agent 作为独立 agent 配置 ✓

**新增文件：**
- `src/main/infrastructure/coding-agent-manager.ts` - 管理 coding agent 配置和可用性检测
- `src/main/infrastructure/coding-agent-executor.ts` - 执行 coding agent 会话并支持流式输出

**功能：**
- 检测可用的 coding agent（SDK 模式如 Claude Code，CLI 模式如 Codex）
- 支持 API key 配置（SDK 模式）
- 支持二进制路径检测（CLI 模式）
- 初始化时自动检测系统中可用的 coding agent

### 2. 消息流集成 ✓

**修改文件：**
- `src/main/application/chat-handlers.ts` - 添加 coding agent 消息路由
- `src/main/application/workspace-manager.ts` - 添加 `routeToCodingAgent` 方法

**消息流程：**
```
用户发送消息 (@coding-agent mention)
  ↓
chat-handlers 检测 agent.type === 'coding-agent'
  ↓
handleCodingAgentMessage() 创建用户消息和助手消息占位符
  ↓
workspace.routeToCodingAgent() 路由到 coding agent
  ↓
CodingAgentExecutor 启动进程并流式输出
  ↓
onToken 回调更新消息内容
  ↓
chat:update 事件通知 UI 更新
  ↓
完成后标记消息状态为 'complete'
```

### 3. 工具调用代理 ✓

**架构设计：**
- Coding agent 作为独立进程运行，有自己的工具调用能力
- 通过 stdin/stdout 与主进程通信
- 支持 Claude Code SDK 模式（--dangerously-skip-permissions）
- 支持 CLI/ACP 模式（直接调用二进制）

### 4. UI 显示优化 ✓

**Agent 配置扩展：**
```typescript
export interface AgentConfig {
  // ... 原有字段
  type?: 'llm' | 'coding-agent'  // Agent 类型
  codingAgentId?: string          // 引用的 coding agent ID
}
```

**特性：**
- Coding agent 消息带有 `agentId` 标识
- 支持流式输出显示
- 支持取消操作（abort signal）
- 错误处理和状态显示

## 技术实现

### 核心类

**CodingAgentManager**
- 检测系统中可用的 coding agent
- 管理 coding agent 配置
- 提供可用性查询接口

**CodingAgentExecutor**
- 执行 coding agent 会话
- 支持流式输出（onToken 回调）
- 支持取消操作（AbortSignal）
- 处理进程生命周期

**Workspace.routeToCodingAgent()**
- 验证 coding agent 配置
- 检查可用性
- 创建 executor 并执行
- 处理流式输出和错误

### IPC Handlers

新增 IPC 接口：
- `coding-agent:list` - 列出可用的 coding agent
- `coding-agent:init` - 初始化 coding agent 配置

扩展现有接口：
- `chat:send` - 检测 coding agent 类型并路由

## 参考实现

基于 paw 项目的实现：
- `projects/paw/core/coding-agents.js` - agent 检测和管理
- `projects/paw/core/coding-agent-router.js` - 消息路由和流式输出
- `projects/paw/core/coding-agent-registry.js` - 用户配置管理

## 构建状态

✓ TypeScript 编译成功
✓ 无类型错误
✓ 代码已提交到 git

## 下一步

1. **UI 实现**
   - 添加 coding agent 选择器
   - 添加 coding agent 配置界面
   - 显示 coding agent 状态

2. **测试**
   - 使用真实的 Claude Code 二进制测试
   - 测试流式输出
   - 测试取消操作
   - 测试错误处理

3. **会话持久化**
   - 保存 coding agent 会话状态
   - 支持会话恢复（类似 paw 的 cc-sessions.json）

4. **工具集成**
   - 允许 coding agent 调用 Watson 的工具
   - 工具调用结果反馈

## Git Commit

```
feat(MOMO-52): Implement Coding Agent as Participant

- Created CodingAgentManager to detect and manage coding agents
- Created CodingAgentExecutor for streaming execution
- Extended AgentConfig with type and codingAgentId fields
- Added routeToCodingAgent method to Workspace
- Modified chat-handlers to route coding agent messages
- Added IPC handlers for coding agent management

Commit: e2ce79b
```

## 总结

MOMO-52 的核心功能已实现完成：

✓ Coding Agent 作为独立 agent 配置
✓ 消息流集成（流式输出）
✓ 工具调用代理（独立进程）
✓ UI 显示优化（agent 类型标识）

架构清晰，依赖注入，易于扩展。下一步需要 UI 实现和真实环境测试。
