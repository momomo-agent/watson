
## Phase 6 待做（2026-04-08）

### 多 Provider 配置
- config.json 改成 providers 数组
- 每个 provider 有 name/type/apiKey/baseUrl/models
- 设置面板改成 provider 列表（增删改）
- 对话界面模型选择器支持多 provider

### 语音功能
- 引入 agentic-voice（~/LOCAL/momo-agent/projects/agentic/packages/voice）
- TTS：AI 回复朗读，优先 ElevenLabs，key 在 config.json
- STT：语音输入，browser 模式（Web Speech API）
- config.json 加 voice 配置块

### agentic 家族引用
- Watson 引用 agentic-voice 改成 monorepo workspace 协议
- 检查其他 agentic 包的引用方式

## 进度（2026-04-08 19:12）

### 已完成
- config.json 改成 providers 数组格式 ✅
- Config interface 加 ProviderConfig/VoiceConfig ✅
- normalizeConfig 支持新旧格式转换 ✅

### 编译错误
- pnpm build 失败，需要检查 TypeScript 错误
- 可能是 ProviderConfig 类型未导出

### 待继续
- 修复编译错误
- 改 LLMClient 使用选中的 provider
- 改设置面板 UI（provider 列表）
- 加语音功能（agentic-voice）
