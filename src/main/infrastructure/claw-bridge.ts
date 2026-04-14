/**
 * Claw Bridge — Infrastructure Layer
 *
 * Watson only imports `agentic` (the umbrella package).
 * Uses the default `ai` instance with per-capability config.
 *
 * Architecture:
 * - `ai` from agentic = default instance, configured once at startup
 * - `ai.createClaw({ tools })` = per-workspace Claw with tools + streaming
 * - Claw manages: session memory, context compaction, tool loop, streaming
 * - Watson's ChatSession manages: UI messages + SQLite persistence
 */

// @ts-ignore — JS module without type declarations
import { ai } from 'agentic'
import type { StreamChunk, LLMStreamFn } from '../domain/chat-session'
import { ToolRunner } from './tool-runner'
import { BUILTIN_TOOLS } from './tools'
import { McpManager } from './mcp-manager'
import { buildSystemPrompt } from './prompt-builder'
import { loadConfig } from './config'
import type { AgentConfig } from './agent-manager'
import type { AgentManager } from './agent-manager'

// ── Configure ──────────────────────────────────────────────────

/** Configure the default Agentic instance from Watson's workspace config. */
export function configureAgentic(workspacePath: string): void {
  const config = loadConfig(workspacePath)

  ai.configure({
    llm: {
      provider: config.provider || 'anthropic',
      apiKey: config.apiKey || '',
      baseUrl: config.baseUrl,
      model: config.model,
    },
    tts: config.voice?.tts ? {
      provider: config.voice.tts.provider,
      apiKey: config.voice.tts.apiKey,
    } : undefined,
  })

  console.log('[claw-bridge] ai configured — provider:', config.provider, 'model:', config.model)
}

// ── Tool builders ──────────────────────────────────────────────

function buildWatsonTools(workspacePath: string) {
  return BUILTIN_TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
    execute: async (input: any) => {
      const controller = new AbortController()
      const result = await ToolRunner.execute(
        { name: tool.name, input },
        { signal: controller.signal, workspacePath }
      )
      if (!result.success) throw new Error(result.error || 'Tool execution failed')
      return result.output || 'Done'
    },
  }))
}

function buildMcpTools(mcpManager: McpManager | null, workspacePath: string) {
  if (!mcpManager) return []
  return mcpManager.listTools().map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
    execute: async (input: any) => {
      const controller = new AbortController()
      const result = await ToolRunner.execute(
        { name: tool.name, input },
        { signal: controller.signal, workspacePath }
      )
      if (!result.success) throw new Error(result.error || 'MCP tool execution failed')
      return result.output || 'Done'
    },
  }))
}

// ── Claw LLM Stream ───────────────────────────────────────────

export function createClawLLMStream(
  workspacePath: string,
  mcpManager: McpManager | null,
  agentManager: AgentManager,
): LLMStreamFn {
  let claw: any = null
  let lastConfigHash = ''

  function getOrCreateClaw(agentConfig?: AgentConfig) {
    const config = loadConfig(workspacePath)
    const provider = agentConfig?.provider || config.provider || 'anthropic'
    const apiKey = agentConfig?.apiKey || config.apiKey || ''
    const baseUrl = agentConfig?.baseUrl || config.baseUrl
    const model = agentConfig?.model || config.model

    const hash = `${provider}:${apiKey?.slice(-8)}:${baseUrl}:${model}`
    if (claw && hash === lastConfigHash) return claw

    // Build tools
    let tools = [
      ...buildWatsonTools(workspacePath),
      ...buildMcpTools(mcpManager, workspacePath),
    ]
    if (agentConfig?.tools?.length) {
      const allowed = new Set(agentConfig.tools)
      tools = tools.filter(t => allowed.has(t.name))
    }

    // System prompt
    const toolDefs = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }))
    let systemPrompt = buildSystemPrompt(workspacePath, toolDefs)
    if (agentConfig?.systemPrompt) systemPrompt = `${agentConfig.systemPrompt}\n\n${systemPrompt}`

    // Providers for failover
    const providers = config.providers?.length
      ? config.providers.map((p: any) => ({
          provider: p.provider || p.type || provider,
          apiKey: p.apiKey || apiKey,
          baseUrl: p.baseUrl || baseUrl,
          model: p.model || model,
        }))
      : undefined

    // If agent has custom LLM config, create a fresh Agentic instance for it.
    // Otherwise use the default `ai` which was configured at startup.
    let agenticInstance = ai
    if (agentConfig?.provider || agentConfig?.apiKey) {
      // @ts-ignore
      const { Agentic } = require('agentic')
      agenticInstance = new Agentic({
        llm: { provider, apiKey, baseUrl, model },
      })
    }

    console.log('[claw-bridge] creating claw — model:', model)
    claw = agenticInstance.createClaw({ tools, systemPrompt, stream: true, providers })
    lastConfigHash = hash

    // Pre-heat connection + prompt cache (fire-and-forget)
    if (claw.warmup) {
      claw.warmup().then((r: any) => {
        if (r?.ok) console.log(`[claw-bridge] warmup done ${r.ms}ms — cache_created: ${r.cacheCreated}, cache_hit: ${r.cacheHit}`)
        else console.warn('[claw-bridge] warmup failed:', r?.reason || r?.error)
      }).catch(() => {})
    }

    return claw
  }

  return async function* clawStream(
    messages: Array<{ role: string; content: any }>,
    signal: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    // MOMO-50: agent routing
    let agentConfig: AgentConfig | undefined
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && (messages[i] as any).agentId) {
        agentConfig = agentManager.getAgent((messages[i] as any).agentId)
        break
      }
    }

    const clawInst = getOrCreateClaw(agentConfig)

    const lastUserMsg = messages[messages.length - 1]
    const prompt = typeof lastUserMsg?.content === 'string'
      ? lastUserMsg.content
      : Array.isArray(lastUserMsg?.content)
        ? lastUserMsg.content.find((c: any) => c.type === 'text')?.text || ''
        : ''

    const gen = clawInst.chat(prompt, { signal })

    for await (const event of gen) {
      switch (event.type) {
        case 'text_delta':
          yield { type: 'text', text: event.text }
          break
        case 'tool_use':
          yield { type: 'tool_use', tool: { id: event.id, name: event.name, input: event.input } }
          break
        case 'tool_result':
          yield { type: 'tool_result' as any, tool: { id: event.id, name: event.name, output: event.output } }
          break
        case 'tool_error':
          yield { type: 'tool_error' as any, tool: { id: event.id, name: event.name, error: event.error } }
          break
        case 'warning':
          yield { type: 'text', text: `\n⚠️ ${event.message}\n` }
          break
        case 'done':
          yield { type: 'done', stopReason: event.stopReason || 'end_turn' }
          break
        case 'error':
          yield { type: 'error', error: event.error || event.message }
          break
        case 'timing':
          yield { type: 'timing' as any, round: event.round, phase: event.phase, ms: event.ms, ttft: event.ttft }
          break
      }
    }
  }
}
