/**
 * Claw Bridge — Infrastructure Layer
 *
 * Wraps agentic-core's agenticAsk to provide Watson's ChatSession with a
 * LLMStreamFn that handles the complete tool loop internally.
 *
 * Watson's tools (file_read, shell_exec, etc.) are registered as custom tools
 * in agentic-core's tool registry, so agenticAsk handles:
 * - Token-level streaming
 * - Tool loop (multi-round)
 * - Loop detection
 * - Provider failover
 * - Eager tool execution (tools start during LLM streaming)
 *
 * ChatSession no longer needs its own tool loop — the stream yields all events
 * including tool_use/tool_result/tool_error as they happen.
 */

// @ts-ignore — JS modules without type declarations
import { agenticAsk, toolRegistry } from 'agentic-core'
import type { StreamChunk, LLMStreamFn } from '../domain/chat-session'
import { ToolRunner } from './tool-runner'
import { BUILTIN_TOOLS } from './tools'
import { McpManager } from './mcp-manager'
import { buildSystemPrompt } from './prompt-builder'
import { loadConfig } from './config'
import type { AgentConfig } from './agent-manager'
import type { AgentManager } from './agent-manager'

/**
 * Register Watson's built-in tools into agentic-core's tool registry.
 * This lets agenticAsk's tool loop call them directly.
 */
function registerWatsonTools(workspacePath: string) {
  // Clear previous registrations (in case of workspace switch)
  toolRegistry.clear()

  for (const tool of BUILTIN_TOOLS) {
    toolRegistry.register(tool.name, {
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
function registerMcpTools(mcpManager: McpManager | null, workspacePath: string) {
  if (!mcpManager) return
  for (const tool of mcpManager.listTools()) {
    // Skip if already registered
    if (toolRegistry.get(tool.name)) continue

    toolRegistry.register(tool.name, {
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
 * Create a LLMStreamFn powered by agenticAsk.
 *
 * This replaces both EnhancedLLMClient AND ChatSession's tool loop.
 * The returned generator yields StreamChunk events that ChatSession understands:
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
    const provider = agentConfig?.provider || config.provider
    const apiKey = agentConfig?.apiKey || config.apiKey
    const baseUrl = agentConfig?.baseUrl || config.baseUrl
    const model = agentConfig?.model || config.model

    console.log('[claw-bridge] model:', model, 'provider:', provider)

    // Register tools (builtin + MCP)
    registerWatsonTools(workspacePath)
    registerMcpTools(mcpManager, workspacePath)

    // Get all registered tools for agenticAsk
    const tools = toolRegistry.list().map((t: any) => ({
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
      : [{ provider, apiKey, baseUrl, model }]

    // Run agenticAsk — it handles the full tool loop
    const gen = agenticAsk(prompt, {
      provider,
      apiKey,
      baseUrl,
      model,
      providers,
      tools: filteredTools,
      history: history.length ? history : undefined,
      stream: true,
      system: systemPrompt,
      signal,
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
          // Loop detection warnings — surface as text
          yield { type: 'text', text: `\n⚠️ ${event.message}\n` }
          break

        case 'done':
          yield { type: 'done', stopReason: event.stopReason || 'end_turn' }
          break

        case 'error':
          yield { type: 'error', error: event.error }
          break

        case 'status':
          // Internal status (round N/M) — could surface to UI later
          break
      }
    }
  }
}
