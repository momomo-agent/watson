import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SenseLoop } from './sense-loop'
import type { SenseContext } from './sense-loop'

describe('SenseLoop', () => {
  let loop: SenseLoop

  beforeEach(() => {
    loop = new SenseLoop({ intervalMs: 100, changeThreshold: 0.3 })
  })

  it('starts and stops', () => {
    expect(loop.isRunning()).toBe(false)
    loop.start()
    expect(loop.isRunning()).toBe(true)
    loop.stop()
    expect(loop.isRunning()).toBe(false)
  })

  it('does not double-start', () => {
    loop.start()
    loop.start() // should be no-op
    expect(loop.isRunning()).toBe(true)
    loop.stop()
  })

  it('getContext returns null before first tick', () => {
    expect(loop.getContext()).toBeNull()
  })

  it('emits context on first tick (always significant)', async () => {
    const mockAi = {
      sense: vi.fn().mockResolvedValue([
        { role: 'MenuBarItem', label: 'Code' },
        { role: 'Window', title: 'main.ts — watson' },
        { role: 'StaticText', value: 'function hello()' },
      ]),
    }
    loop.setAgentic(mockAi)

    const contextPromise = new Promise<SenseContext>((resolve) => {
      loop.on('context', resolve)
    })

    loop.start()
    const ctx = await contextPromise
    loop.stop()

    expect(ctx.activeApp).toBe('Code')
    expect(ctx.activeWindow).toBe('main.ts — watson')
    expect(ctx.visibleText).toContain('function hello()')
    expect(ctx.confidence).toBeGreaterThan(0)
    expect(ctx.timestamp).toBeGreaterThan(0)
  })

  it('does not emit when no significant change', async () => {
    const sameData = [
      { role: 'MenuBarItem', label: 'Safari' },
      { role: 'Window', title: 'Google' },
    ]
    const mockAi = { sense: vi.fn().mockResolvedValue(sameData) }
    loop.setAgentic(mockAi)

    let emitCount = 0
    loop.on('context', () => emitCount++)

    loop.start()
    // Wait for 3 ticks
    await new Promise(r => setTimeout(r, 350))
    loop.stop()

    // First tick always emits, subsequent same-data ticks should not
    expect(emitCount).toBe(1)
  })

  it('emits on app switch', async () => {
    let callCount = 0
    const mockAi = {
      sense: vi.fn().mockImplementation(async () => {
        callCount++
        return callCount === 1
          ? [{ role: 'MenuBarItem', label: 'Safari' }]
          : [{ role: 'MenuBarItem', label: 'Code' }]
      }),
    }
    loop.setAgentic(mockAi)

    const contexts: SenseContext[] = []
    loop.on('context', (ctx) => contexts.push(ctx))

    loop.start()
    await new Promise(r => setTimeout(r, 250))
    loop.stop()

    expect(contexts.length).toBeGreaterThanOrEqual(2)
    expect(contexts[0].activeApp).toBe('Safari')
    expect(contexts[1].activeApp).toBe('Code')
  })

  it('handles capture failure gracefully', async () => {
    const mockAi = {
      sense: vi.fn().mockRejectedValue(new Error('AX timeout')),
    }
    loop.setAgentic(mockAi)

    const contexts: SenseContext[] = []
    loop.on('context', (ctx) => contexts.push(ctx))

    loop.start()
    await new Promise(r => setTimeout(r, 150))
    loop.stop()

    // sense() fails → fallback to agent-control CLI (also fails in test) → returns null
    // infer(null) returns empty context → first tick still emits (always significant)
    // Key: loop didn't crash
    expect(contexts.length).toBe(1)
    expect(contexts[0].activeApp).toBe('')
    expect(contexts[0].confidence).toBe(0)
  })

  it('handles null/empty capture', async () => {
    const mockAi = { sense: vi.fn().mockResolvedValue(null) }
    loop.setAgentic(mockAi)

    const contexts: SenseContext[] = []
    loop.on('context', (ctx) => contexts.push(ctx))

    loop.start()
    await new Promise(r => setTimeout(r, 150))
    loop.stop()

    // Should emit with unknown/empty context
    expect(contexts.length).toBe(1)
    expect(contexts[0].activeApp).toBe('')
    expect(contexts[0].confidence).toBe(0)
  })

  it('extracts focused element', async () => {
    const mockAi = {
      sense: vi.fn().mockResolvedValue([
        { role: 'MenuBarItem', label: 'Code' },
        { role: 'TextField', label: 'Search', focused: true },
      ]),
    }
    loop.setAgentic(mockAi)

    const ctx = await new Promise<SenseContext>((resolve) => {
      loop.on('context', resolve)
      loop.start()
    })
    loop.stop()

    expect(ctx.focusedElement).toContain('Search')
  })

  it('truncates visibleText to 500 chars', async () => {
    const longText = 'a'.repeat(1000)
    const mockAi = {
      sense: vi.fn().mockResolvedValue([
        { role: 'MenuBarItem', label: 'App' },
        { role: 'StaticText', value: longText },
      ]),
    }
    loop.setAgentic(mockAi)

    const ctx = await new Promise<SenseContext>((resolve) => {
      loop.on('context', resolve)
      loop.start()
    })
    loop.stop()

    expect(ctx.visibleText.length).toBeLessThanOrEqual(500)
  })
})
