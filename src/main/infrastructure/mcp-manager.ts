import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
}

interface McpTool {
  serverName: string
  originalName: string
  name: string
  description: string
  inputSchema: any
}

interface McpServerInfo {
  client: Client | null
  transport: StdioClientTransport | null
  status: 'connected' | 'error' | 'disconnected'
  error?: string
  tools: McpTool[]
}

export class McpManager {
  private clients = new Map<string, McpServerInfo>()

  private validateConfig(name: string, cfg: any): string | null {
    if (!cfg || typeof cfg !== 'object') return `${name}: config must be an object`
    if (!cfg.command || typeof cfg.command !== 'string') return `${name}: command is required`
    if (cfg.args !== undefined && !Array.isArray(cfg.args)) return `${name}: args must be string[]`
    if (cfg.env !== undefined && (typeof cfg.env !== 'object' || Array.isArray(cfg.env))) {
      return `${name}: env must be Record<string, string>`
    }
    return null
  }

  async connectAll(mcpServers: Record<string, McpServerConfig>): Promise<void> {
    if (!mcpServers || typeof mcpServers !== 'object') return

    for (const [name, cfg] of Object.entries(mcpServers)) {
      if (cfg.disabled) continue

      const err = this.validateConfig(name, cfg)
      if (err) {
        console.warn(`[MCP] Invalid config: ${err}`)
        continue
      }

      try {
        await this.connectServer(name, cfg)
      } catch (e: any) {
        console.warn(`[MCP] Failed to connect ${name}: ${e.message}`)
        this.clients.set(name, {
          client: null,
          transport: null,
          status: 'error',
          error: e.message,
          tools: []
        })
      }
    }
  }

  private async connectServer(name: string, cfg: McpServerConfig): Promise<void> {
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries({ ...process.env, ...(cfg.env || {}) })) {
      if (v !== undefined) env[k] = v
    }

    const transport = new StdioClientTransport({
      command: cfg.command,
      args: cfg.args || [],
      env
    })

    const client = new Client({
      name: 'watson',
      version: '0.1.0'
    }, {
      capabilities: {}
    })

    await client.connect(transport)

    let tools: McpTool[] = []
    try {
      const result = await client.listTools()
      tools = (result.tools || []).map(t => ({
        serverName: name,
        originalName: t.name,
        name: `mcp__${name}__${t.name}`.slice(0, 128),
        description: `[MCP: ${name}] ${t.description || t.name}`,
        inputSchema: t.inputSchema || { type: 'object', properties: {} }
      }))
    } catch (e: any) {
      console.warn(`[MCP] Failed to list tools from ${name}: ${e.message}`)
    }

    this.clients.set(name, { client, transport, status: 'connected', tools })
    console.log(`[MCP] Connected: ${name} (${tools.length} tools)`)
  }

  listTools(): Array<{ name: string; description: string; input_schema: any }> {
    const tools: Array<{ name: string; description: string; input_schema: any }> = []
    for (const info of this.clients.values()) {
      if (info.status === 'connected' && info.tools) {
        for (const t of info.tools) {
          tools.push({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema
          })
        }
      }
    }
    return tools
  }

  async callTool(fullName: string, args: any): Promise<string> {
    for (const info of this.clients.values()) {
      if (info.status !== 'connected') continue
      const tool = info.tools.find(t => t.name === fullName)
      if (tool && info.client) {
        try {
          const result = await info.client.callTool({ name: tool.originalName, arguments: args })
          if (result.content && Array.isArray(result.content)) {
            return result.content.map(c => (c as any).text || JSON.stringify(c)).join('\n')
          }
          return JSON.stringify(result)
        } catch (e: any) {
          return `MCP tool error (${tool.serverName}/${tool.originalName}): ${e.message}`
        }
      }
    }
    return `Error: MCP tool not found: ${fullName}`
  }

  isMcpTool(name: string): boolean {
    return name.startsWith('mcp__')
  }

  async disconnectAll(): Promise<void> {
    for (const [name, info] of this.clients) {
      try {
        if (info.transport) {
          await info.transport.close()
        }
      } catch (e: any) {
        console.warn(`[MCP] Error disconnecting ${name}: ${e.message}`)
      }
    }
    this.clients.clear()
  }

  getStatus(): Record<string, { status: string; toolCount: number; error: string | null }> {
    const status: Record<string, { status: string; toolCount: number; error: string | null }> = {}
    for (const [name, info] of this.clients) {
      status[name] = {
        status: info.status,
        toolCount: info.tools?.length || 0,
        error: info.error || null
      }
    }
    return status
  }

  async reconnect(mcpServers: Record<string, McpServerConfig>): Promise<void> {
    await this.disconnectAll()
    await this.connectAll(mcpServers)
  }
}
