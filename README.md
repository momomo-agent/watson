# Watson

AI 桌面工作台。本地运行，对话式交互，内置工具系统。

## 安装

下载 [Watson-0.1.0-arm64.dmg](https://github.com/momomo-agent/watson/releases)，拖入 Applications。

> macOS Apple Silicon (M1/M2/M3/M4)。已签名 + 公证。

## 配置

首次打开后点左下角 Settings，添加 Provider：

| Provider | 需要 | 获取 |
|----------|------|------|
| Anthropic | API Key | [console.anthropic.com](https://console.anthropic.com/) |
| OpenAI | API Key | [platform.openai.com](https://platform.openai.com/) |

填好 API Key 后选择模型即可开始对话。

## 功能

- 对话 + Streaming 回复 + Markdown 渲染
- 8 个内置工具（文件读写、Shell 执行、搜索、屏幕截图等）
- 多 Session 管理 + 历史持久化
- MCP Server 支持
- Cron 定时任务
- 多 Agent 配置（含 Coding Agent 模式）
- 亮/暗主题

## 开发

```bash
pnpm install
pnpm dev
```

## 技术栈

Electron 41 + Vue 3 + TypeScript + Vite + better-sqlite3

## License

MIT
