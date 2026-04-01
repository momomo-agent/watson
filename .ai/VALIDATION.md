# Watson 验证测试清单

## 编译检查
- [x] TypeScript 编译通过（只有 deprecation 警告）
- [x] 修复 tool-runner.ts 语法错误
- [x] 修复 chat-handlers.ts 语法错误
- [ ] 运行时无 console.error

## M1: 核心对话
- [ ] UI 正常显示
- [ ] 输入框可用
- [ ] 发送按钮可点击
- [ ] 配置文件正确加载
- [ ] 实际发送消息测试

## 发现的问题
1. ✅ 已修复：tool-runner.ts 方法在类外面
2. ✅ 已修复：chat-handlers.ts 多余的大括号
3. ⚠️ 待验证：实际运行时是否有错误

## 下一步
需要实际测试 UI 和功能

