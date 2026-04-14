/**
 * Claw Bridge — Infrastructure Layer
 *
 * Wraps the Agentic class (from the `agentic` umbrella package) to provide
 * Watson's ChatSession with a LLMStreamFn that handles the complete tool loop.
 *
 * Watson only imports `agentic` — never touches agentic-core/claw/memory directly.
 *
 * The Agentic instance handles:
 * - Token-level streaming (ai.stream())
 * - Tool loop (multi-round, via agenticAsk internally)
 * - Loop detection
 * - Provider failover
 * - Eager tool execution
 *
 * Watson's tools (file_read, shell_exec, etc.) are registered via ai.tools,
 * which delegates to agentic-core's toolRegistry.
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
 * Register Watson's built-in tools into the Agentic instance's tool registry.
 */
function registerWatsonTools(ai: any, workspacePath: string) {
  const registry = ai.tools
  registry.clear()

  for (const tool of BUILTIN_TOOLS) {
    registry.register(tool.name, {
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
    })
  }
}

/**
 * Register MCP tools dynamically discovered at runtime.
 */
function registerMcpTools(ai: any, mcpManager: McpManager | null, workspacePath: string) {
  if (!mcpManager) return
  const registry = ai.tools

  for (const tool of mcpManager.listTools()) {
    if (registry.get(tool.name)) continue

    registry.register(tool.name, {
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
    })
  }
}

/**
 * Create a LLMStreamFn powered by Agentic.stream().
 *
 * This replaces EnhancedLLMClient + ChatSession's tool loop.
 * The returned generator yields StreamChunk events:
 * - { type: 'text', text } — token-level text deltas
 * - { type: 'tool_use', tool: { id, name, input } } — tool call started
 * - { type: 'tool_result', tool: { id, name, output } } — tool call completed
 * - { type: 'tool_error', tool: { id, name, error } } — tool call failed
 * - { type: 'done', stopReason } — stream complete
 * - { type: 'error', error } — fatal error
 */
export function createClawLLMStream(
  workspacePath: string,
  mcpManager: McpManager | null,
  agentManager: AgentManager,
): LLMStreamFn {
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

    // Merge agent config with workspace config
    const provider = agentConfig?.provider || config.provider || 'anthropic'
    const apiKey = agentConfig?.apiKey || config.apiKey || ''
    const baseUrl = agentConfig?.baseUrl || config.baseUrl
    const model = agentConfig?.model || config.model

    console.log('[claw-bridge] model:', model, 'provider:', provider)

    // Create Agentic instance with resolved config
    const ai = new Agentic({ provider, apiKey, baseUrl, model })

    // Register tools (builtin + MCP)
    registerWatsonTools(ai, workspacePath)
    registerMcpTools(ai, mcpManager, workspacePath)

    // Get all registered tools
    const registry = ai.tools
    const tools = registry.list().map((t: any) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      execute: t.execute,
    }))

    // Filter tools if agent has restrictions
    let filteredTools = tools
    if (agentConfig?.tools && agentConfig.tools.length > 0) {
      const allowed = new Set(agentConfig.tools)
      filteredTools = tools.filter((t: any) => allowed.has(t.name))
    }

    // Build system prompt
    const toolDefs = filteredTools.map((t: any) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }))
    let systemPrompt = buildSystemPrompt(workspacePath, toolDefs)
    if (agentConfig?.systemPrompt) {
      systemPrompt = `${agentConfig.systemPrompt}\n\n${systemPrompt}`
    }

    // Extract prompt + history from messages
    const lastUserIdx = messages.length - 1
    const lastUserMsg = messages[lastUserIdx]
    const prompt = typeof lastUserMsg?.content === 'string'
      ? lastUserMsg.content
      : Array.isArray(lastUserMsg?.content)
        ? lastUserMsg.content.find((c: any) => c.type === 'text')?.text || ''
        : ''

    const history = messages.slice(0, lastUserIdx)

    // Build providers array for failover
    const providers = config.providers?.length
      ? config.providers.map((p: any) => ({
          provider: p.provider || p.type || provider,
          apiKey: p.apiKey || apiKey,
          baseUrl: p.baseUrl || baseUrl,
          model: p.model || model,
        }))
      : undefined

    // Stream via Agentic — handles the full tool loop
    const gen = ai.stream(prompt, {
      tools: filteredTools,
      history: history.length ? history : undefined,
      system: systemPrompt,
      signal,
      providers,
    })

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
          yield { type: 'error', error: event.error }
          break
      }
    }
  }
}
