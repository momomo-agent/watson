# Phase 3: 屏幕感知集成 - 验收测试

## 测试日期
2026-04-02

## 实现内容

### 1. ToolRunner 新增 screen_sense
- ✅ 添加 `screenSense()` 方法
- ✅ 调用 `agent-control -p macos snapshot`
- ✅ 使用正则提取 label 文本（避免 JSON 解析错误）
- ✅ 去重并限制输出（100 条）

### 2. LLM 工具定义
- ✅ 在 `llm-client.ts` 添加 screen_sense 工具
- ✅ 描述清晰：获取用户屏幕内容

### 3. UI 翻译
- ✅ `tool-translator.ts` 添加翻译：🖥️ 查看屏幕内容

## 手动测试步骤

### Test 1: 基础调用
1. 启动 Watson
2. 发送消息："看看我屏幕上有什么"
3. 预期：LLM 调用 screen_sense 工具
4. 预期：返回当前屏幕文本内容

### Test 2: 工具显示
1. 观察工具调用时的 UI
2. 预期：显示 "🖥️ 查看屏幕内容"
3. 预期：不显示原始工具名 "screen_sense"

### Test 3: 错误处理
1. 关闭所有窗口
2. 发送消息："看看我屏幕上有什么"
3. 预期：优雅处理空结果

## 验收标准

- [ ] screen_sense 工具能成功调用
- [ ] 能正确提取屏幕文本
- [ ] UI 显示正确的中文翻译
- [ ] 错误处理完善
- [ ] 构建无错误

## 状态

🔄 待 kenefe 验收
