# Watson

AI workspace built with Vue 3 + Electron. Paw 的完全重写版本。

## 技术栈

- **Frontend**: Vue 3 + Composition API + TypeScript
- **Backend**: Electron + Node.js
- **Build**: Vite + electron-vite
- **LLM**: 双 provider（Anthropic + OpenAI）

## 架构

四层架构：
1. **UI Layer** - Vue 3 SFC 组件
2. **Application Layer** - WorkspaceManager + Schedulers
3. **Domain Layer** - ChatSession + CodingAgentSession + MCPSession
4. **Infrastructure Layer** - LLMClient + ToolRunner + Storage

## 项目结构

```
watson/
├── .ai/                    # 开发方法论文件
│   ├── WHY.md             # 项目愿景
│   ├── HOW.md             # 技术方案
│   ├── PLAN.md            # 开发计划
│   └── specs/             # 功能规格
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── domain/        # 领域层
│   │   ├── infrastructure/# 基础设施层
│   │   └── ipc/           # IPC handlers
│   ├── preload/           # IPC bridge
│   └── renderer/          # Vue 3 前端
│       ├── components/    # UI 组件
│       └── composables/   # Composition API
├── electron.vite.config.ts
├── tsconfig.json
└── package.json
```

## 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建
pnpm build
```

## 配置

在项目根目录创建 `.watson/config.json`：

```json
{
  "provider": "anthropic",
  "apiKey": "your-api-key",
  "model": "claude-sonnet-4-20250514"
}
```

## 功能状态

### Phase 1: 核心对话 ✅
- [x] 发送消息
- [x] LLM streaming 回复
- [x] Markdown 渲染
- [x] Cancel/Retry
- [x] 错误处理

### Phase 2: Workspace 管理 🔄
- [ ] 多 workspace 支持
- [ ] HeartbeatScheduler
- [ ] CronScheduler

### Phase 3: 工具系统 📋
- [ ] 8 个内置工具
- [ ] Loop detection

### Phase 4: Coding Agent 📋
- [ ] AWS Code 集成
- [ ] Codex 集成

### Phase 5: MCP + 持久化 📋
- [ ] MCP 协议
- [ ] SQLite 持久化

## 开发方法论

Watson 严格遵循开发方法论：WHY → HOW → TASTE → DO → REVIEW → GATE

详见 `.ai/` 目录下的文档。

## License

MIT
