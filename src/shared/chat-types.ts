/**
 * Chat Types — Shared between main and renderer
 *
 * ## Architecture
 *
 * Session has participants (workspace agents + user).
 * Each message has a sender identity, independent of role.
 * Assistant messages contain an ordered flow of segments:
 *   thinking → tool calls → text → thinking → tool calls → text → ...
 *
 * ## Message Status State Machine
 *
 *   queued ──→ pending ──→ streaming ──→ complete
 *                │              │
 *                │              ├──→ tool_calling ──→ streaming (loop)
 *                │              │
 *                ▼              ▼
 *              error          error
 *                │              │
 *                ▼              ▼
 *            (retryable?)   cancelled
 *
 *   queued: user sent while assistant is still responding (collect mode)
 *   pending: sent to LLM, waiting for first token
 *   streaming: receiving tokens
 *   tool_calling: LLM requested tool execution, waiting for results
 *   complete: done
 *   error: failed (may be retryable)
 *   cancelled: user cancelled
 *
 * ## Multi-Agent (Delegate)
 *
 * In a group session, the "owner" agent (workspace host) may delegate
 * to other agents. Each message carries sender identity so the UI
 * renders the correct avatar/name regardless of who actually responded.
 *
 *   User sends message → owner agent receives
 *   Owner decides to delegate → creates agent-to-agent message
 *   Delegate agent responds → message has delegate's sender identity
 *   Owner may resume → subsequent messages have owner's identity
 */

// ── Sender Identity ──

export interface SenderIdentity {
  id: string              // workspace id or 'user'
  name: string            // display name
  avatar?: string         // avatar path, preset:N, or data URL
  role: 'user' | 'assistant' | 'delegate'
}

// ── Message Status ──

export type MessageStatus =
  | 'queued'        // waiting in collect queue (user sent during streaming)
  | 'pending'       // sent to LLM, waiting for first token
  | 'streaming'     // receiving tokens
  | 'tool_calling'  // LLM requested tool execution
  | 'complete'      // done
  | 'error'         // failed
  | 'cancelled'     // user cancelled

// ── Tool Call ──

export type ToolCallStatus = 'pending' | 'running' | 'complete' | 'error' | 'blocked'

export interface ToolCall {
  id: string
  name: string
  displayName?: string        // humanized name (e.g. "读取文件")
  input: Record<string, any>
  status: ToolCallStatus
  output?: string
  error?: string
  startedAt?: number
  durationMs?: number
}

// ── Message Flow Segments ──
// An assistant message is a sequence of segments, rendered in order.
// This models the real LLM response pattern: think → use tools → write text → repeat.

export type FlowSegment =
  | { type: 'thinking'; content: string; durationMs?: number }
  | { type: 'tool_group'; tools: ToolCall[]; summary?: string; roundPurpose?: string }
  | { type: 'text'; content: string }

// ── Message ──

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'agent-to-agent' | 'system'
  content: string             // final text content (for persistence/search)
  timestamp: number
  status: MessageStatus

  // Sender identity (resolved at render time from workspace registry)
  senderId?: string           // workspace id, 'user', or delegate workspace id
  senderName?: string         // cached display name (may be stale — prefer live lookup)

  // Delegation chain
  delegatedBy?: string        // who initiated this delegation (owner's senderId)
  delegateTask?: string       // what the delegate was asked to do

  // Assistant response structure
  flow?: FlowSegment[]        // ordered segments (thinking → tools → text → ...)
  toolCalls?: ToolCall[]       // flat list of all tool calls (for persistence compat)

  // Error info
  error?: string
  errorCategory?: string      // 'auth' | 'rate_limit' | 'context_length' | 'network' | 'unknown'
  errorRetryable?: boolean

  // User message extras
  attachments?: MessageAttachment[]

  // Metadata
  agentId?: string            // which agent produced this (for multi-agent routing)
  timing?: MessageTiming      // performance metrics for this response
}

// ── Timing ──

export interface MessageTiming {
  ttft?: number               // time to first token (ms)
  totalMs?: number            // total response time (ms)
  llmMs?: number              // LLM inference time (ms)
  toolMs?: number             // tool execution time (ms)
  rounds?: number             // number of LLM rounds (tool loops)
  cacheHit?: boolean          // prompt cache hit
}

export interface MessageAttachment {
  name: string
  type: string                // mime type
  url?: string                // data URL or file:// URL (for preview only)
  path?: string               // absolute file path (Electron File.path)
  size?: number
  width?: number              // for images
  height?: number
  isDirectory?: boolean       // true for folder attachments
  fileCount?: number          // number of files in folder
}

// ── Session ──

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  mode: 'chat' | 'group'     // single agent vs multi-agent
  participants: SenderIdentity[]
  statusText?: string         // live status: "正在思考", "执行 3 个工具"
}

// ── Events (main → renderer IPC) ──

export interface ChatUpdateEvent {
  sessionId: string
  messages: ChatMessage[]
  statusText?: string
}

/** Status event for real-time UI updates (reserved for future use) */
interface ChatStatusEvent {
  sessionId: string
  status: MessageStatus
  statusText?: string
  activeToolName?: string     // currently running tool name
}
