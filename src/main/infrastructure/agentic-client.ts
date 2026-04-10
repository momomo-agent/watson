/**
 * AgenticClient integration for Watson.
 *
 * Uses the real AgenticClient from the agentic-client package (linked via file:).
 * The client provides: chat, sense, speak, listen, model management.
 *
 * NOTE: AgenticClient.chat() currently returns string | AsyncGenerator<string>,
 * which lacks structured events (tool_use, stop_reason). Watson's chat flow
 * needs these. We'll upgrade AgenticClient to support structured streaming
 * events before replacing Watson's providers in Step 3.
 */

import { AgenticClient } from 'agentic-client'
import { agenticService } from './agentic-service'

let client: AgenticClient | null = null

export function getAgenticClient(): AgenticClient {
  if (!client) {
    client = new AgenticClient({
      serviceUrl: agenticService.getBaseUrl()
    })
  }
  return client
}

/**
 * Reinitialize client (e.g., after service restart or config change)
 */
export function resetAgenticClient(): void {
  client = null
}
