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
 *
 * Tool loading:
 * - ToolRegistry splits tools into core (always loaded) and deferred (on demand)
 * - tool_search lets the model discover and load deferred tools mid-conversation
 * - Warmup pre-loads likely tools based on workspace context
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
import { ToolRegistry, createToolSearchToolDef, type ToolDef, type WarmupContext } from '../domain/tool-registry'

// ── Configure ──────────────────────────────────────────────────

/** Configure the default Agentic instance from Watson's workspace config. */
export function configureAgentic(workspacePath: string): void {
  const config = loadConfig(workspacePath)

  const modelId = typeof config.model === 'object' ? (config.model as any).id : config.model

  ai.configure({
    provider: config.provider || 'anthropic',
    apiKey: config.apiKey || '',
    baseUrl: config.baseUrl,
    model: modelId,
    llm: {
      provider: config.provider || 'anthropic',
      apiKey: config.apiKey || '',
      baseUrl: config.baseUrl,
      model: modelId,
    },
    tts: config.voice?.tts ? {
      provider: config.voice.tts.provider,
      apiKey: config.voice.tts.apiKey,
    } : undefined,
  })

  console.log('[claw-bridge] ai configured — provider:', config.provider, 'model:', modelId)
}

// ── Tool Registry ──────────────────────────────────────────────

/** Per-workspace tool registries */
const registries = new Map<string, ToolRegistry>()

/**
 * Get or create a ToolRegistry for a workspace.
 * Registers builtin tools + MCP tools, with core/deferred split.
 */
export function getToolRegistry(workspacePath: string, mcpManager: McpManager | null): ToolRegistry {
  const existing = registries.get(workspacePath)
  if (existing) return existing

  const registry = new ToolRegistry()

  // Register builtin tools (already tagged core/shouldDefer)
  registry.registerAll(BUILTIN_TOOLS)

  // Register MCP tools (always deferred)
  if (mcpManager) {
    const mcpTools = mcpManager.listTools()
    for (const t of mcpTools) {
      registry.register({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
        shouldDefer: true,
        tags: ['mcp', t.name.split('__')[1] || 'unknown'],
      })
    }
  }

  // Register tool_search itself (core — always available)
  registry.register(createToolSearchToolDef(registry))

  registries.set(workspacePath, registry)
  console.log(`[claw-bridge] registry created — ${registry.getStats().core} core, ${registry.getStats().deferred} deferred`)
  return registry
}

// ── Tool builders ──────────────────────────────────────────────

function buildExecutableTools(tools: ToolDef[], workspacePath: string, registry: ToolRegistry) {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
    execute: async (input: any) => {
      // tool_search is handled specially
      if (tool.name === 'tool_search') {
        return handleToolSearch(input, registry)
      }

      registry.recordUsage(tool.name)
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

/**
 * Handle tool_search calls — search registry, load matches, return schemas.
 */
function handleToolSearch(input: { query: string; max_results?: number }, registry: ToolRegistry): string {
  const { query, max_results = 5 } = input
  const result = registry.search(query, max_results)

  if (result.matches.length === 0) {
    return JSON.stringify({
      matches: [],
      query,
      totalDeferred: result.totalDeferred,
      message: 'No matching tools found. Try different keywords.',
    })
  }

  // Load the matched tools
  const loaded = registry.load(result.matches.map(t => t.name))

  // Return full schemas so the model can call them
  const toolSchemas = result.matches.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }))

  return JSON.stringify({
    matches: toolSchemas,
    query,
    totalDeferred: result.totalDeferred,
    loaded: loaded.map(t => t.name),
    message: `Loaded ${loaded.length} tools. They are now callable.`,
  })
}

// ── Claw LLM Stream ───────────────────────────────────────────

export function createClawLLMStream(
  workspacePath: string,
  mcpManager: McpManager | null,
  agentManager: AgentManager,
): LLMStreamFn {
  let claw: any = null
  let lastConfigHash = ''
  let lastToolHash = ''

  const registry = getToolRegistry(workspacePath, mcpManager)

  function getOrCreateClaw(agentConfig?: AgentConfig) {
    const config = loadConfig(workspacePath)
    const provider = agentConfig?.provider || config.provider || 'anthropic'
    const apiKey = agentConfig?.apiKey || config.apiKey || ''
    const baseUrl = agentConfig?.baseUrl || config.baseUrl
    const model = agentConfig?.model || config.model

    const configHash = `${provider}:${apiKey?.slice(-8)}:${baseUrl}:${model}`
    // Rebuild claw when loaded tools change (tool_search loaded new ones)
    const toolHash = [...registry.getLoadedTools()].map(t => t.name).sort().join(',')

    if (claw && configHash === lastConfigHash && toolHash === lastToolHash) return claw

    // Build tools from loaded set only
    let tools = buildExecutableTools(registry.getLoadedTools(), workspacePath, registry)

    if (agentConfig?.tools?.length) {
      const allowed = new Set(agentConfig.tools)
      tools = tools.filter(t => allowed.has(t.name))
    }

    // System prompt — include deferred tool list
    const toolDefs = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }))
    const deferredList = registry.getDeferredToolList()
    let systemPrompt = buildSystemPrompt(workspacePath, toolDefs, deferredList)
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

    let agenticInstance = ai
    if (agentConfig?.provider || agentConfig?.apiKey) {
      // @ts-ignore
      const { Agentic } = require('agentic')
      agenticInstance = new Agentic({
        llm: { provider, apiKey, baseUrl, model },
      })
    }

    console.log('[claw-bridge] creating claw — model:', model, `tools: ${tools.length} loaded, ${deferredList.length} deferred`)
    claw = agenticInstance.createClaw({
      tools, systemPrompt, stream: true, providers,
      conductorModule: (globalThis as any).AgenticConductor || undefined,
    })
    lastConfigHash = configHash
    lastToolHash = toolHash

    // Listen for conductor worker completion — push results to UI
    if (claw.conductor) {
      claw.on('worker_done', (data: any) => {
        console.log('[claw-bridge] worker done:', data.taskId, data.task?.slice(0, 80))
        // Emit through sessionBus so renderer can display worker results
        const { sessionBus } = require('../application/chat-handlers')
        if (sessionBus) {
          sessionBus.emit('worker:done', {
            taskId: data.taskId,
            task: data.task,
            result: typeof data.result === 'string' ? data.result : JSON.stringify(data.result),
          })
        }
      })
      console.log('[claw-bridge] conductor active — worker events wired')
    }

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
          yield { type: 'done', stopReason: event.stopReason || 'end_turn', intents: event.intents || [] }
          break
        case 'error':
          yield { type: 'error', error: event.error || event.message }
          break
        case 'timing':
          yield { type: 'timing', round: event.round, phase: event.phase, ms: event.ms, ttft: event.ttft }
          break
      }
    }
  }
}

// ── Warmup API ─────────────────────────────────────────────────

/**
 * Run warmup for a workspace — predict and pre-load tools.
 * Call this when a session starts or workspace switches.
 */
export async function warmupTools(workspacePath: string, mcpManager: McpManager | null, context?: Partial<WarmupContext>): Promise<string[]> {
  const registry = getToolRegistry(workspacePath, mcpManager)

  // Scan workspace for file extensions
  const fs = await import('fs')
  const path = await import('path')
  const fileExtensions = new Set<string>()
  try {
    const entries = fs.readdirSync(workspacePath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name)
        if (ext) fileExtensions.add(ext)
      }
    }
  } catch { /* ignore */ }

  const warmupContext: WarmupContext = {
    fileExtensions: [...fileExtensions],
    ...context,
  }

  const loaded = await registry.warmup(warmupContext)
  if (loaded.length > 0) {
    console.log(`[claw-bridge] warmup loaded ${loaded.length} tools:`, loaded.join(', '))
  }
  return loaded
}

// ── Group Chat LLM Stream ──────────────────────────────────────

/**
 * Create a lightweight LLM stream for group chat steps.
 * Each call creates a fresh claw — no session memory, no context accumulation.
 *
 * @param agentId - null for orchestrator, string for delegate
 * @param overrideTools - custom tools (e.g. orchestrator routing tools)
 */
export function createGroupLLMStream(
  workspacePath: string,
  mcpManager: McpManager | null,
  agentManager: AgentManager,
  agentId: string | null,
  overrideTools?: any[],
): LLMStreamFn {
  return async function* groupStream(
    messages: Array<{ role: string; content: any }>,
    signal: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const config = loadConfig(workspacePath)
    const agentConfig = agentId ? agentManager.getAgent(agentId) : undefined

    const provider = agentConfig?.provider || config.provider || 'anthropic'
    const apiKey = agentConfig?.apiKey || config.apiKey || ''
    const baseUrl = agentConfig?.baseUrl || config.baseUrl
    const model = agentConfig?.model || config.model

    // Build tools
    let tools: any[] = []
    if (overrideTools) {
      // Orchestrator routing tools — pass through as-is (no execution needed, just tool_use detection)
      tools = overrideTools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
        execute: async (input: any) => JSON.stringify(input),
      }))
    } else {
      // Delegate gets workspace tools (filtered by agent config)
      const registry = getToolRegistry(workspacePath, mcpManager)
      tools = buildExecutableTools(registry.getLoadedTools(), workspacePath, registry)
      if (agentConfig?.tools?.length) {
        const allowed = new Set(agentConfig.tools)
        tools = tools.filter(t => allowed.has(t.name))
      }
    }

    // Build system prompt
    let systemPrompt: string
    if (agentConfig?.systemPrompt) {
      systemPrompt = agentConfig.systemPrompt
    } else if (overrideTools) {
      // Orchestrator — minimal prompt, routing tools handle the rest
      systemPrompt = `You are Watson, a group chat host. Use the provided tools to route messages.`
    } else {
      const toolDefs = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }))
      systemPrompt = buildSystemPrompt(workspacePath, toolDefs, [])
    }

    // Providers for failover
    const providers = config.providers?.length
      ? config.providers.map((p: any) => ({
          provider: p.provider || p.type || provider,
          apiKey: p.apiKey || apiKey,
          baseUrl: p.baseUrl || baseUrl,
          model: p.model || model,
        }))
      : undefined

    let agenticInstance = ai
    if (agentConfig?.provider || agentConfig?.apiKey) {
      // @ts-ignore
      const { Agentic } = require('agentic')
      agenticInstance = new Agentic({
        llm: { provider, apiKey, baseUrl, model },
      })
    }

    const claw = agenticInstance.createClaw({ tools, systemPrompt, stream: true, providers })

    const lastMsg = messages[messages.length - 1]
    const prompt = typeof lastMsg?.content === 'string'
      ? lastMsg.content
      : Array.isArray(lastMsg?.content)
        ? lastMsg.content.find((c: any) => c.type === 'text')?.text || ''
        : ''

    const gen = claw.chat(prompt, { signal })

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
        case 'done':
          yield { type: 'done', stopReason: event.stopReason || 'end_turn' }
          break
        case 'error':
          yield { type: 'error', error: event.error || event.message }
          break
        case 'timing':
          yield { type: 'timing', round: event.round, phase: event.phase, ms: event.ms, ttft: event.ttft }
          break
      }
    }
  }
}
