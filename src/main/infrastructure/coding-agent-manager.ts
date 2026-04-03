/**
 * CodingAgentManager — Infrastructure Layer
 * 
 * Detects and manages available coding agents (Claude Code, Codex, etc.)
 * Based on paw's coding-agents.js implementation.
 * 
 * MOMO-52: Coding Agent as Participant
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'

export interface CodingAgentConfig {
  id: string
  name: string
  description?: string
  avatar?: string
  color?: string
  useSdk?: boolean  // Use SDK (Claude Code)
  useAcp?: boolean  // Use ACP protocol
  bin?: string      // Binary name for CLI agents
  apiKey?: string   // API key for SDK agents
  baseUrl?: string
  model?: string
}

const COMMON_DIRS = [
  `${homedir()}/.npm-global/bin`,
  `${homedir()}/.volta/bin`,
  `${homedir()}/.bun/bin`,
  '/usr/local/bin',
  '/opt/homebrew/bin',
  `${homedir()}/.local/bin`,
]

function detectBin(name: string): string | null {
  try {
    const which = execSync(`which ${name} 2>/dev/null`, { encoding: 'utf8' }).trim()
    if (which && existsSync(which)) return which
  } catch {}
  
  for (const dir of COMMON_DIRS) {
    const p = `${dir}/${name}`
    if (existsSync(p)) return p
  }
  
  return null
}

export class CodingAgentManager {
  private available: string[] = []
  private binPaths = new Map<string, string>()
  private configs = new Map<string, CodingAgentConfig>()

  /**
   * Initialize and detect available coding agents.
   */
  init(agentConfigs: CodingAgentConfig[]): void {
    this.available = []
    this.binPaths.clear()
    this.configs.clear()

    for (const config of agentConfigs) {
      this.configs.set(config.id, config)

      if (config.useSdk) {
        // SDK agent (Claude Code) — available if API key is configured
        if (config.apiKey) {
          this.available.push(config.id)
          console.log(`[coding-agent] ${config.id} available (SDK, has API key)`)
        } else {
          console.log(`[coding-agent] ${config.id} skipped (no API key)`)
        }
      } else if (config.useAcp || config.bin) {
        // CLI/ACP agent — needs local binary
        const binPath = config.bin ? detectBin(config.bin) : null
        if (binPath) {
          this.binPaths.set(config.id, binPath)
          this.available.push(config.id)
          console.log(`[coding-agent] ${config.id} available at ${binPath}`)
        } else {
          console.log(`[coding-agent] ${config.id} skipped (binary not found)`)
        }
      }
    }

    console.log(`[coding-agent] available: ${this.available.length ? this.available.join(', ') : 'none'}`)
  }

  isAvailable(agentId: string): boolean {
    return this.available.includes(agentId)
  }

  getConfig(agentId: string): CodingAgentConfig | undefined {
    return this.configs.get(agentId)
  }

  getBinPath(agentId: string): string | undefined {
    return this.binPaths.get(agentId)
  }

  listAvailable(): CodingAgentConfig[] {
    return this.available
      .map(id => this.configs.get(id))
      .filter((c): c is CodingAgentConfig => c !== undefined)
  }
}
