/**
 * API Key Rotation — Infrastructure Layer
 *
 * Manages multiple API keys for a single provider with automatic rotation.
 * Tracks usage stats and rotates on rate-limit errors.
 *
 * Ported from paw/core/api-keys.js, adapted for TypeScript.
 */

export interface KeyStats {
  uses: number
  failures: number
  lastUsed?: number
  lastRotated?: number
}

export interface KeyRotationState {
  currentIndex: number
  stats: Map<number, KeyStats>
}

/**
 * API Key Manager for a single provider.
 *
 * Supports both single key and multi-key configurations.
 * Thread-safe for concurrent requests (uses atomic index updates).
 */
export class ApiKeyManager {
  private keys: string[]
  private state: KeyRotationState

  constructor(keys: string | string[]) {
    this.keys = Array.isArray(keys) ? keys : [keys]
    this.state = {
      currentIndex: 0,
      stats: new Map(),
    }
  }

  /**
   * Get the current API key.
   */
  getCurrentKey(): string {
    return this.keys[this.state.currentIndex % this.keys.length]
  }

  /**
   * Get the current key index (for logging).
   */
  getCurrentIndex(): number {
    return this.state.currentIndex
  }

  /**
   * Get total number of keys.
   */
  getKeyCount(): number {
    return this.keys.length
  }

  /**
   * Rotate to the next API key.
   *
   * Returns true if rotation happened, false if only one key available.
   */
  rotate(): boolean {
    if (this.keys.length <= 1) return false

    const oldIndex = this.state.currentIndex
    this.state.currentIndex = (this.state.currentIndex + 1) % this.keys.length

    const stats = this.getOrCreateStats(this.state.currentIndex)
    stats.lastRotated = Date.now()

    console.log(
      `[api-keys] Rotated from key ${oldIndex + 1} to ${this.state.currentIndex + 1}/${this.keys.length}`
    )

    return true
  }

  /**
   * Record a key usage (success or failure).
   */
  recordUsage(success: boolean): void {
    const stats = this.getOrCreateStats(this.state.currentIndex)
    stats.uses++
    stats.lastUsed = Date.now()
    if (!success) stats.failures++
  }

  /**
   * Get usage statistics for all keys.
   */
  getStats(): Map<number, KeyStats> {
    return new Map(this.state.stats)
  }

  /**
   * Get stats for a specific key index.
   */
  getKeyStats(index: number): KeyStats | undefined {
    return this.state.stats.get(index)
  }

  /**
   * Reset all statistics (useful for testing).
   */
  resetStats(): void {
    this.state.stats.clear()
  }

  private getOrCreateStats(index: number): KeyStats {
    if (!this.state.stats.has(index)) {
      this.state.stats.set(index, { uses: 0, failures: 0 })
    }
    return this.state.stats.get(index)!
  }
}

/**
 * Global key managers per provider.
 *
 * Keyed by provider name (e.g., 'anthropic', 'openai').
 * Allows different providers to have independent rotation state.
 */
const keyManagers = new Map<string, ApiKeyManager>()

/**
 * Get or create a key manager for a provider.
 */
export function getKeyManager(provider: string, keys: string | string[]): ApiKeyManager {
  if (!keyManagers.has(provider)) {
    keyManagers.set(provider, new ApiKeyManager(keys))
  }
  return keyManagers.get(provider)!
}

/**
 * Clear all key managers (useful for testing or config reload).
 */
export function clearKeyManagers(): void {
  keyManagers.clear()
}
