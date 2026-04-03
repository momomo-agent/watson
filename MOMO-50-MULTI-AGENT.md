# MOMO-50: Multi-Agent Support

## 概述

Watson 现在支持在同一对话中使用多个 AI agent，每个 agent 可以有自己的：
- 模型配置（model, provider, apiKey）
- 系统提示词（systemPrompt）
- 工具权限（tools）
- UI 外观（avatar, color）

## 功能特性

### 1. Agent 配置管理

每个 workspace 可以配置多个 agent，配置文件位于 `.watson/agents.json`：

```json
{
  "defaultAgent": "default",
  "agents": [
    {
      "id": "default",
      "name": "Watson",
      "description": "General-purpose assistant",
      "avatar": "🤖",
      "color": "#3b82f6"
    },
    {
      "id": "coder",
      "name": "Coder",
      "description": "Specialized in coding tasks",
      "avatar": "👨‍💻",
      "color": "#10b981",
      "model": "claude-opus-4",
      "systemPrompt": "You are a coding specialist..."
    }
  ]
}
```

### 2. Agent 选择方式

#### 方式 1: UI 选择器
在输入框左侧点击 agent 按钮，从下拉菜单选择 agent。

#### 方式 2: @mention
在消息开头使用 `@agentId` 来指定 agent：
```
@coder write a function to parse JSON
@researcher find information about X
```

### 3. Agent 管理界面

点击 agent 选择器中的 "⚙️ Manage Agents" 可以：
- 查看所有 agent
- 添加新 agent
- 编辑 agent 配置
- 删除 agent
- 设置默认 agent

## 架构设计

### 数据层

**MessageStore** (`message-store.ts`)
- 添加 `agent_id` 字段到 messages 表
- 持久化每条消息的 agent 信息

**AgentManager** (`agent-manager.ts`)
- 管理 agent 配置（CRUD）
- 解析 @mention
- 加载/保存 agents.json

### 业务层

**ChatSession** (`chat-session.ts`)
- `sendMessage(text, agentId?)` 接受 agentId 参数
- 消息携带 agentId 信息

**WorkspaceManager** (`workspace-manager.ts`)
- 集成 AgentManager
- `createLLMStream()` 根据 agentId 选择配置
- 支持 agent-specific model/prompt/tools

### 应用层

**chat-handlers.ts**
- `chat:send` 支持 agentId 参数
- 解析 @mention 并路由到对应 agent
- 新增 agent 管理 IPC handlers：
  - `agent:list`
  - `agent:get`
  - `agent:add`
  - `agent:update`
  - `agent:remove`
  - `agent:setDefault`

### UI 层

**AgentSelector.vue**
- Agent 下拉选择器
- 显示 agent avatar 和名称
- 触发 agent 管理对话框

**AgentManager.vue**
- Agent 管理对话框
- CRUD 操作界面
- Agent 编辑表单

**MessageCard.vue**
- 显示 agent avatar 和名称
- 区分不同 agent 的消息

**ChatInput.vue**
- 集成 AgentSelector
- 传递 agentId 到 sendMessage

## 使用示例

### 场景 1: 代码审查

```
@coder review this code:
[paste code]

@researcher find best practices for error handling
```

### 场景 2: 多角色协作

```
@architect design the system architecture

@coder implement the core logic

@researcher validate the approach
```

### 场景 3: 专业领域

创建专业 agent：
- **Legal Agent**: 法律咨询，使用法律术语
- **Medical Agent**: 医疗建议，谨慎措辞
- **Finance Agent**: 财务分析，数据驱动

## 数据库迁移

如果已有数据库，运行迁移脚本：

```bash
chmod +x migrate-agent-id.sh
./migrate-agent-id.sh
```

## 测试

运行测试脚本验证功能：

```bash
node test-multi-agent.cjs
```

## 配置示例

### 使用不同模型

```json
{
  "id": "fast-agent",
  "name": "Fast Agent",
  "model": "claude-sonnet-4",
  "description": "Quick responses"
}
```

### 限制工具访问

```json
{
  "id": "safe-agent",
  "name": "Safe Agent",
  "tools": ["search", "read_file"],
  "description": "Read-only agent"
}
```

### 自定义 API

```json
{
  "id": "custom-agent",
  "name": "Custom Agent",
  "provider": "openai",
  "apiKey": "sk-...",
  "baseUrl": "https://api.custom.com/v1",
  "model": "gpt-4"
}
```

## 实现细节

### Agent 配置优先级

1. Agent-specific config (agents.json)
2. Workspace config (.watson/config.json)
3. Environment variables
4. OpenClaw config (~/.openclaw/openclaw.json)

### @mention 解析

- 正则匹配：`/^@(\w+)\s/`
- 验证 agent 存在
- 从消息中移除 @mention
- 传递 agentId 到 ChatSession

### 消息路由

```
User input → parse @mention → select agent → load config → LLM call
```

### UI 状态管理

- Agent 选择状态存储在 ChatInput 组件
- 每次发送消息时传递 agentId
- MessageCard 从数据库加载 agent 信息显示

## 未来扩展

- [ ] Agent 间通信（agent 可以 @mention 其他 agent）
- [ ] Agent 权限系统（某些 agent 只能访问特定文件）
- [ ] Agent 性能统计（响应时间、成功率）
- [ ] Agent 模板市场（预配置的专业 agent）
- [ ] Agent 学习（根据用户反馈调整 prompt）

## 相关文件

### 新增文件
- `src/main/infrastructure/agent-manager.ts`
- `src/renderer/components/AgentSelector.vue`
- `src/renderer/components/AgentManager.vue`
- `migrate-agent-id.sh`
- `test-multi-agent.cjs`
- `MOMO-50-MULTI-AGENT.md`

### 修改文件
- `src/main/infrastructure/message-store.ts` - 添加 agent_id 字段
- `src/main/domain/chat-session.ts` - 支持 agentId 参数
- `src/main/application/workspace-manager.ts` - 集成 AgentManager
- `src/main/application/chat-handlers.ts` - 添加 agent IPC handlers
- `src/renderer/components/ChatInput.vue` - 集成 AgentSelector
- `src/renderer/components/ChatView.vue` - 传递 agentId
- `src/renderer/components/MessageCard.vue` - 显示 agent 信息
- `src/renderer/composables/useChatSession.ts` - 支持 agentId

## 提交信息

```
feat(MOMO-50): Multi-agent support

- Add AgentManager for agent configuration management
- Support @mention routing to specific agents
- Add agent selector UI component
- Add agent management dialog
- Persist agentId in messages
- Support agent-specific model/prompt/tools
- Add database migration for agent_id column
```
