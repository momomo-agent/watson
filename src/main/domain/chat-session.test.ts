import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatSession, type LLMStreamFn, type StreamChunk } from './chat-session'
import type { SenseContext } from './sense-loop'

// Helper: create a mock LLM stream that yields given chunks
function mockStream(chunks: StreamChunk[]): LLMStreamFn {
  return async function* (_messages, _signal) {
    for (const chunk of chunks) {
      yield chunk
    }
  }
}

// Helper: simple text response
function textResponse(text: string): LLMStreamFn {
  return mockStream([
    { type: 'text', text },
    { type: 'done', stopReason: 'end_turn' },
  ])
}

describe('ChatSession', () => {
  let session: ChatSession

  beforeEach(() => {
    session = new ChatSession('test-1', '/tmp/test-workspace', textResponse('Hello!'))
  })

  // ── Basic Message Flow ──

  it('sends a message and gets response', async () => {
    await session.sendMessage('Hi')

    expect(session.messages).toHaveLength(2)
    expect(session.messages[0].role).toBe('user')
    expect(session.messages[0].content).toBe('Hi')
    expect(session.messages[1].role).toBe('assistant')
    expect(session.messages[1].content).toBe('Hello!')
    expect(session.messages[1].status).toBe('complete')
  })

  it('emits update events', async () => {
    const updates: any[] = []
    session.on('update', (evt) => updates.push(evt))

    await session.sendMessage('Test')

    expect(updates.length).toBeGreaterThan(0)
    expect(updates[updates.length - 1].messages).toHaveLength(2)
  })

  // ── Sense Context Injection ──

  it('injects sense context into history', async () => {
    let capturedMessages: any[] = []
    const spyStream: LLMStreamFn = async function* (messages, _signal) {
      capturedMessages = messages
      yield { type: 'text', text: 'Got it' }
      yield { type: 'done', stopReason: 'end_turn' }
    }

    session = new ChatSession('test-2', '/tmp/test', spyStream)

    const ctx: SenseContext = {
      activity: 'Using Code — main.ts',
      activeApp: 'Code',
      activeWindow: 'main.ts — watson',
      visibleText: 'function hello() { return 42 }',
      focusedElement: 'TextField: search',
      screenSummary: 'Code | main.ts',
      timestamp: Date.now(),
      confidence: 0.7,
    }
    session.setSenseContext(ctx)

    await session.sendMessage('What am I working on?')

    // Should have injected context as first message
    expect(capturedMessages.length).toBeGreaterThanOrEqual(2)
    const contextMsg = capturedMessages.find(
      (m: any) => typeof m.content === 'string' && m.content.includes('当前环境')
    )
    expect(contextMsg).toBeDefined()
    expect(contextMsg.content).toContain('Code')
    expect(contextMsg.content).toContain('main.ts — watson')
  })

  it('does not inject low-confidence context', async () => {
    let capturedMessages: any[] = []
    const spyStream: LLMStreamFn = async function* (messages, _signal) {
      capturedMessages = messages
      yield { type: 'text', text: 'ok' }
      yield { type: 'done', stopReason: 'end_turn' }
    }

    session = new ChatSession('test-3', '/tmp/test', spyStream)

    session.setSenseContext({
      activity: 'unknown',
      activeApp: '',
      activeWindow: '',
      visibleText: '',
      focusedElement: '',
      screenSummary: '',
      timestamp: Date.now(),
      confidence: 0.1, // below 0.3 threshold
    })

    await session.sendMessage('Hello')

    const contextMsg = capturedMessages.find(
      (m: any) => typeof m.content === 'string' && m.content.includes('当前环境')
    )
    expect(contextMsg).toBeUndefined()
  })

  it('does not re-inject same context timestamp', async () => {
    let callCount = 0
    let contextInjections = 0
    const spyStream: LLMStreamFn = async function* (messages, _signal) {
      callCount++
      if (messages.some((m: any) => typeof m.content === 'string' && m.content.includes('当前环境'))) {
        contextInjections++
      }
      yield { type: 'text', text: `reply ${callCount}` }
      yield { type: 'done', stopReason: 'end_turn' }
    }

    session = new ChatSession('test-4', '/tmp/test', spyStream)

    const ts = Date.now()
    session.setSenseContext({
      activity: 'Using Safari',
      activeApp: 'Safari',
      activeWindow: 'Google',
      visibleText: '',
      focusedElement: '',
      screenSummary: '',
      timestamp: ts,
      confidence: 0.7,
    })

    await session.sendMessage('First')
    await session.sendMessage('Second')

    // First call should inject, second should not (same timestamp)
    expect(contextInjections).toBe(1)
  })

  // ── Attachments ──

  it('stores attachments on user message', async () => {
    const attachments = [
      { name: 'test.png', type: 'image/png', path: '/tmp/test.png', size: 100 },
    ]

    await session.sendMessage('Look at this', undefined, attachments)

    expect(session.messages[0].attachments).toHaveLength(1)
    expect(session.messages[0].attachments![0].name).toBe('test.png')
  })

  // ── Cancel ──

  it('cancels active request', async () => {
    let aborted = false
    let resolveWait: () => void
    const waitPromise = new Promise<void>(r => { resolveWait = r })

    const slowStream: LLMStreamFn = async function* (_messages, signal) {
      signal.addEventListener('abort', () => { aborted = true; resolveWait!() })
      yield { type: 'text', text: 'Starting...' }
      // Wait until aborted or timeout
      await Promise.race([
        waitPromise,
        new Promise(r => setTimeout(r, 500)),
      ])
      yield { type: 'done', stopReason: 'end_turn' }
    }

    session = new ChatSession('test-5', '/tmp/test', slowStream)

    const promise = session.sendMessage('Slow task')

    // Wait for stream to start, then cancel
    await new Promise(r => setTimeout(r, 20))
    const msgId = session.messages[1].id
    session.cancel(msgId)

    await promise
    expect(aborted).toBe(true)
  }, 2000)

  // ── Retry ──

  it('retries a failed message', async () => {
    let callCount = 0
    const failThenSucceed: LLMStreamFn = async function* (_messages, _signal) {
      callCount++
      if (callCount === 1) {
        yield { type: 'error', error: 'API error', errorCategory: 'network', errorRetryable: true }
        return
      }
      yield { type: 'text', text: 'Success on retry' }
      yield { type: 'done', stopReason: 'end_turn' }
    }

    session = new ChatSession('test-6', '/tmp/test', failThenSucceed)

    await session.sendMessage('Try this')
    expect(session.messages[1].status).toBe('error')

    await session.retry(session.messages[1].id)
    expect(session.messages[1].content).toBe('Success on retry')
    expect(session.messages[1].status).toBe('complete')
  })

  // ── Persist ──

  it('emits persist events for each message', async () => {
    const persisted: any[] = []
    session.on('persist', (msg) => persisted.push({ ...msg }))

    await session.sendMessage('Persist test')

    expect(persisted.length).toBeGreaterThanOrEqual(2)
    expect(persisted.some(m => m.role === 'user')).toBe(true)
    expect(persisted.some(m => m.role === 'assistant')).toBe(true)
  })
})
