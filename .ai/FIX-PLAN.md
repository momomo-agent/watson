# Watson 修复计划（基于 4 个 agent 审查结果）

## 汇总

**checker**: 3.5/10，8 个 P0 问题
**architecture-reviewer**: 7/10，3 处严重违规
**developer**: 修复了 10 个核心问题，M1 功能可用
**tester**: 启动成功，核心功能通过，发现 6 个 bug

## 待修复问题（按优先级）

### P0 - 必须修复
1. [x] getHistory() 缺失 → developer 已修复
2. [x] listener 泄漏 → developer 已修复
3. [ ] preload 路径不匹配（production build 会失败）
4. [ ] 硬编码 agentic-core 绝对路径
5. [ ] Domain 直接依赖 Infrastructure（架构违规）

### P1 - 应该修复
6. [ ] IPC handlers 移到 application 层
7. [ ] Tool 执行超时控制
8. [ ] 配置验证

### P2 - 可以改进
9. [ ] DevTools 控制
10. [ ] 删除未使用的空壳模块
