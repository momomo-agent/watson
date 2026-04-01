# Watson 验证测试清单

## 编译检查
- [ ] TypeScript 编译无错误
- [ ] 无 console.error
- [ ] 所有模块正确导入

## M1: 核心对话
- [ ] UI 正常显示
- [ ] 输入框可用
- [ ] 发送按钮可点击
- [ ] 配置文件正确加载

## M2: Provider 增强
- [ ] EnhancedLLMClient 正确导入
- [ ] Retry 逻辑存在

## M3-M4: 工具系统
- [ ] ToolRunner 正确导入
- [ ] 8 个工具方法存在

## M5: Workspace
- [ ] WorkspaceManager 正确导入
- [ ] IPC handlers 使用 WorkspaceManager

## M6-M8: 调度器和 Agent
- [ ] HeartbeatScheduler 存在
- [ ] CronScheduler 存在
- [ ] CodingAgentSession 存在
- [ ] MCPSession 存在

## M9: 持久化
- [ ] Storage 模块存在

## 当前状态
开始验证...
