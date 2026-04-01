export class CodingAgentSession {
  id: string
  workspace: string
  agentType: 'aws-code' | 'codex'
  status: 'idle' | 'running' | 'complete' | 'error' = 'idle'

  constructor(id: string, workspace: string, agentType: 'aws-code' | 'codex') {
    this.id = id
    this.workspace = workspace
    this.agentType = agentType
  }

  async start(task: string): Promise<void> {
    this.status = 'running'
    // 启动 coding agent
    console.log(`Starting ${this.agentType} for task: ${task}`)
  }

  async cancel(): Promise<void> {
    this.status = 'idle'
  }
}
