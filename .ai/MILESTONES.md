# Watson 里程碑计划（完整版）

## 总览

**总里程碑数：10 个**
**预计时间：3 周**
**当前进度：M1 (10%)**

---

## M1: 核心对话 ✅ (已完成 90%)
**时间：** Day 1-3
**状态：** 🟢 进行中

### 功能
- [x] 发送消息
- [x] LLM streaming（Anthropic + OpenAI）
- [x] Markdown 渲染
- [x] Cancel/Retry
- [x] 错误处理
- [ ] 端到端测试

### 验收标准
- 发送消息立刻显示
- Streaming 实时更新
- 错误清晰显示
- Cancel/Retry 正常

---

## M2: Provider 增强
**时间：** Day 4
**状态：** 📋 待开始

### 功能
- [ ] 自动 failover
- [ ] Retry 机制（指数退避）
- [ ] Rate limit 处理
- [ ] Timeout 保护

### 验收标准
- API 失败自动切换 provider
- Rate limit 自动等待
- Timeout 正确处理

---

## M3: 工具系统（基础）
**时间：** Day 5-7
**状态：** 📋 待开始

### 功能
- [ ] file_read
- [ ] file_write
- [ ] shell_exec
- [ ] notify

### 验收标准
- 4 个工具全部可用
- 工具错误正确处理
- 工具结果显示

---

## M4: 工具系统（完整）
**时间：** Day 8-10
**状态：** 📋 待开始

### 功能
- [ ] search
- [ ] code_exec
- [ ] ui_status_set
- [ ] skill_exec
- [ ] Loop detection
- [ ] 最多 5 轮调用

### 验收标准
- 8 个工具全部可用
- Loop detection 防止死循环
- 工具步骤折叠/展开

---

## M5: Workspace 管理
**时间：** Day 11-13
**状态：** 📋 待开始

### 功能
- [ ] WorkspaceManager
- [ ] 多 workspace 支持
- [ ] Workspace 切换
- [ ] Session 隔离

### 验收标准
- 可以创建/切换 workspace
- Session 完全隔离
- 配置独立

---

（第 1 部分结束，继续第 2 部分）
## M6: Heartbeat & Cron
**时间：** Day 14-15
**状态：** 📋 待开始

### 功能
- [ ] HeartbeatScheduler
- [ ] CronScheduler
- [ ] 定时触发
- [ ] Heartbeat requestId 隔离

### 验收标准
- Heartbeat 按时触发
- Cron 任务正常执行
- 不干扰手动对话

---

## M7: Coding Agent
**时间：** Day 16-17
**状态：** 📋 待开始

### 功能
- [ ] CodingAgentSession
- [ ] AWS Code 集成
- [ ] Codex 集成
- [ ] ProcessManager

### 验收标准
- 可以启动 coding agent
- 进程管理正常
- 输出正确显示

---

## M8: MCP 协议
**时间：** Day 18
**状态：** 📋 待开始

### 功能
- [ ] MCPSession
- [ ] MCP client
- [ ] MCP 工具调用

### 验收标准
- 可以连接 MCP server
- MCP 工具可用

---

## M9: 持久化 & UI
**时间：** Day 19-20
**状态：** 📋 待开始

### 功能
- [ ] SQLite 存储
- [ ] 消息历史持久化
- [ ] Session 恢复
- [ ] AI Native Menubar
- [ ] Scrollbar 美化

### 验收标准
- 重启后恢复对话
- UI 完整美观

---

## M10: 打磨 & 发布
**时间：** Day 21
**状态：** 📋 待开始

### 功能
- [ ] 全面测试
- [ ] Bug 修复
- [ ] 性能优化
- [ ] 打包签名
- [ ] 发布 v1.0

### 验收标准
- 所有功能测试通过
- 无已知 blocker
- 性能流畅

---

## 进度总结

| 里程碑 | 状态 | 完成度 |
|--------|------|--------|
| M1: 核心对话 | 🟢 进行中 | 90% |
| M2: Provider 增强 | 📋 待开始 | 0% |
| M3: 工具系统（基础） | 📋 待开始 | 0% |
| M4: 工具系统（完整） | 📋 待开始 | 0% |
| M5: Workspace 管理 | 📋 待开始 | 0% |
| M6: Heartbeat & Cron | 📋 待开始 | 0% |
| M7: Coding Agent | 📋 待开始 | 0% |
| M8: MCP 协议 | 📋 待开始 | 0% |
| M9: 持久化 & UI | 📋 待开始 | 0% |
| M10: 打磨 & 发布 | 📋 待开始 | 0% |

**总体进度：9%**
