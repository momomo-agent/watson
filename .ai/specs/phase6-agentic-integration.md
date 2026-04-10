# Phase 6: AgenticService 内嵌 + AgenticClient 替换

## WHY

Watson 立项时承诺用 agentic 家族做底层，但 Phase 1-5 全部自己实现了 LLM 调用层。
现在要兑现承诺：内嵌 AgenticService，用 AgenticClient 替换自写的 provider 层。

## 目标

1. Watson 启动时自动启动内嵌的 AgenticService（本地模型管理 + OpenAI 兼容 API）
2. 用 AgenticClient 替换 Watson 自写的 AnthropicProvider + OpenAICompatProvider
3. 前端 UI 不变，IPC 接口不变，对 renderer 透明

## 当前架构（要替换的部分）

```
main/
  domain/agent.ts          — Agent 类，管理 provider 选择 + chat 调用
  infrastructure/
    providers/
      anthropic.ts         — 直接调 Anthropic API（streaming SSE 解析）
      openai-compat.ts     — 直接调 OpenAI 兼容 API（streaming SSE 解析）
    config.ts              — 读 agents.json 配置
```

## 目标架构

```
main/
  domain/agent.ts          — 改为使用 AgenticClient.chat()
  infrastructure/
    providers/             — 删除整个目录
    agentic-service.ts     — 新增：管理内嵌 AgenticService 进程生命周期
    config.ts              — 保留，适配 AgenticClient 配置格式
```

## AgenticService 能力（已有）

- Express HTTP 服务，端口 11435
- Ollama + MLX 双引擎本地模型管理
- `/v1/chat/completions` OpenAI 兼容接口（streaming + 非 streaming）
- `/v1/models` 模型列表
- `/api/models/download` `/api/models/delete` 模型管理
- `/api/models/recommended` 推荐模型列表
- `/health` 健康检查

## AgenticClient 能力（已有）

- `chat(messages, options)` — 统一调用接口，支持 streaming
- `sense(imageBase64)` — 屏幕感知
- `speak(text)` / `listen()` — 语音
- `getModels()` / `downloadModel()` / `deleteModel()` — 模型管理
- 自动选择本地/云端 provider

## 实施步骤

### Step 1: 内嵌 AgenticService

新建 `src/main/infrastructure/agentic-service.ts`:
- Watson 启动时 fork AgenticService 为子进程
- 等待 `/health` 返回 200 后标记就绪
- Watson 退出时 kill 子进程
- 暴露 `start()` / `stop()` / `isReady()` 方法

AgenticService 的代码在 `../../agentic/apps/service/`，Watson 通过 npm workspace 或相对路径引用。

### Step 2: 引入 AgenticClient

- `npm install` 或 workspace link `@anthropic/agentic-client`（实际包名看 package.json）
- 在 `agent.ts` 中实例化 AgenticClient，配置：
  - 本地 provider: `http://localhost:11435`（内嵌 AgenticService）
  - 云端 providers: 从现有 agents.json 读取（Anthropic / OpenRouter 等）

### Step 3: 替换 Agent 类的 chat 调用

当前 `agent.ts` 的 `chat()` 方法：
- 自己选 provider → 自己构造请求 → 自己解析 SSE stream
- 替换为：`agenticClient.chat(messages, { model, stream: true, tools })`
- streaming 事件映射到现有的 IPC 事件（`chat:token` / `chat:tool-use` / `chat:done` / `chat:error`）

### Step 4: 删除自写 provider

- 删除 `providers/anthropic.ts`（147 行）
- 删除 `providers/openai-compat.ts`（128 行）
- 净减 ~275 行代码

### Step 5: 适配配置

现有 `agents.json` 格式：
```json
{
  "agents": [{ "id": "...", "name": "...", "provider": "anthropic", "model": "...", "apiKey": "..." }]
}
```

需要映射到 AgenticClient 的配置格式。保持 `agents.json` 不变，在 config.ts 里做转换。

## 不动的部分

- 前端 UI（Vue 组件、stores）— 完全不动
- IPC 接口（preload bridge）— 完全不动
- Session/Message store — 完全不动
- Tools 系统 — 完全不动
- Screen sense — 暂不动（后续用 AgenticClient.sense() 替换）
- Workspace — 完全不动

## 验收标准

1. Watson 启动后 AgenticService 自动运行，`/health` 返回 200
2. 现有对话功能正常（streaming、tool use、cancel）
3. 能通过 AgenticService 使用本地模型对话
4. `providers/` 目录已删除
5. Watson 退出时 AgenticService 子进程正常退出

## 风险

- AgenticClient 的 streaming 事件格式可能与 Watson 现有 IPC 事件不完全匹配 → 需要适配层
- AgenticService 作为子进程的端口冲突 → 用随机端口或检测可用端口
- agentic monorepo 的 TypeScript 构建产物路径 → 确认 dist/ 存在且可引用
