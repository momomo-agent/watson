/**
 * LLMClient — Infrastructure Layer
 *
 * Direct Anthropic/OpenAI API calls with streaming.
 * Returns tool_use blocks as stream chunks so the caller (ChatSession)
 * can handle the tool loop itself.
 *
 * Does NOT use agenticAsk — Watson needs its own tool loop for:
 *   - Custom ToolRunner (MCP, skills, shell, etc.)
 *   - Streaming tool status to UI
 *   - Loop detection + error recovery at the session level
 */

// Proxy-aware fetch wrapper
async function proxyFetch(url: string, options: any): Promise<Response> {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  if (!proxy) return fetch(url, options)
  
  try {
    const nodeFetch = require('node-fetch')
    const fetchFn = typeof nodeFetch === 'function' ? nodeFetch : nodeFetch.default
    const { HttpsProxyAgent } = require('https-proxy-agent')
    const { Readable } = require('stream')
    const res = await fetchFn(url, { ...options, agent: new HttpsProxyAgent(proxy) }) as any
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
      text: () => res.text(),
      json: () => res.json(),
      body: Readable.toWeb(res.body),
    } as any
  } catch (e: any) {
    console.error('[proxyFetch] error, fallback to native fetch:', e.message)
    return fetch(url, options)
  }
}

export interface StreamChunk {
  type: 'text' | 'tool_use' | 'done' | 'error'
  text?: string
  toolUseId?: string
  tool?: { id: string; name: string; input: any }
  stopReason?: string
  error?: string
}

export interface LLMOptions {
  messages: Array<{ role: string; content: any }>
  signal: AbortSignal
  provider?: 'anthropic' | 'openai'
  apiKey?: string
  baseUrl?: string
  model?: string
  system?: string
  tools?: Array<{ name: string; description: string; input_schema: any }>
}

export class LLMClient {
  /**
   * Single-round LLM streaming call.
   *
   * Yields text tokens and tool_use blocks as they arrive.
   * Does NOT execute tools — that's the caller's responsibility.
   */
  static async *streamChat(options: LLMOptions): AsyncGenerator<StreamChunk> {
    const { provider = 'anthropic' } = options

    if (!options.apiKey) {
      throw new Error('No API key provided')
    }

    if (provider === 'anthropic') {
      yield* this.streamAnthropic(options)
    } else {
      yield* this.streamOpenAI(options)
    }
  }

  // ── Anthropic Streaming ──

  private static async *streamAnthropic(options: LLMOptions): AsyncGenerator<StreamChunk> {
    const { messages, signal, apiKey, baseUrl = 'https://api.anthropic.com', model = 'claude-sonnet-4-20250514', system, tools } = options

    const base = baseUrl!.replace(/\/+$/, '')
    const url = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`

    // Convert messages to Anthropic format
    const anthropicMessages = this.toAnthropicMessages(messages)

    const body: any = {
      model,
      max_tokens: 8192,
      messages: anthropicMessages,
      stream: true,
    }
    if (system) body.system = system
    if (tools?.length) body.tools = tools

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': apiKey!,
      'anthropic-version': '2023-06-01',
    }

    const res = await proxyFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })

    if (!res.ok) {
      const errText = await res.text()
      const err = new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 500)}`) as any
      err.status = res.status
      err.responseBody = errText
      throw err
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let currentTool: { id: string; name: string } | null = null
    let currentToolInput = ''
    let stopReason = 'end_turn'

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const event = JSON.parse(data)

            if (event.type === 'content_block_start') {
              if (event.content_block?.type === 'tool_use') {
                currentTool = {
                  id: event.content_block.id,
                  name: event.content_block.name,
                }
                currentToolInput = ''
              }
            } else if (event.type === 'content_block_delta') {
              if (event.delta?.type === 'text_delta') {
                yield { type: 'text', text: event.delta.text }
              } else if (event.delta?.type === 'input_json_delta') {
                currentToolInput += event.delta.partial_json || ''
              }
            } else if (event.type === 'content_block_stop') {
              if (currentTool) {
                let input: any = {}
                try {
                  input = JSON.parse(currentToolInput || '{}')
                } catch {}
                yield {
                  type: 'tool_use',
                  tool: { id: currentTool.id, name: currentTool.name, input },
                }
                currentTool = null
                currentToolInput = ''
              }
            } else if (event.type === 'message_delta') {
              if (event.delta?.stop_reason) {
                stopReason = event.delta.stop_reason
              }
            } else if (event.type === 'error') {
              throw new Error(`Stream error: ${JSON.stringify(event.error)}`)
            }
          } catch (parseErr: any) {
            if (parseErr.message?.startsWith('Stream error:')) throw parseErr
            // Ignore JSON parse errors on individual lines
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    yield { type: 'done', stopReason }
  }

  // ── OpenAI Streaming ──

  private static async *streamOpenAI(options: LLMOptions): AsyncGenerator<StreamChunk> {
    const { messages, signal, apiKey, baseUrl = 'https://api.openai.com', model = 'gpt-4', system, tools } = options

    const base = baseUrl!.replace(/\/+$/, '')
    const url = base.includes('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`

    const oaiMessages: any[] = system ? [{ role: 'system', content: system }] : []
    for (const m of messages) {
      oaiMessages.push(this.toOpenAIMessage(m))
    }

    const body: any = { model, messages: oaiMessages, stream: true }
    if (tools?.length) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }))
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    }

    const res = await proxyFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })

    if (!res.ok) {
      const errText = await res.text()
      const err = new Error(`OpenAI API error ${res.status}: ${errText.slice(0, 500)}`) as any
      err.status = res.status
      err.responseBody = errText
      throw err
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const toolCallAccumulators = new Map<number, { id: string; name: string; args: string }>()
    let stopReason = 'stop'

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const event = JSON.parse(data)
            const delta = event.choices?.[0]?.delta
            const finishReason = event.choices?.[0]?.finish_reason

            if (delta?.content) {
              yield { type: 'text', text: delta.content }
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0
                if (!toolCallAccumulators.has(idx)) {
                  toolCallAccumulators.set(idx, {
                    id: tc.id || '',
                    name: tc.function?.name || '',
                    args: '',
                  })
                }
                const acc = toolCallAccumulators.get(idx)!
                if (tc.id) acc.id = tc.id
                if (tc.function?.name) acc.name = tc.function.name
                if (tc.function?.arguments) acc.args += tc.function.arguments
              }
            }

            if (finishReason) {
              stopReason = finishReason
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    // Emit accumulated tool calls
    for (const [, acc] of toolCallAccumulators) {
      let input: any = {}
      try {
        input = JSON.parse(acc.args || '{}')
      } catch {}
      yield {
        type: 'tool_use',
        tool: { id: acc.id, name: acc.name, input },
      }
    }

    yield { type: 'done', stopReason }
  }

  // ── Message Format Conversion ──

  /**
   * Convert internal message format to Anthropic API format.
   * Handles tool_use blocks in assistant messages and tool_result in user messages.
   */
  private static toAnthropicMessages(messages: Array<{ role: string; content: any }>): any[] {
    const result: any[] = []

    for (const m of messages) {
      if (m.role === 'user') {
        result.push({ role: 'user', content: m.content })
      } else if (m.role === 'assistant') {
        // Content can be string or array of content blocks
        result.push({ role: 'assistant', content: m.content })
      } else if (m.role === 'tool_result') {
        // Tool results go as user messages with tool_result content blocks
        // Merge with previous user message if it's also tool_result
        const last = result[result.length - 1]
        const block = m.content // Already in { type: 'tool_result', tool_use_id, content } format
        if (last?.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
          last.content.push(block)
        } else {
          result.push({ role: 'user', content: [block] })
        }
      }
    }

    return result
  }

  /**
   * Convert a single message to OpenAI format.
   */
  private static toOpenAIMessage(m: { role: string; content: any }): any {
    if (m.role === 'tool_result') {
      // OpenAI uses role: 'tool' with tool_call_id
      return {
        role: 'tool',
        tool_call_id: m.content.tool_use_id,
        content: typeof m.content.content === 'string' ? m.content.content : JSON.stringify(m.content.content),
      }
    }

    if (m.role === 'assistant' && Array.isArray(m.content)) {
      // Assistant message with tool_use blocks — convert to OpenAI format
      const textParts = m.content.filter((b: any) => b.type === 'text')
      const toolUseParts = m.content.filter((b: any) => b.type === 'tool_use')

      const msg: any = {
        role: 'assistant',
        content: textParts.map((b: any) => b.text).join('') || null,
      }

      if (toolUseParts.length > 0) {
        msg.tool_calls = toolUseParts.map((t: any) => ({
          id: t.id,
          type: 'function',
          function: {
            name: t.name,
            arguments: JSON.stringify(t.input),
          },
        }))
      }

      return msg
    }

    return { role: m.role, content: m.content }
  }
}
