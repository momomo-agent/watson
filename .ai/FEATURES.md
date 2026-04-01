# Watson 完整功能清单（对齐 Paw v0.12.0）

## 核心功能模块

### 1. 对话系统
- [x] 发送文本消息
- [x] LLM streaming 回复
- [x] Markdown 渲染
- [x] Cancel 请求
- [x] Retry 失败消息
- [ ] 消息历史持久化
- [ ] 对话导出

### 2. Provider 支持
- [x] Anthropic API
- [x] OpenAI API
- [ ] 自动 failover
- [ ] Retry 机制
- [ ] Rate limit 处理

### 3. 工具系统（8 个内置工具）
- [ ] search - 网页搜索
- [ ] code_exec - 代码执行
- [ ] file_read - 文件读取
- [ ] file_write - 文件写入
- [ ] shell_exec - Shell 命令
- [ ] notify - 系统通知
- [ ] ui_status_set - UI 状态更新
- [ ] skill_exec - Skill 执行

### 4. 工具调用机制
- [ ] 最多 5 轮自动调用
- [ ] Loop detection
- [ ] 工具结果显示
- [ ] 工具步骤折叠/展开

### 5. Workspace 管理
- [ ] 多 workspace 支持
- [ ] Workspace 切换
- [ ] Workspace 配置
- [ ] Session 隔离

### 6. Heartbeat & Cron
- [ ] Heartbeat 调度器
- [ ] Cron 任务
- [ ] 定时触发
- [ ] Heartbeat requestId 隔离

### 7. Coding Agent
- [ ] AWS Code 集成
- [ ] Codex 集成
- [ ] Delegate 机制
- [ ] 进程管理

### 8. MCP 协议
- [ ] MCP client
- [ ] MCP 工具调用
- [ ] MCP server 管理

### 9. UI 功能
- [ ] AI Native Menubar
- [ ] 实时状态文字
- [ ] 右键菜单
- [ ] Per-Card 状态行
- [ ] Scrollbar 美化
- [ ] 防水平溢出

### 10. Session 管理
- [ ] Session 切换
- [ ] 后台请求保留
- [ ] Session 过期
- [ ] Session 清理

### 11. 持久化
- [ ] SQLite 存储
- [ ] 消息历史
- [ ] 配置持久化
- [ ] Session 恢复

### 12. 其他
- [ ] 未读消息计数
- [ ] Menubar badge
- [ ] App icon
- [ ] 错误分类
- [ ] 日志系统
