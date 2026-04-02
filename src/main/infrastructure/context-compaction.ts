/**
 * Context Compaction — Infrastructure Layer
 *
 * Model-aware conversation compression with LLM summarization.
 * Triggers when context approaches the model's window limit.
 *
 * Ported from paw/core/compaction.js, adapted for TypeScript.
 */

// Model context windows (tokens) — conservative estimates
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic
  'claude-sonnet-4-20250514': 200000,
  'claude-opus-4-20250514': 200000,
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-haiku-20240307': 200000,
  // OpenAI
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'o1': 200000,
  'o3': 200000,
  'o3-mini': 200000,
  'o4-mini': 200000,
}

/** Trigger compaction when context reaches this fraction of the model's window */
const COMPACT_TRIGGER_RATIO = 0.75
/** Fallback threshold when model is unknown (tokens) */
const COMPACT_THRESHOLD_FALLBACK = 80000
/** Number of recent message pairs to keep after compaction */
const COMPACT_KEEP_RECENT = 4
/** Reserve tokens for response */
const RESPONSE_RESERVE = 4096

export interface CompactionMessage {
  role: string
  content: string
}

export type RawLLMFn = (
  messages: CompactionMessage[],
  system: string,
  config?: any
) => Promise<string>

/**
 * Get the context window size for a model.
 */
export function getContextWindowForModel(model: string | undefined): number | null {
  if (!model) return null
  const normalized = model.toLowerCase()

  // Exact match
  if (MODEL_CONTEXT_WINDOWS[normalized]) return MODEL_CONTEXT_WINDOWS[normalized]

  // Prefix match
  for (const [key, val] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (
      normalized.startsWith(key.split('-').slice(0, -1).join('-')) ||
      key.startsWith(normalized)
    ) {
      return val
    }
  }

  // Heuristic
  if (normalized.includes('claude')) return 200000
  if (normalized.includes('gpt') || normalized.includes('o1') || normalized.includes('o3')) return 128000
  return null
}

/**
 * Get the token threshold at which compaction should trigger.
 */
export function getCompactThreshold(model?: string): number {
  const window = getContextWindowForModel(model)
  if (window) return Math.floor((window - RESPONSE_RESERVE) * COMPACT_TRIGGER_RATIO)
  return COMPACT_THRESHOLD_FALLBACK
}

/**
 * Rough token count estimate (~3.5 chars per token for mixed content).
 */
export function estimateTokens(text: string | any): number {
  if (!text) return 0
  if (typeof text === 'string') return Math.ceil(text.length / 3.5)
  if (Array.isArray(text)) {
    return text.reduce((s: number, c: any) => s + estimateTokens(c.text || ''), 0)
  }
  return 0
}

/**
 * Estimate total tokens across a message array.
 */
export function estimateMessagesTokens(messages: CompactionMessage[]): number {
  return messages.reduce((s, m) => s + estimateTokens(m.content) + 10, 0)
}

/**
 * Check if compaction is needed.
 */
export function needsCompaction(messages: CompactionMessage[], model?: string): boolean {
  const threshold = getCompactThreshold(model)
  const currentTokens = estimateMessagesTokens(messages)
  return currentTokens >= threshold
}

/**
 * Compact conversation history using LLM summarization.
 *
 * Keeps the most recent messages and summarizes the rest.
 * Falls back to simple truncation if LLM summarization fails.
 */
export async function compactHistory(
  messages: CompactionMessage[],
  rawFn: RawLLMFn,
  opts: { model?: string; memoryFlush?: boolean } = {}
): Promise<CompactionMessage[]> {
  const keepCount = COMPACT_KEEP_RECENT * 2 // pairs of user+assistant
  if (messages.length <= keepCount + 2) return messages

  const toSummarize = messages.slice(0, messages.length - keepCount)
  const toKeep = messages.slice(messages.length - keepCount)

  const transcript = toSummarize
    .map(
      (m) =>
        `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`
    )
    .join('\n')
    .slice(0, 30000)

  const summaryPrompt = `Summarize this conversation concisely. Preserve: key decisions, TODOs, open questions, user preferences, file paths mentioned, and current task context. IMPORTANT: Preserve all identifiers verbatim — file paths, commit hashes, URLs, session IDs, variable names, and any opaque strings. Do not paraphrase or generalize identifiers. Output in the same language as the conversation.\n\n${transcript}`

  try {
    const summary = await rawFn(
      [{ role: 'user', content: summaryPrompt }],
      'You are a conversation summarizer. Be concise but preserve all important context.'
    )

    const compactedMessages: CompactionMessage[] = [
      { role: 'user', content: '[Previous conversation summary]' },
      { role: 'assistant', content: summary || 'No prior context.' },
      ...toKeep,
    ]
    console.log(
      `[compaction] ${messages.length} msgs → ${compactedMessages.length} msgs (summarized ${toSummarize.length} msgs)`
    )
    return compactedMessages
  } catch (e: any) {
    console.warn('[compaction] Failed, using truncation fallback:', e.message)
    return [
      { role: 'user', content: '[Earlier conversation was truncated due to length]' },
      { role: 'assistant', content: "Understood. I'll continue from the recent context." },
      ...toKeep,
    ]
  }
}
