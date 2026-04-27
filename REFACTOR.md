# Watson 拆包计划

## 目标

把 Watson 的可复用部分拆成独立 npm 包，让其他项目（Paw/Fluid Agent/未来桌面 Agent）能直接用。

## 当前状态

- **14706 行**，86 文件
- 已依赖：agentic/agentic-core/agentic-claw/agentic-memory/agentic-conductor
- 三层架构：application / domain / infrastructure

## 拆分方案

### 1. `agentic-desktop` — 桌面 Agent 核心

**包含**：
- `domain/chat-session.ts` (547 行) — 对话管理 + streaming + FlowSegment
- `domain/group-chat.ts` (526 行) — 群聊逻辑
- `domain/coding-agent-session.ts` (56 行) — Coding Agent 模式
- `domain/proactive-engine.ts` (170 行) — 主动智能（rapid_switch/error/idle 信号）
- `domain/sense-loop.ts` + test (174+56 行) — 感知循环（屏幕/距离/环境）
- `infrastructure/session-bus.ts` — 事件总线
- `infrastructure/tool-runner.ts` — 工具执行器
- `infrastructure/claw-bridge.ts` — agentic-claw 配置桥接

**不包含**：
- Electron 特定代码（IPC handlers、BrowserWindow、Tray）
- UI 组件（Vue）
- 持久化实现（SQLite schema）

**接口**：
```ts
export { ChatSession, GroupChat, CodingAgentSession }
export { ProactiveEngine, SenseLoop, SenseContext }
export { SessionBus, ToolRunner }
export { configureAgentic }
```

**依赖**：
- agentic-core
- agentic-claw
- agentic-memory
- agentic-conductor

---

### 2. `agentic-workspace` — Workspace 管理

**包含**：
- `application/workspace-manager.ts` (251 行) — Workspace 切换 + session 管理
- `infrastructure/workspace-registry.ts` — Workspace 注册表
- `infrastructure/workspace-db.ts` — SQLite 持久化（schema + CRUD）
- `infrastructure/memory-index.ts` — 记忆索引（sqlite-vec）

**接口**：
```ts
export { WorkspaceManager }
export { initRegistry, addWorkspace, removeWorkspace, getCurrentWorkspace }
export { openDb, closeDb, closeAll }
export { MemoryIndex }
```

**依赖**：
- better-sqlite3
- sqlite-vec
- agentic-memory

---

### 3. `agentic-skill` — Skill 系统

**包含**：
- `domain/skill-manager.ts` — Skill 加载 + 注册
- `infrastructure/skill-parser.ts` — SKILL.md 解析

**接口**：
```ts
export { SkillManager }
export { parseSkillMd }
```

**依赖**：
- js-yaml
- chokidar（可选，文件监听）

---

### 4. `agentic-scheduler` — 定时任务

**包含**：
- `application/heartbeat-scheduler.ts` (48 行)
- `application/cron-scheduler.ts` (48 行)

**接口**：
```ts
export { HeartbeatScheduler, CronScheduler }
```

**依赖**：
- node-cron

---

### 5. `agentic-mcp` — MCP 管理器

**包含**：
- `infrastructure/mcp-manager.ts` — MCP server 启动 + 工具注册

**接口**：
```ts
export { McpManager }
```

**依赖**：
- @modelcontextprotocol/sdk

---

### 6. Watson 本体（Electron App）

**保留**：
- `src/main/index.ts` — Electron 主进程入口
- `src/main/application/*-handlers.ts` — IPC handlers（桥接层）
- `src/main/application/tray-manager.ts` — 系统托盘
- `src/renderer/**` — Vue 3 UI
- `src/preload/**` — Preload 脚本
- `src/shared/**` — 类型定义

**依赖**：
- electron
- vue
- agentic-desktop
- agentic-workspace
- agentic-skill
- agentic-scheduler
- agentic-mcp

---

## 拆分顺序

1. **agentic-skill** — 最独立，零依赖其他 Watson 模块
2. **agentic-mcp** — 只依赖 MCP SDK
3. **agentic-scheduler** — 只依赖 node-cron
4. **agentic-workspace** — 依赖 agentic-memory
5. **agentic-desktop** — 依赖 agentic-core/claw/memory/conductor
6. **Watson 本体** — 重构 handlers，依赖上述 5 个包

---

## 收益

- **复用性**：Paw/Fluid Agent/未来桌面 Agent 直接用 agentic-desktop
- **测试性**：每个包独立测试，Watson 只测 Electron 集成
- **维护性**：业务逻辑和 Electron 解耦，升级 Electron 不影响核心
- **发布**：agentic-* 包可以独立发 npm，Watson 只发 DMG

---

## 注意事项

- **类型定义**：`shared/chat-types.ts` 移到 agentic-desktop
- **配置加载**：`infrastructure/config.ts` 保留在 Watson（Electron userData 路径）
- **屏幕截图**：`infrastructure/screen-capture.ts` 保留在 Watson（依赖 Electron）
- **文件监听**：`application/file-watcher-handlers.ts` 保留在 Watson（IPC 层）
- **持久化 schema**：agentic-workspace 提供 schema，Watson 提供迁移脚本

---

## 下一步

1. 创建 `~/LOCAL/momo-agent/projects/agentic/packages/` 目录结构
2. 按顺序拆分 5 个包
3. 更新 Watson package.json 依赖
4. 跑测试验证
5. 更新 README + 文档
