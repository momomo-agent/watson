# Watson - HOW

## 技术栈

```
Frontend: Vue 3 + TypeScript + Vite
Backend: Electron + Node.js
LLM: agentic-core (dogfooding)
Storage: SQLite
Build: electron-vite
```

## 架构设计

参考：`/tmp/paw-v6-full.md`

四层架构：
1. UI Layer (Vue 3 SFC)
2. Application Layer (WorkspaceManager + Schedulers)
3. Domain Layer (ChatSession + CodingAgentSession + MCPSession)
4. Infrastructure Layer (agentic-core + ToolRunner + Storage)

## 核心模块

### Phase 1: 核心对话（Week 1）
- ChatSession（领域层）
- LLMClient（基础设施层，封装 agentic-core）
- ToolRunner（基础设施层）
- ChatView.vue（UI 层）
- MessageCard.vue（UI 层）

### Phase 2: Workspace 管理（Week 2）
- WorkspaceManager（应用层）
- SessionManager（应用层）
- HeartbeatScheduler（应用层）
- CronScheduler（应用层）

### Phase 3: 扩展功能（Week 3）
- CodingAgentSession（领域层）
- MCPSession（领域层）
- Storage（基础设施层）

## 文件结构

```
watson/
├── .ai/                    # 开发方法论文件
├── src/
│   ├── main/              # Electron 主进程
│   ├── preload/           # IPC bridge
│   └── renderer/          # Vue 3 前端
├── electron.vite.config.ts
├── tsconfig.json
└── package.json
```

## 关键决策

1. **不用 Pinia** — 状态管理用 Composition API 就够了
2. **不用 Vue Router** — 单页面应用，不需要路由
3. **agentic-core 本地 link** — 先用 `pnpm link` 连接本地开发版本
4. **SQLite 后加** — Phase 1 先用内存存储，Phase 3 再加持久化

## 开发流程

每个 Phase：
1. 写 spec（.ai/specs/）
2. 实现代码
3. 自测（截图验证）
4. Review（代码审查）
5. Gate（质量门禁）

## 下一步

创建 Phase 1 的 spec 文档。
