# Watson MCP Client

Watson 现已支持 Model Context Protocol (MCP)，可以连接和调用 MCP 服务器提供的工具。

## 功能特性

- ✅ MCP 协议实现（stdio 传输）
- ✅ 工具发现和调用
- ✅ 错误处理和重连
- ✅ 与内置工具无缝集成
- ✅ 配置文件支持

## 配置

在工作区的 `.watson/config.json` 中添加 `mcpServers` 配置：

```json
{
  "provider": "anthropic",
  "apiKey": "your-api-key",
  "model": "claude-sonnet-4-20250514",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "disabled": false
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "your-token"
      }
    }
  }
}
```

## 工具命名

MCP 工具会自动添加前缀：`mcp__{serverName}__{toolName}`

例如：
- `mcp__filesystem__read_file`
- `mcp__github__create_issue`

## 测试

```bash
# 构建项目
pnpm build

# 测试 MCP 连接
node test-mcp.js
```

## 架构

```
src/main/
├── infrastructure/
│   ├── mcp-manager.ts      # MCP 客户端核心
│   ├── tool-runner.ts      # 工具执行器（支持 MCP）
│   ├── tools.ts            # 内置工具定义
│   └── config.ts           # 配置加载
├── application/
│   ├── workspace-manager.ts # 工作区管理（集成 MCP）
│   └── chat-handlers.ts    # IPC 处理器
└── domain/
    └── chat-session.ts     # 会话管理
```

## 实现细节

1. **连接管理**：启动时自动连接配置的 MCP 服务器
2. **工具合并**：内置工具 + MCP 工具统一传递给 LLM
3. **工具调用**：ToolRunner 自动识别和路由 MCP 工具
4. **错误处理**：连接失败不影响内置工具使用

## 参考

- MCP SDK: `@modelcontextprotocol/sdk`
- 参考实现: `/Users/kenefe/LOCAL/momo-agent/projects/paw/core/mcp-client.js`
