/**
 * AgentManager — Infrastructure Layer
 *
 * Manages multiple agent configurations for multi-agent conversations.
 * Each agent has its own model, system prompt, and tool access.
 *
 * MOMO-50: Multi-agent support
 */

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface AgentConfig {
  id: string
  name: string
  description?: string
  model?: string
  provider?: 'anthropic' | 'openai'
  apiKey?: string
  baseUrl?: string
  systemPrompt?: string
  tools?: string[] // Tool names this agent can use (empty = all tools)
  color?: string // UI color for this agent
  avatar?: string // Emoji or icon
}

export interface AgentManagerConfig {
  defaultAgent: string
  agents: AgentConfig[]
}

const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'default',
    name: 'Watson',
    description: 'General-purpose assistant',
    avatar: '🤖',
    color: '#3b82f6',
  },
  {
    id: 'coder',
    name: 'Coder',
    description: 'Specialized in coding tasks',
    avatar: '👨‍💻',
    color: '#10b981',
    systemPrompt: 'You are a coding specialist. Focus on writing clean, efficient code.',
  },
  {
    id: 'researcher',
    name: 'Researcher',
    description: 'Specialized in research and analysis',
    avatar: '🔬',
    color: '#8b5cf6',
    systemPrompt: 'You are a research specialist. Focus on thorough analysis and fact-checking.',
  },
]

export class AgentManager {
  private config: AgentManagerConfig
  private configPath: string

  constructor(workspacePath: string) {
    this.configPath = join(workspacePath, '.watson', 'agents.json')
    this.config = this.loadConfig()
  }

  private loadConfig(): AgentManagerConfig {
    if (existsSync(this.configPath)) {
      try {
        const content = readFileSync(this.configPath, 'utf8')
        return JSON.parse(content)
      } catch (err) {
        console.warn('[agent-manager] Failed to load agents.json, using defaults:', err)
      }
    }

    // Return default config
    return {
      defaultAgent: 'default',
      agents: DEFAULT_AGENTS,
    }
  }

  saveConfig(): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8')
    } catch (err) {
      console.error('[agent-manager] Failed to save agents.json:', err)
    }
  }

  getAgent(id: string): AgentConfig | undefined {
    return this.config.agents.find((a) => a.id === id)
  }

  getDefaultAgent(): AgentConfig {
    const agent = this.getAgent(this.config.defaultAgent)
    if (!agent) {
      // Fallback to first agent
      return this.config.agents[0] || DEFAULT_AGENTS[0]
    }
    return agent
  }

  listAgents(): AgentConfig[] {
    return this.config.agents
  }

  addAgent(agent: AgentConfig): void {
    // Check for duplicate ID
    if (this.config.agents.some((a) => a.id === agent.id)) {
      throw new Error(`Agent with id '${agent.id}' already exists`)
    }
    this.config.agents.push(agent)
    this.saveConfig()
  }

  updateAgent(id: string, updates: Partial<AgentConfig>): void {
    const index = this.config.agents.findIndex((a) => a.id === id)
    if (index === -1) {
      throw new Error(`Agent with id '${id}' not found`)
    }
    this.config.agents[index] = { ...this.config.agents[index], ...updates }
    this.saveConfig()
  }

  removeAgent(id: string): void {
    const index = this.config.agents.findIndex((a) => a.id === id)
    if (index === -1) {
      throw new Error(`Agent with id '${id}' not found`)
    }
    this.config.agents.splice(index, 1)
    this.saveConfig()
  }

  setDefaultAgent(id: string): void {
    if (!this.getAgent(id)) {
      throw new Error(`Agent with id '${id}' not found`)
    }
    this.config.defaultAgent = id
    this.saveConfig()
  }

  /**
   * Parse @mentions from message text.
   * Returns the agent ID if found, otherwise undefined.
   *
   * Examples:
   *   "@coder write a function" -> "coder"
   *   "@researcher find info about X" -> "researcher"
   *   "hello world" -> undefined
   */
  parseAgentMention(text: string): string | undefined {
    const match = text.match(/^@(\w+)\s/)
    if (match) {
      const agentId = match[1]
      if (this.getAgent(agentId)) {
        return agentId
      }
    }
    return undefined
  }

  /**
   * Remove @mention from message text.
   */
  stripAgentMention(text: string): string {
    return text.replace(/^@\w+\s/, '')
  }
}
