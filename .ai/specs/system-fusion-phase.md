# Watson Phase 8: 系统融合

## WHY

Watson 有 14 个工具、感知引擎、skill 系统，但用起来不"轻松"。
核心问题：Watson 是一个需要切窗口才能用的 app，不是一个融入系统的伙伴。

## 四个目标（按优先级）

### 1. 持久化完整 — 重启无感
- 当前：persistence-handlers.ts + workspace-db.ts 已有 save/load/list
- 缺失：renderer 没调用 save，启动时没 load 恢复
- 要做：
  - ChatSession 每条消息自动 save（streaming 完成后）
  - 启动时从 SQLite load 上次的 sessions + messages
  - sidebar session 列表从 DB 读取，不是内存
  - 删除 session 同步删 DB

### 2. 全局快捷键 — Cmd+Shift+Space 呼出
- 用 Electron globalShortcut 注册
- 按下时：窗口隐藏→显示并聚焦输入框；窗口显示→隐藏
- 注册失败（被占用）静默降级，不报错

### 3. Menubar 常驻 + 状态感知
- TrayManager 已有基础，补充：
  - 显示当前状态（idle / thinking / tool_calling）
  - 状态变化时更新 tray tooltip
  - macOS: 关闭窗口 hide 不 quit（已实现）

### 4. 主动性激活 — ProactiveEngine 真正跑起来
- 当前：ProactiveEngine 代码完整但 signal 没连到 renderer
- 要做：
  - proactive:signal 事件推到 renderer
  - renderer 收到后在 sidebar 或 toast 显示提示
  - 用户点击提示 → 打开对话，预填 context
  - 默认 enabled=true，cooldown 120s

## 不做

- Spotlight 式搜索入口（太重）
- Finder 右键菜单（需要 extension）
- 通知中心集成（先用 toast）
- 自动感知当前项目（SenseLoop 已有，先不改）

## 技术约束

- 不改 workspace-db schema（已有的够用）
- 不改 SessionBus 架构
- 全局快捷键用 electron globalShortcut，不用第三方库
- renderer 侧改动集中在 composables/ 和现有组件
