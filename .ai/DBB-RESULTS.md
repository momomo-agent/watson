# Watson Phase 7 — DBB 测试结果

日期: 2026-04-10

## 测试环境
- Watson Electron app (Phase 7 build)
- macOS, Mac mini M4
- agent-control electron driver

## ✅ 通过

1. **启动** — app 正常启动，显示空对话界面
2. **发送消息** — 输入"你好"，AI 正常回复（streaming）
3. **多轮对话** — 追问"讲个笑话"，AI 正常回复，上下文保持
4. **新建 Session** — 点 `+` 创建新 session，右侧清空
5. **Session 隔离** — 新 session 发"1+1等于几"，独立回答，不混入旧对话
6. **Session 切换** — 点回第一个 session，历史完整保留
7. **Settings 页面** — 正常打开，显示 Provider/MCP/Heartbeat/Cron 配置
8. **Dark Mode 切换** — 选 Dark 后界面变暗，视觉正确
9. **Markdown 渲染** — 标题、代码块（语法高亮）、列表正确渲染
10. **模型选择器** — 下拉菜单弹出，显示模型列表

## ❌ 问题

### P1: Session 标题不自动生成
- 所有 session 都显示 "New Chat"
- 应该从第一条消息自动生成标题（如"你好"、"1+1等于几"）
- 影响：用户无法区分不同 session

### P2: 侧边栏 Session 列表异常
- 实际只创建了 2-3 个 session，但侧边栏显示 8 个 "New Chat"
- 可能是空 session 被重复创建，或渲染 bug

### P3: 模型选择下拉菜单溢出
- 下拉菜单向下弹出，但底部空间不够（y=768 超出窗口）
- 模型列表被截断或不可见
- 应该向上弹出或自适应方向

### P4: Session 无法删除/重命名
- 右键无菜单，无删除/重命名入口
- 用户无法管理 session 列表

### P5: Dark Mode 持久化问题
- 切换到 Dark 后，重新打开 Settings，select 值显示 "light"
- 实际界面是 dark 的，但 select 状态不同步
- 可能是 Settings 组件初始化时没读取当前主题

### P6: @mention 功能未实现
- 输入 @ 后无 agent 列表弹出
- placeholder 提示 "@agent to mention" 但功能不可用
