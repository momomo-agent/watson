# MOMO-50 验证清单

## 开发环境验证

### 1. 代码完整性 ✅
- [x] 5 个新文件已创建
- [x] 8 个文件已修改
- [x] 所有文件包含 agentId 相关代码
- [x] Git commit 已提交

### 2. 核心功能实现 ✅
- [x] AgentManager 类实现
- [x] @mention 解析功能
- [x] Agent CRUD 操作
- [x] 数据库 schema 更新
- [x] IPC handlers 添加
- [x] UI 组件创建

## 运行时验证（待测试）

### 3. 数据库迁移
```bash
cd /Users/kenefe/LOCAL/momo-agent/projects/watson
./migrate-agent-id.sh
```
- [ ] 迁移脚本执行成功
- [ ] agent_id 列已添加
- [ ] 现有数据未损坏

### 4. 应用启动
```bash
npm run dev
```
- [ ] 应用正常启动
- [ ] 无 TypeScript 编译错误
- [ ] 无运行时错误

### 5. Agent 选择器 UI
- [ ] 输入框左侧显示 agent 按钮
- [ ] 点击显示下拉菜单
- [ ] 列出所有 agent（默认 3 个）
- [ ] 显示 avatar、名称、描述
- [ ] 选中 agent 高亮显示
- [ ] "⚙️ Manage Agents" 按钮可见

### 6. Agent 管理对话框
- [ ] 点击 "Manage Agents" 打开对话框
- [ ] 显示所有 agent 卡片
- [ ] 默认 agent 有 "Default" 标记
- [ ] 点击 "➕ Add New Agent" 打开表单
- [ ] 表单字段正确显示
- [ ] 保存新 agent 成功
- [ ] 编辑 agent 成功
- [ ] 删除 agent 成功（非默认）
- [ ] 设置默认 agent 成功

### 7. @mention 路由
发送消息测试：
```
@coder write a hello world function
```
- [ ] 消息正确发送
- [ ] @mention 被解析
- [ ] 路由到 Coder agent
- [ ] 消息内容移除 @coder 前缀
- [ ] 响应显示 Coder agent 头像

### 8. Agent 配置应用
创建自定义 agent：
```json
{
  "id": "test",
  "name": "Test Agent",
  "model": "claude-sonnet-4",
  "systemPrompt": "You are a test agent. Always start with 'TEST:'"
}
```
- [ ] 自定义 agent 出现在列表
- [ ] 选择自定义 agent 发送消息
- [ ] 使用指定的 model
- [ ] 应用自定义 systemPrompt
- [ ] 响应符合预期

### 9. 消息持久化
- [ ] 发送消息后刷新应用
- [ ] 历史消息正确加载
- [ ] Agent 头像和名称正确显示
- [ ] 不同 agent 的消息可区分

### 10. 边界情况
- [ ] 无效 @mention 不崩溃（@invalid）
- [ ] 空 agent 列表处理正确
- [ ] 删除当前使用的 agent 处理正确
- [ ] 长 agent 名称显示正常
- [ ] 特殊字符 agent ID 处理正确

## 性能验证

### 11. 响应速度
- [ ] Agent 选择器打开 < 100ms
- [ ] Agent 管理对话框打开 < 200ms
- [ ] @mention 解析 < 10ms
- [ ] Agent 配置加载 < 50ms

### 12. 内存占用
- [ ] 多个 agent 不增加显著内存
- [ ] Agent 配置缓存正确
- [ ] 无内存泄漏

## 文档验证

### 13. 文档完整性 ✅
- [x] MOMO-50-MULTI-AGENT.md 完整
- [x] MOMO-50-REPORT.md 完整
- [x] 代码注释清晰
- [x] Git commit message 规范

## 测试命令

```bash
# 1. 验证文件结构
node test-multi-agent-simple.cjs

# 2. 运行数据库迁移
./migrate-agent-id.sh

# 3. 启动开发服务器
npm run dev

# 4. 构建生产版本
npm run build

# 5. 检查 TypeScript 类型
npx tsc --noEmit
```

## 已知限制

1. **Agent 配置不支持热重载** - 需要重启应用
2. **@mention 只支持单词字符** - 不支持 `@agent-name`
3. **Agent 删除不检查引用** - 可能导致历史消息显示异常
4. **工具过滤未完全实现** - agent.tools 配置暂未生效

## 下一步

1. [ ] 运行完整测试套件
2. [ ] 修复发现的 bug
3. [ ] 优化 UI 交互
4. [ ] 添加单元测试
5. [ ] 更新用户文档
6. [ ] 发布 release notes

---

**当前状态：** 开发完成 ✅  
**待验证：** 运行时测试  
**预计时间：** 30 分钟测试
