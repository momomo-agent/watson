/**
 * Context Guard — Infrastructure Layer
 *
 * Pre-flight check: ensures total context fits within the model's window
 * before sending to the LLM. If over budget, compacts oldest tool results
 * in-place to free space.
 *
 * Ported from paw/core/context-guard.js, adapted for TypeScript.
 */

/** Use at most 75% of the context window for input */
const CONTEXT_INPUT_HEADROOM = 0.75
/** Rough chars-per-token estimate */
const CHARS_PER_TOKEN = 4

export interface GuardMessage {
  role: string
  content: string | any[]
  tool_calls?: Array<{ function?: { arguments?: string } }>
}

export interface ContextGuardResult {
  withinBudget: boolean
  estimatedTokens: number
  budgetTokens: number
  compacted: boolean
}

/**
 * Estimate total context chars from a messages array.
 * Handles string content, block arrays, and OpenAI tool_calls.
 */
export function estimateContextChars(messages: GuardMessage[]): number {
  let total = 0
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += msg.content.length
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block && typeof block.text === 'string') total += block.text.length
        else if (block && typeof block.content === 'string') total += block.content.length
      }
    }
    // OpenAI tool_calls in assistant messages
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.function?.arguments) total += tc.function.arguments.length
      }
    }
  }
  return total
}

/**
 * Enforce context budget by compacting oldest tool results in-place.
 *
 * Strategy: replace the content of old tool results with a placeholder,
 * starting from the oldest messages, until context is under budget.
 *
 * @returns The (possibly modified) messages array and a guard result.
 */
export function enforceContextBudget(
  messages: GuardMessage[],
  contextWindowTokens: number
): { messages: GuardMessage[]; result: ContextGuardResult } {
  const budgetChars = Math.max(
    1024,
    Math.floor(contextWindowTokens * CHARS_PER_TOKEN * CONTEXT_INPUT_HEADROOM)
  )
  const budgetTokens = Math.floor(budgetChars / CHARS_PER_TOKEN)
  let currentChars = estimateContextChars(messages)

  if (currentChars <= budgetChars) {
    return {
      messages,
      result: {
        withinBudget: true,
        estimatedTokens: Math.floor(currentChars / CHARS_PER_TOKEN),
        budgetTokens,
        compacted: false,
      },
    }
  }

  // Compact oldest tool results first until under budget
  const PLACEHOLDER = '[compacted: tool output removed to free context]'
  let compacted = false

  for (let i = 0; i < messages.length && currentChars > budgetChars; i++) {
    const msg = messages[i]

    // Anthropic-style tool results
    const isToolResult =
      msg.role === 'user' &&
      Array.isArray(msg.content) &&
      msg.content.some((b: any) => b.type === 'tool_result')

    // OpenAI-style tool messages
    const isOaiTool = msg.role === 'tool'

    if (isToolResult && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (
          block.type === 'tool_result' &&
          typeof block.content === 'string' &&
          block.content.length > PLACEHOLDER.length
        ) {
          currentChars -= block.content.length - PLACEHOLDER.length
          block.content = PLACEHOLDER
          compacted = true
        }
      }
    } else if (
      isOaiTool &&
      typeof msg.content === 'string' &&
      (msg.content as string).length > PLACEHOLDER.length
    ) {
      currentChars -= (msg.content as string).length - PLACEHOLDER.length
      ;(msg as any).content = PLACEHOLDER
      compacted = true
    }
  }

  return {
    messages,
    result: {
      withinBudget: currentChars <= budgetChars,
      estimatedTokens: Math.floor(currentChars / CHARS_PER_TOKEN),
      budgetTokens,
      compacted,
    },
  }
}

/**
 * Quick check: is context within budget?
 */
export function isWithinBudget(messages: GuardMessage[], contextWindowTokens: number): boolean {
  const budgetChars = Math.max(
    1024,
    Math.floor(contextWindowTokens * CHARS_PER_TOKEN * CONTEXT_INPUT_HEADROOM)
  )
  return estimateContextChars(messages) <= budgetChars
}
