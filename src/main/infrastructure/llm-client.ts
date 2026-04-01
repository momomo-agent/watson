/**
 * LLMClient — Infrastructure Layer
 * 
 * Wraps agentic-core's agenticAsk for LLM calls.
 * Dogfooding: we use our own library, not raw fetch.
 */

export interface StreamChunk {
  type: 'text' | 'tool_use' | 'done'
  text?: string
  tool?: { name: string; input: any }
}

export interface LLMOptions {
  messages: Array<{ role: string; content: string }>
  signal: AbortSignal
  provider?: 'anthropic' | 'openai'
  apiKey?: string
  baseUrl?: string
  model?: string
  system?: string
}

// Load agentic-core (UMD module)
let _agenticCore: any = null
function getAgenticCore() {
  if (!_agenticCore) {
    _agenticCore = require('/Users/kenefe/LOCAL/momo-agent/projects/agentic-core/agentic-core.js')
  }
  return _agenticCore
}

export class LLMClient {
  /**
   * Stream a chat completion via agentic-core.
   * 
   * Uses agenticAsk with stream=true and emit('token') for streaming.
   * Returns an async generator that yields StreamChunks.
   */
  static async *streamChat(options: LLMOptions): AsyncGenerator<StreamChunk> {
    const { messages, signal, provider = 'anthropic', apiKey, baseUrl, model, system } = options

    if (!apiKey) {
      throw new Error('No API key provided')
    }

    // Build the prompt from the last user message
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUserMsg) {
      throw new Error('No user message found')
    }

    // Build history (everything except the last user message)
    const lastUserIndex = messages.lastIndexOf(lastUserMsg)
    const history = messages.slice(0, lastUserIndex).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))

    // Create a channel for streaming tokens
    const tokenQueue: Array<{ text: string } | null> = []
    let resolveWait: (() => void) | null = null
    let streamError: Error | null = null
    let streamDone = false

    const emit = (event: string, data?: any) => {
      if (event === 'token' && data?.text) {
        tokenQueue.push({ text: data.text })
        if (resolveWait) {
          resolveWait()
          resolveWait = null
        }
      }
    }

    // Start agenticAsk in background
    const agenticCore = getAgenticCore()
    const askPromise = agenticCore.agenticAsk(lastUserMsg.content, {
      provider,
      apiKey,
      baseUrl,
      model,
      system,
      history,
      tools: [],  // M1: no tools, just chat
      stream: true,
    }, emit).then(() => {
      streamDone = true
      if (resolveWait) {
        resolveWait()
        resolveWait = null
      }
    }).catch((err: Error) => {
      streamError = err
      streamDone = true
      if (resolveWait) {
        resolveWait()
        resolveWait = null
      }
    })

    // Handle abort
    const onAbort = () => {
      streamError = new Error('Request aborted')
      streamDone = true
      if (resolveWait) {
        resolveWait()
        resolveWait = null
      }
    }
    signal.addEventListener('abort', onAbort, { once: true })

    try {
      // Yield tokens as they arrive
      while (true) {
        if (tokenQueue.length > 0) {
          const token = tokenQueue.shift()!
          yield { type: 'text' as const, text: token.text }
          continue
        }

        if (streamDone) {
          // Drain remaining tokens
          while (tokenQueue.length > 0) {
            const token = tokenQueue.shift()!
            yield { type: 'text' as const, text: token.text }
          }
          break
        }

        // Wait for next token or completion
        await new Promise<void>(resolve => {
          resolveWait = resolve
        })
      }

      if (streamError) {
        throw streamError
      }

      yield { type: 'done' as const }
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
  }
}
