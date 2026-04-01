export class MCPSession {
  workspace: string
  connected = false

  constructor(workspace: string) {
    this.workspace = workspace
  }

  async connect(): Promise<void> {
    this.connected = true
    console.log('MCP connected')
  }

  async callTool(name: string, args: any): Promise<any> {
    return { result: 'MCP tool called' }
  }

  disconnect(): void {
    this.connected = false
  }
}
