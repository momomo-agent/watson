# Watson - WHY

## 问题（What problem are we solving?）

Paw v0.12.0 存在的问题：
1. **架构复杂** — 47 个文件，7000 行代码，调用链不清晰
2. **维护困难** — 纯 JS，手动 DOM 操作，状态分散
3. **开发体验差** — 无 HMR，无类型检查，无组件化
4. **核心体验不稳定** — 发送消息不一定有回复，retry 会消失

## 解决方案（How are we solving it?）

Watson = Paw 的完全重写，用现代技术栈：
- Vue 3 + Composition API（响应式 + 组件化）
- TypeScript（类型安全）
- Vite（快速 HMR）
- agentic-core（LLM 调用，dogfooding）
- 极简架构（12 个模块，1800 行代码）

## 目标（Success criteria）

1. **功能完整** — 100% 覆盖 Paw 的所有功能
2. **体验稳定** — 发送必有回复，错误必显示
3. **代码简洁** — 代码量减少 74%
4. **开发体验好** — HMR + 类型检查 + 组件化

## 非目标（What we're NOT doing）

- ❌ 不添加新功能（先对齐 Paw）
- ❌ 不改变产品理念（Portable AI workspace）
- ❌ 不支持 Web 版（只做 Electron）

## 时间线

- Week 1: 核心对话功能（ChatSession + LLM）
- Week 2: Workspace 管理 + Heartbeat + Cron
- Week 3: Coding Agent + MCP + 工具系统
- Week 4: 测试 + 打磨 + 发布 v1.0

## 风险

1. **agentic-core 未发布** — 先用本地 link，或临时自己实现
2. **Electron 配置复杂** — electron-vite 可能有坑
3. **迁移成本** — 用户需要重新配置

## 决策记录

- 2026-04-01: 决定用 Vue 3 而不是 React（更轻量，Composition API 更适合）
- 2026-04-01: 决定完全重写而不是渐进式迁移（技术债太多）
