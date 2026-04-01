export interface StreamChunk {
  type: 'text' | 'tool_use' | 'done'
  text?: string
  tool?: any
}

export interface LLMOptions {
  messages: Array<{ role: string, content: string }>
  signal: AbortSignal
  provider?: 'anthropic' | 'openai'
  apiKey?: string
  baseUrl?: string
  model?: string
}

export class LLMClient {
  static async *streamChat(options: LLMOptions): AsyncIterator<StreamChunk> {
    const provider = options.provider || 'anthropic'
    
    if (provider === 'anthropic') {
      yield* this.streamAnthropic(options)
    } else {
      yield* this.streamOpenAI(options)
    }
  }

  private static async *streamAnthropic(options: LLMOptions): AsyncIterator<StreamChunk> {
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY
    const baseUrl = options.baseUrl || 'https://api.anthropic.com'
    const model = options.model || 'claude-sonnet-4-20250514'

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        max_tokens: 4096,
        stream: true,
      }),
      signal: options.signal,
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    yield* this.parseSSE(response.body!, 'anthropic')
  }

  private static async *streamOpenAI(options: LLMOptions): AsyncIterator<StreamChunk> {
    const apiKey = options.apiKey || process.env.OPENAI_API_KEY
    const baseUrl = options.baseUrl || 'https://api.openai.com'
    const model = options.model || 'gpt-4'

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        stream: true,
      }),
      signal: options.signal,
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    yield* this.parseSSE(response.body!, 'openai')
  }

  private static async *parseSSE(
    stream: ReadableStream,
    provider: 'anthropic' | 'openai'
  ): AsyncIterator<StreamChunk> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          if (line === 'data: [DONE]') continue

          try {
            const data = JSON.parse(line.slice(6))

            if (provider === 'anthropic') {
              if (data.type === 'content_block_delta' && data.delta?.text) {
                yield { type: 'text', text: data.delta.text }
              }
            } else {
              const delta = data.choices?.[0]?.delta
              if (delta?.content) {
                yield { type: 'text', text: delta.content }
              }
            }
          } catch (err) {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    yield { type: 'done' }
  }
}
