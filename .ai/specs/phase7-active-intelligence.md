# Phase 7A: Active Intelligence (主动智能)

## WHY

Watson 现在是被动的——用户发消息才回复。主动智能让 Watson 持续感知用户在做什么，在合适的时机主动提供帮助。这是桌面 AI 工作台和 web chatbot 的本质区别。

## 现状

- `SenseLoop` 类已写好（sense-loop.ts），但没启动
- `ChatSession.setSenseContext()` 接口在
- `agent-control -p macos snapshot` 可用
- agentic 主包有 `ai.sense()` / `ai.think()` / `ai.perceive()` 接口
- 没有本地模型推理能力

## 架构

```
SenseLoop (5s tick)
  ├── capture: agent-control snapshot → raw AX tree
  ├── infer: 本地模型 → SenseContext (activity/app/summary)
  ├── change detection: 有意义的变化才 emit
  └── emit → ChatSession.setSenseContext()
                └── 注入到下次 LLM 调用的 system prompt
```

## 任务

### T1: 启动 SenseLoop

文件: `src/main/index.ts`

1. 在 app ready 后创建 SenseLoop 实例
2. 注入 agentic 实例: `senseLoop.setAgentic(ai)`
3. 调用 `senseLoop.start()`
4. 监听 `context` 事件，更新所有活跃 ChatSession 的 senseContext
5. 添加 IPC handler `sense:status` 返回当前感知状态
6. 添加 IPC handler `sense:toggle` 开关感知

### T2: 增强 infer 阶段

文件: `src/main/domain/sense-loop.ts`

现在 infer 只做基础 label 提取。增强为：

1. 从 AX tree 提取结构化信息：
   - activeApp（当前前台应用）
   - activeWindow（窗口标题）
   - visibleText（关键可见文本，截断到 500 字）
   - focusedElement（当前焦点元素）
2. 用 diff 算法检测变化（不只是 activeApp 变了）：
   - 窗口切换
   - 文档内容变化（编辑器里的文件名变了）
   - URL 变化（浏览器）
3. 变化检测加权重：app 切换 > 窗口切换 > 内容变化

### T3: Context 注入到 LLM 调用

文件: `src/main/domain/chat-session.ts`

1. `executeStream` 开头检查 `this.senseContext`
2. 如果有，构建 ambient context block 注入到 system prompt：
   ```
   [当前环境]
   用户正在使用: {activeApp} - {activeWindow}
   屏幕内容摘要: {screenSummary}
   ```
3. 不要每次都注入——只在 context 有变化时注入（对比上次注入的 timestamp）

### T4: UI 感知状态指示器

文件: 新建 `src/renderer/components/SenseIndicator.vue`

1. 小圆点指示器，显示在窗口右上角或状态栏
2. 绿色 = 感知运行中，灰色 = 关闭
3. hover 显示当前感知到的 app/activity
4. 点击可开关感知
5. 集成到主布局

### T5: 主动消息（proactive）

文件: `src/main/domain/sense-loop.ts` + `chat-session.ts`

1. SenseLoop 新增 `proactive` 事件：当检测到用户可能需要帮助时 emit
   - 触发条件：用户在同一个错误页面停留 >30s
   - 触发条件：用户频繁切换窗口（>5次/30s，可能在找东西）
   - 触发条件：终端里出现 error/exception 关键词
2. ChatSession 收到 proactive 事件后，自动发一条 system message 给 LLM
3. LLM 决定是否要主动说话（prompt 里说明"只在真正有帮助时才主动发言"）
4. UI 上主动消息有特殊样式（区别于用户触发的回复）

## 约束

- capture 用 `agent-control -p macos snapshot --compact`，不要自己写 AX 访问
- 不依赖云端 API 做感知推理（capture + infer 全本地）
- 5s 间隔，单次 tick 必须 <1s（超时就跳过）
- 感知失败不影响正常对话
- 默认开启，用户可关闭
