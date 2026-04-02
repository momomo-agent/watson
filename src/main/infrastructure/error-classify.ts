/**
 * Error Classification — Infrastructure Layer
 *
 * Classifies API errors into actionable categories:
 *   context | billing | rate-limit | auth | server | network | unknown
 *
 * Ported from paw/core/error-classify.js, adapted for TypeScript.
 */

// Anthropic magic string scrub — prevent refusal test injection
const ANTHROPIC_MAGIC = 'ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL'

export type ErrorCategory =
  | 'context'
  | 'billing'
  | 'rate-limit'
  | 'auth'
  | 'server'
  | 'network'
  | 'unknown'

export interface ClassifiedError {
  short: string
  detail: string
  category: ErrorCategory
  retryable: boolean
  /** Suggested wait time in ms before retry (0 = don't retry) */
  retryAfterMs: number
}

/**
 * Scrub Anthropic magic strings from text to prevent refusal injection.
 */
export function scrubMagicStrings(text: string): string {
  if (!text || !text.includes(ANTHROPIC_MAGIC)) return text
  return text.split(ANTHROPIC_MAGIC).join('ANTHROPIC MAGIC STRING (redacted)')
}

/**
 * Check if an HTTP status + body indicates context overflow.
 */
export function isContextOverflowError(status: number, body: string): boolean {
  if (status === 400) {
    const lower = (body || '').toLowerCase()
    return (
      lower.includes('context') ||
      lower.includes('too many tokens') ||
      lower.includes('maximum context length') ||
      lower.includes('prompt is too long')
    )
  }
  return false
}

/**
 * Check if an HTTP status + body indicates a billing issue.
 */
export function isBillingError(status: number, body: string): boolean {
  return status === 402 || (status === 400 && (body || '').toLowerCase().includes('billing'))
}

/**
 * Classify an error into a structured, actionable object.
 */
export function classifyError(err: any): ClassifiedError {
  if (!err) {
    return {
      short: 'Error',
      detail: 'Unknown error',
      category: 'unknown',
      retryable: false,
      retryAfterMs: 0,
    }
  }

  const msg = err?.message || String(err) || ''
  const lower = msg.toLowerCase()
  const status = err?.status || err?.statusCode || extractStatusCode(lower)

  // Context overflow
  if (
    (lower.includes('context') && lower.includes('length')) ||
    lower.includes('too many tokens') ||
    lower.includes('prompt is too long') ||
    lower.includes('maximum context length') ||
    isContextOverflowError(status, msg)
  ) {
    return {
      short: 'Context too long',
      detail: 'The conversation is too long. Context will be compacted automatically.',
      category: 'context',
      retryable: true, // retryable after compaction
      retryAfterMs: 0,
    }
  }

  // Auth errors
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid') && lower.includes('key')) {
    return {
      short: 'Invalid API key',
      detail: 'Your API key was rejected. Check Settings to update it.',
      category: 'auth',
      retryable: false,
      retryAfterMs: 0,
    }
  }

  // Rate limit
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many')) {
    const retryAfter = extractRetryAfter(msg)
    return {
      short: 'Rate limited',
      detail: 'Too many requests. Will retry automatically.',
      category: 'rate-limit',
      retryable: true,
      retryAfterMs: retryAfter || 5000,
    }
  }

  // Billing
  if (lower.includes('billing') || lower.includes('402') || lower.includes('insufficient')) {
    return {
      short: 'Billing error',
      detail: 'Check your API account balance.',
      category: 'billing',
      retryable: false,
      retryAfterMs: 0,
    }
  }

  // Server overload (503, 529)
  if (lower.includes('overloaded') || lower.includes('503') || lower.includes('529')) {
    return {
      short: 'Server overloaded',
      detail: 'The API server is temporarily overloaded. Retrying...',
      category: 'server',
      retryable: true,
      retryAfterMs: 3000,
    }
  }

  // Network errors
  if (
    lower.includes('timeout') ||
    lower.includes('econnreset') ||
    lower.includes('socket hang up') ||
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('network') ||
    lower.includes('fetch failed')
  ) {
    return {
      short: 'Network error',
      detail: 'Could not reach the API server. Check your internet connection.',
      category: 'network',
      retryable: true,
      retryAfterMs: 2000,
    }
  }

  // Unknown — clean up and return
  let clean = msg
    .replace(/^Error invoking remote method '[^']+': Error: /i, '')
    .replace(/^Error: /i, '')
    .replace(/^Error invoking remote method '[^']+': /i, '')
  if (clean.length > 200) clean = clean.slice(0, 200) + '…'

  return {
    short: clean.length > 80 ? clean.slice(0, 77) + '…' : clean,
    detail: clean,
    category: 'unknown',
    retryable: false,
    retryAfterMs: 0,
  }
}

function extractStatusCode(lower: string): number {
  const match = lower.match(/\b(4\d{2}|5\d{2})\b/)
  return match ? parseInt(match[1], 10) : 0
}

function extractRetryAfter(msg: string): number | null {
  const match = msg.match(/retry.after[:\s]*(\d+)/i)
  if (match) return parseInt(match[1], 10) * 1000
  return null
}
