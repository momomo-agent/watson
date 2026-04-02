/**
 * API Retry — Infrastructure Layer
 *
 * Fetch wrapper with exponential backoff, jitter, and retry-after parsing.
 * Used by EnhancedLLMClient for resilient API calls.
 *
 * Ported from paw/core/api-retry.js, adapted for TypeScript.
 */

const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 30000
const JITTER = 0.1
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]) // 529 = Anthropic overloaded

export interface RetryOptions {
  maxAttempts?: number
  signal?: AbortSignal
  onRetry?: (attempt: number, delayMs: number, reason: string) => void
}

/**
 * Parse Retry-After header value (seconds or HTTP date).
 */
function parseRetryAfter(res: Response): number | null {
  const header = res.headers?.get?.('retry-after')
  if (!header) return null
  const secs = parseFloat(header)
  if (!isNaN(secs)) return Math.min(secs * 1000, MAX_DELAY_MS)
  const date = new Date(header)
  if (!isNaN(date.getTime())) return Math.min(date.getTime() - Date.now(), MAX_DELAY_MS)
  return null
}

/**
 * Add jitter to a delay value (±10%).
 */
function addJitter(ms: number): number {
  const jit = ms * JITTER * (Math.random() * 2 - 1)
  return Math.max(0, Math.round(ms + jit))
}

/**
 * Fetch with retry + exponential backoff.
 *
 * Retries on 429, 500, 502, 503, 529 and network errors.
 * Respects Retry-After headers.
 * Never retries aborted requests.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  opts: RetryOptions = {}
): Promise<Response> {
  const maxAttempts = opts.maxAttempts || MAX_ATTEMPTS
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, options)

      if (!RETRYABLE_STATUS.has(res.status) || attempt === maxAttempts) {
        return res
      }

      // Retryable status — compute delay and retry
      const retryAfter = parseRetryAfter(res)
      const expDelay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS)
      const delay = retryAfter || addJitter(expDelay)

      const reason = `HTTP ${res.status}`
      console.warn(
        `[api-retry] ${reason} on attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms`
      )
      opts.onRetry?.(attempt, delay, reason)

      await sleep(delay, opts.signal)
    } catch (err: any) {
      lastError = err

      // Never retry aborted requests
      if (err.name === 'AbortError') throw err
      if (opts.signal?.aborted) throw err

      if (attempt === maxAttempts) throw err

      const delay = addJitter(BASE_DELAY_MS * Math.pow(2, attempt - 1))
      const reason = `Network error: ${err.message}`
      console.warn(
        `[api-retry] ${reason} on attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms`
      )
      opts.onRetry?.(attempt, delay, reason)

      await sleep(delay, opts.signal)
    }
  }

  throw lastError || new Error('All retry attempts exhausted')
}

/**
 * Sleep with abort support.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })
}
