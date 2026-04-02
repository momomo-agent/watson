# Phase 5.4: MCP 协议

## 目标

支持 Model Context Protocol (MCP) 服务器连接。

## 最小实现

### 1. MCP 配置

读取 `~/.watson/mcp.json`：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  }
}
```

### 2. MCPClient

```typescript
class MCPClient {
  connect(config: MCPConfig): void
  listTools(): Tool[]
  callTool(name: string, args: any): Promise<any>
}
```

## 验收标准

- [ ] 能读取 MCP 配置
- [ ] 能连接 MCP 服务器
- [ ] 能列出工具
- [ ] 能调用工具

## 非目标

- 不做 UI 配置
- 不做多服务器管理
