# Watson Phase 9 — 体验顺滑

## 目标
让 Watson 从"能用"变成"顺用"。不加新功能，打磨现有体验。

## P0 — 三件事

### 1. 空状态快捷入口
**文件**: `src/renderer/components/ChatView.vue`

空状态替换为 4 个快捷入口卡片：
- 📁 分析当前项目（`分析 ${workspacePath} 的项目结构，给我一个概览`）
- 🖥️ 看看屏幕（`用 screen_sense 截图，告诉我你看到了什么`）
- 💻 写代码（`我需要写一段代码，帮我开始`）
- 🔍 搜索文件（`在 ${workspacePath} 里搜索`）

点击快捷入口 → 预填输入框并聚焦（不自动发送，让用户可以修改）。

样式：2×2 网格，每个卡片有图标+标题+一行描述，hover 有微妙背景变化。

### 2. ProactiveToast 预填输入框
**文件**: `src/renderer/components/ProactiveToast.vue`

点击 toast → emit `act` 事件，携带 context。
**文件**: `src/renderer/components/ChatView.vue` 或 `App.vue`

监听 `act` 事件 → 根据 signal.reason 生成预填文本，写入 ChatInput。

预填逻辑：
- `error_detected` → `我看到屏幕上有错误：${context.snippet}，帮我分析一下`
- `rapid_app_switching` → `我在 ${context.currentApp} 里遇到问题了，帮我看看`
- `idle_checkin` → `（空，直接聚焦输入框）`

需要 ChatInput 暴露 `prefill(text: string)` 方法（通过 `defineExpose`）。

### 3. Settings 侧滑面板
**文件**: `src/renderer/components/SettingsPanel.vue`

从全屏覆盖改为右侧滑入面板：
- 宽度 380px，从右侧 slide in（`transform: translateX(100%)` → `translateX(0)`）
- 背景半透明遮罩（点击遮罩关闭）
- 不覆盖整个 app，只覆盖右侧

## P1 — 工具调用状态可见

### 4. ToolStep 状态优化
**文件**: `src/renderer/components/chat/ToolStep.vue`

running 状态加 spinner（CSS animation，不用库）。
complete 状态加绿色 checkmark。
error 状态加红色 ✕。
每个 tool step 显示耗时（`durationMs`）。

## 约束
- 不加新 npm 依赖
- 不改 workspace-db schema
- 不改 IPC 协议
- 编译必须通过（`npx electron-vite build`）
