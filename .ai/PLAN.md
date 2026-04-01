# Watson 开发计划与监控

## 总体目标

3 周内完成 Watson v1.0，100% 对齐 Paw 功能，代码量减少 74%。

## 里程碑

### M1: 核心对话（Week 1, Day 1-3）
**目标：** 用户可以发送消息并收到 LLM 回复
- [x] Day 1: 项目搭建 + Phase 1 代码实现
- [ ] Day 2: LLM 集成 + 测试验证
- [ ] Day 3: Bug 修复 + Review

**验收标准：**
- ✅ 发送消息立刻显示
- ✅ LLM streaming 实时更新
- ✅ 错误显示清晰
- ✅ Cancel/Retry 正常工作

### M2: Workspace 管理（Week 1, Day 4-7）
**目标：** 支持多 workspace + Heartbeat + Cron
- [ ] Day 4: WorkspaceManager + SessionManager
- [ ] Day 5: HeartbeatScheduler
- [ ] Day 6: CronScheduler
- [ ] Day 7: 测试 + Review

**验收标准：**
- ✅ 可以切换 workspace
- ✅ Heartbeat 按时触发
- ✅ Cron 任务正常执行

### M3: 工具系统（Week 2, Day 1-4）
**目标：** 8 个内置工具 + loop detection
- [ ] Day 1-2: ToolRunner 实现
- [ ] Day 3: Loop detection
- [ ] Day 4: 测试 + Review

**验收标准：**
- ✅ 8 个工具全部可用
- ✅ Loop detection 防止死循环
- ✅ 工具错误正确处理

### M4: Coding Agent（Week 2, Day 5-7）
**目标：** 集成 AWS Code / Codex
- [ ] Day 5-6: CodingAgentSession
- [ ] Day 7: 测试 + Review

### M5: MCP + 持久化（Week 3, Day 1-3）
**目标：** MCP 协议 + SQLite 持久化
- [ ] Day 1: MCPSession
- [ ] Day 2: Storage (SQLite)
- [ ] Day 3: 测试 + Review

### M6: 打磨 + 发布（Week 3, Day 4-7）
**目标：** 全面测试 + 打包发布
- [ ] Day 4-5: 全面测试
- [ ] Day 6: 打包 + 签名
- [ ] Day 7: 发布 v1.0

---

## 每日监控指标

### 代码质量
- [ ] 编译通过（0 errors）
- [ ] 类型检查通过
- [ ] 无 console.error

### 功能完整性
- [ ] 所有验收标准通过
- [ ] 无已知 blocker bug

### 进度
- [ ] 当天计划完成率 ≥ 80%
- [ ] 里程碑按时完成

---

## 当前状态（2026-04-01 16:04）

**已完成：**
- ✅ M1 Day 1: 项目搭建 + Phase 1 代码

**进行中：**
- 🔄 M1 Day 2: LLM 集成 + 测试验证

**下一步：**
1. 启动开发服务器
2. 验证 UI 正常显示
3. 实现真实 LLM 调用
4. 端到端测试

**风险：**
- ⚠️ Electron build scripts 问题（已解决）
- ⚠️ agentic-core 未发布（临时方案：自己实现 LLM client）
