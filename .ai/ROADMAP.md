# Watson 完整清单和计划

## 当前状态（2026-04-01）

**已完成：**
- ✅ M1 核心对话功能
- ✅ 架构修复（9/10）
- ✅ 代码质量（7.5/10）
- ✅ Production build
- ✅ StatusIndicator
- ✅ 工具翻译器

**Git commits: 17**

---

## 功能清单

### Phase 1: 核心对话 ✅
- [x] 发送消息
- [x] LLM streaming
- [x] Cancel/Retry
- [x] 错误处理
- [x] Markdown 渲染

### Phase 2: UI/UX 改进 🔄
- [x] StatusIndicator（左下角圆点）
- [x] 简化消息状态
- [x] 工具翻译器
- [ ] 工具使用显示（人话）
- [ ] 状态悬停详情
- [ ] UI 清爽度优化
- [ ] Scrollbar 美化

### Phase 3: 屏幕感知 📋
- [ ] 集成 agent-control
- [ ] 当前窗口内容获取
- [ ] 正在看的文章识别
- [ ] 剪贴板（低优先级）

### Phase 4: 工具系统 📋
- [ ] 8 个工具实现
- [ ] 工具调用循环
- [ ] Loop detection

### Phase 5: 高级功能 📋
- [ ] Workspace 管理
- [ ] Heartbeat & Cron
- [ ] Coding Agent
- [ ] MCP 协议
- [ ] 持久化

---

## 执行计划

### 本周（Week 1）
**目标：完成 Phase 2**

**Day 1-2（已完成）：**
- ✅ M1 核心对话
- ✅ 架构修复
- ✅ 基础 UI 改进

**Day 3-4：**
- [ ] 工具使用显示集成
- [ ] 状态悬停详情
- [ ] UI 清爽度优化

**Day 5-7：**
- [ ] Scrollbar 美化
- [ ] 屏幕感知集成
- [ ] Phase 2 验收

### Week 2
**目标：完成 Phase 3 + Phase 4**

### Week 3
**目标：完成 Phase 5**

---

## 下一步行动

**立即开始：**
1. 在 MessageCard 中集成工具翻译器
2. 添加状态悬停详情
3. 优化 UI 清爽度

**优先级：**
- P0: 工具使用显示（kenefe 强调）
- P0: UI 清爽度（kenefe 反馈）
- P1: 屏幕感知
- P2: 其他功能
