/**
 * Claw Bridge — Infrastructure Layer
 *
 * Watson only imports `agentic` (the umbrella package).
 * Creates a Claw instance via ai.createClaw() which handles:
 * - Session memory (conversation history)
 * - Context compaction
 * - Tool loop (multi-round, via agenticAsk)
 * - Token-level streaming
 * - Loop detection
 * - Provider failover
 *
 * Watson's tools (file_read, shell_exec, etc.) are passed to createClaw({ tools }).
 * Claw's chat() returns an async generator that yields streaming events.
 */

// @ts-ignore — JS module without type declarations
import { Agentic } from 'agentic'
import type { StreamChunk, LLMStreamFn } from '../domain/chat-session'
import { ToolRunner } from './tool-runner'
import { BUILTIN_TOOLS } from './tools'
import { McpManager } from './mcp-manager'
import { buildSystemPrompt } from './prompt-builder'
import { loadConfig } from './config'
import type { AgentConfig } from './agent-manager'
import type { AgentManager } from './agent-manager'

/**
 * Build Watson's tool definitions in the format claw expects.
 * Each tool has { name, description, parameters, execute }.
 */
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
      if (!result.success) {
        throw new Error(result.error || 'Tool execution failed')
      }
      return result.output || 'Done'
    },
  }))
}

/**
 * Build MCP tool definitions.
 */
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
      if (!result.success) {
        throw new Error(result.error || 'MCP tool execution failed')
      }
      return result.output || 'Done'
    },
  }))
}

/**
 * Create a LLMStreamFn powered by Claw.
 *
 * Architecture:
 * - One Claw instance per workspace (created lazily, reused across sessions)
 * - Claw manages its own session memory (history for LLM)
 * - Watson's ChatSession manages UI-side messages + SQLite persistence
 * - claw.chat() returns async generator yielding streaming events
 */
export function createClawLLMStream(
  workspacePath: string,
  mcpManager: McpManager | null,
  agentManager: AgentManager,
): LLMStreamFn {
  // Lazy-init claw instance (reused across chat turns)
  let claw: any = null
  let lastConfigHash = ''

  function getOrCreateClaw(config: any, agentConfig?: AgentConfig) {
    const provider = agentConfig?.provider || config.provider || 'anthropic'
    const apiKey = agentConfig?.apiKey || config.apiKey || ''
    const baseUrl = agentConfig?.baseUrl || config.baseUrl
    const model = agentConfig?.model || config.model

    // Rebuild claw if config changed
    const hash = `${provider}:${apiKey?.slice(-8)}:${baseUrl}:${model}`
    if (claw && hash === lastConfigHash) return claw

    console.log('[claw-bridge] creating claw — model:', model, 'provider:', provider)

    // Build tools
    let tools = [
      ...buildWatsonTools(workspacePath),
      ...buildMcpTools(mcpManager, workspacePath),
    ]

    // Filter tools if agent has restrictions
    if (agentConfig?.tools && agentConfig.tools.length > 0) {
      const allowed = new Set(agentConfig.tools)
      tools = tools.filter(t => allowed.has(t.name))
    }

    // Build system prompt
    const toolDefs = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }))
    let systemPrompt = buildSystemPrompt(workspacePath, toolDefs)
    if (agentConfig?.systemPrompt) {
      systemPrompt = `${agentConfig.systemPrompt}\n\n${systemPrompt}`
    }

    // Build providers for failover
    const providers = config.providers?.length
      ? config.providers.map((p: any) => ({
          provider: p.provider || p.type || provider,
          apiKey: p.apiKey || apiKey,
          baseUrl: p.baseUrl || baseUrl,
          model: p.model || model,
        }))
      : undefined

    const ai = new Agentic({ provider, apiKey, baseUrl, model })
    claw = ai.createClaw({
      tools,
      systemPrompt,
      stream: true,
      providers,
    })

    lastConfigHash = hash
    return claw
  }

  return async function* clawStream(
    messages: Array<{ role: string; content: any }>,
    signal: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const config = loadConfig(workspacePath)

    // MOMO-50: Check if the last assistant message has an agentId
    let agentConfig: AgentConfig | undefined
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && (messages[i] as any).agentId) {
        agentConfig = agentManager.getAgent((messages[i] as any).agentId)
        break
      }
    }

    const clawInst = getOrCreateClaw(config, agentConfig)

    // Extract the last user message as prompt
    const lastUserMsg = messages[messages.length - 1]
    const prompt = typeof lastUserMsg?.content === 'string'
      ? lastUserMsg.content
      : Array.isArray(lastUserMsg?.content)
        ? lastUserMsg.content.find((c: any) => c.type === 'text')?.text || ''
        : ''

    // claw.chat() returns a thenable async generator
    const gen = clawInst.chat(prompt, { signal })

    for await (const event of gen) {
      switch (event.type) {
        case 'text_delta':
          yield { type: 'text', text: event.text }
          break

        case 'tool_use':
          yield {
            type: 'tool_use',
            tool: { id: event.id, name: event.name, input: event.input },
          }
          break

        case 'tool_result':
          yield {
            type: 'tool_result' as any,
            tool: { id: event.id, name: event.name, output: event.output },
          }
          break

        case 'tool_error':
          yield {
            type: 'tool_error' as any,
            tool: { id: event.id, name: event.name, error: event.error },
          }
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
      }
    }
  }
}
