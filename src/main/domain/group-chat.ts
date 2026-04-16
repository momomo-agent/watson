/**
 * GroupChat — Domain Layer
 *
 * Stateless 3-step pipeline for multi-agent group conversations.
 * Each step is an independent LLM call with minimal context.
 *
 * Step 1: Orchestrator Route — decide who handles the message
 * Step 2: Delegate Reply — selected agent responds (streamed)
 * Step 3: Orchestrator Close — supplement, delegate again, or stay silent
 *
 * Each step produces independent ChatMessage records.
 */

import { EventEmitter } from 'events'
import type { ChatMessage, FlowSegment, ToolCall, MessageAttachment } from '../../shared/chat-types'
import type { StreamChunk, LLMStreamFn } from './chat-session'

// ── Types ──

export interface GroupParticipant {
  id: string
  name: string
  description?: string
  avatar?: string
  color?: string
  systemPrompt?: string
  tools?: string[]
}

export interface GroupConfig {
  orchestrator: GroupParticipant
  participants: GroupParticipant[]
  maxDelegateRounds: number  // max Step 2→3 cycles (default 3)
}

/** Result of a single pipeline step */
export interface StepResult {
  action: 'delegate' | 'self_reply' | 'stay_silent' | 'text'
  targetId?: string        // for delegate
  instruction?: string     // for delegate
  text?: string            // for self_reply or text
  message?: ChatMessage    // the produced message (if any)
}

// ── Orchestrator Tools ──

export const ORCHESTRATOR_TOOLS = [
  {
    name: 'delegate_to',
    description: 'Ask a participant to handle this message. Include all relevant context in the instruction.',
    input_schema: {
      type: 'object' as const,
      properties: {
        participant_id: { type: 'string' as const, description: 'Participant ID to delegate to' },
        instruction: { type: 'string' as const, description: 'What to tell them (include user context)' },
      },
      required: ['participant_id', 'instruction'],
    },
  },
  {
    name: 'self_reply',
    description: 'Handle this yourself instead of delegating',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: { type: 'string' as const, description: 'Brief reason (optional)' },
      },
    },
  },
  {
    name: 'stay_silent',
    description: 'No response needed for this message',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
]

export const CLOSE_TOOLS = [
  {
    name: 'delegate_to',
    description: 'Ask another participant to add to the conversation',
    input_schema: {
      type: 'object' as const,
      properties: {
        participant_id: { type: 'string' as const, description: 'Participant ID' },
        instruction: { type: 'string' as const, description: 'What to tell them' },
      },
      required: ['participant_id', 'instruction'],
    },
  },
  {
    name: 'stay_silent',
    description: 'The delegate\'s response is sufficient, nothing to add',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
]

// ── GroupChat Pipeline ──

export class GroupChat extends EventEmitter {
  private config: GroupConfig
  private createStream: (agentId: string | null, overrideTools?: any[]) => LLMStreamFn
  private genId: () => string

  constructor(
    config: GroupConfig,
    createStream: (agentId: string | null, overrideTools?: any[]) => LLMStreamFn,
  ) {
    super()
    this.config = config
    this.createStream = createStream
    this.genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2)
  }

  /**
   * Run the full pipeline for a user message.
   * Emits 'message' for each produced ChatMessage (independent records).
   * Emits 'stream' for streaming tokens.
   */
  async handleMessage(
    userMessage: string,
    sessionSummary?: string,
    signal?: AbortSignal,
  ): Promise<ChatMessage[]> {
    const produced: ChatMessage[] = []
    let round = 0

    // Step 1: Orchestrator Route
    const routeResult = await this.stepRoute(userMessage, sessionSummary, signal)

    if (routeResult.action === 'stay_silent') {
      return produced
    }

    if (routeResult.action === 'self_reply') {
      // Orchestrator handles it directly — run a normal LLM call
      const msg = await this.stepSelfReply(userMessage, signal)
      if (msg) {
        produced.push(msg)
        this.emit('message', msg)
      }
      return produced
    }

    // Delegate loop (max rounds)
    while (routeResult.action === 'delegate' && round < this.config.maxDelegateRounds) {
      round++
      const targetId = routeResult.targetId!
      const instruction = routeResult.instruction!

      // Step 2: Delegate Reply
      const delegateMsg = await this.stepDelegateReply(
        targetId, instruction, userMessage, signal
      )
      if (delegateMsg) {
        produced.push(delegateMsg)
        this.emit('message', delegateMsg)
      }

      // Step 3: Orchestrator Close
      const closeResult = await this.stepClose(
        userMessage, targetId, delegateMsg?.content || '', signal
      )

      if (closeResult.action === 'stay_silent') {
        break
      }

      if (closeResult.action === 'text' && closeResult.message) {
        produced.push(closeResult.message)
        this.emit('message', closeResult.message)
        break
      }

      if (closeResult.action === 'delegate') {
        // Another round — update routeResult for next iteration
        routeResult.targetId = closeResult.targetId
        routeResult.instruction = closeResult.instruction
        continue
      }

      break
    }

    return produced
  }

  // ── Step 1: Route ──

  private async stepRoute(
    userMessage: string,
    sessionSummary?: string,
    signal?: AbortSignal,
  ): Promise<StepResult> {
    const { orchestrator, participants } = this.config

    const participantList = participants
      .map(p => `- ${p.id}: ${p.name}${p.description ? ` — ${p.description}` : ''}`)
      .join('\n')

    let systemPrompt = `You are ${orchestrator.name}, the group chat host.

Participants available:
${participantList}

Decide who should handle this message. Use delegate_to to route to a participant, self_reply to handle it yourself, or stay_silent if no response is needed.

When delegating, include all relevant context in the instruction — the participant won't see the conversation history.`

    if (sessionSummary) {
      systemPrompt += `\n\nRecent conversation context:\n${sessionSummary}`
    }

    const messages = [
      { role: 'user', content: userMessage },
    ]

    // Use orchestrator stream with routing tools
    const stream = this.createStream(null, ORCHESTRATOR_TOOLS)
    const result = await this.consumeForToolCall(stream, messages, signal)

    if (result.toolName === 'delegate_to') {
      return {
        action: 'delegate',
        targetId: result.toolInput?.participant_id,
        instruction: result.toolInput?.instruction,
      }
    }

    if (result.toolName === 'self_reply') {
      return { action: 'self_reply' }
    }

    // Default: stay silent or text response
    if (result.text) {
      return { action: 'self_reply', text: result.text }
    }

    return { action: 'stay_silent' }
  }

  // ── Step 2: Delegate Reply ──

  private async stepDelegateReply(
    participantId: string,
    instruction: string,
    userMessage: string,
    signal?: AbortSignal,
  ): Promise<ChatMessage | null> {
    const participant = this.config.participants.find(p => p.id === participantId)
    if (!participant) {
      console.warn(`[group-chat] participant ${participantId} not found`)
      return null
    }

    const messages = [
      {
        role: 'user',
        content: `[${this.config.orchestrator.name} to you]: ${instruction}\n\n[User's message]: ${userMessage}`,
      },
    ]

    // Create delegate stream (with delegate's own tools)
    const stream = this.createStream(participantId)

    const msg: ChatMessage = {
      id: this.genId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
      senderId: participantId,
      senderName: participant.name,
      agentId: participantId,
      flow: [],
      toolCalls: [],
    }

    this.emit('message:start', msg)

    // Stream the response
    await this.consumeStream(stream, messages, msg, signal)

    msg.status = 'complete'
    return msg
  }

  // ── Step 3: Close ──

  private async stepClose(
    userMessage: string,
    delegateId: string,
    delegateResponse: string,
    signal?: AbortSignal,
  ): Promise<StepResult> {
    const delegate = this.config.participants.find(p => p.id === delegateId)
    const delegateName = delegate?.name || delegateId

    // Truncate delegate response for context
    const truncated = delegateResponse.length > 500
      ? delegateResponse.slice(0, 500) + '...'
      : delegateResponse

    const messages = [
      {
        role: 'user',
        content: `[User asked]: ${userMessage.slice(0, 200)}\n[${delegateName} replied]: ${truncated}\n\nDecide: add something useful, delegate to another participant, or stay silent if the response is sufficient.`,
      },
    ]

    const stream = this.createStream(null, CLOSE_TOOLS)
    const result = await this.consumeForToolCall(stream, messages, signal)

    if (result.toolName === 'delegate_to') {
      return {
        action: 'delegate',
        targetId: result.toolInput?.participant_id,
        instruction: result.toolInput?.instruction,
      }
    }

    if (result.toolName === 'stay_silent') {
      return { action: 'stay_silent' }
    }

    // Text response from orchestrator
    if (result.text) {
      const msg: ChatMessage = {
        id: this.genId(),
        role: 'assistant',
        content: result.text,
        timestamp: Date.now(),
        status: 'complete',
        senderId: this.config.orchestrator.id,
        senderName: this.config.orchestrator.name,
        agentId: this.config.orchestrator.id,
      }
      return { action: 'text', message: msg }
    }

    return { action: 'stay_silent' }
  }

  // ── Self Reply (orchestrator handles directly) ──

  private async stepSelfReply(
    userMessage: string,
    signal?: AbortSignal,
  ): Promise<ChatMessage | null> {
    const messages = [
      { role: 'user', content: userMessage },
    ]

    const stream = this.createStream(null)

    const msg: ChatMessage = {
      id: this.genId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
      senderId: this.config.orchestrator.id,
      senderName: this.config.orchestrator.name,
      agentId: this.config.orchestrator.id,
      flow: [],
      toolCalls: [],
    }

    this.emit('message:start', msg)
    await this.consumeStream(stream, messages, msg, signal)
    msg.status = 'complete'
    return msg
  }

  // ── Stream Helpers ──

  /**
   * Consume stream looking for a tool call. Returns first tool call found or text.
   * Used for routing decisions (Step 1 & 3).
   */
  private async consumeForToolCall(
    streamFn: LLMStreamFn,
    messages: Array<{ role: string; content: any }>,
    signal?: AbortSignal,
  ): Promise<{ toolName?: string; toolInput?: any; text?: string }> {
    const gen = streamFn(messages, signal || new AbortController().signal)
    let text = ''

    for await (const chunk of gen) {
      if (chunk.type === 'tool_use' && chunk.tool?.name) {
        return { toolName: chunk.tool.name, toolInput: chunk.tool.input }
      }
      if (chunk.type === 'text' && chunk.text) {
        text += chunk.text
      }
      if (chunk.type === 'error') {
        console.error('[group-chat] stream error:', chunk.error)
        break
      }
    }

    return { text: text || undefined }
  }

  /**
   * Consume stream into a ChatMessage, emitting streaming events.
   * Used for actual responses (Step 2 & self-reply).
   */
  private async consumeStream(
    streamFn: LLMStreamFn,
    messages: Array<{ role: string; content: any }>,
    msg: ChatMessage,
    signal?: AbortSignal,
  ): Promise<void> {
    const gen = streamFn(messages, signal || new AbortController().signal)

    let currentThinking: FlowSegment | null = null
    let currentToolGroup: FlowSegment | null = null

    const ensureFlow = () => { if (!msg.flow) msg.flow = [] }
    const ensureToolCalls = () => { if (!msg.toolCalls) msg.toolCalls = [] }

    const flushThinking = () => {
      if (currentThinking) {
        ensureFlow()
        msg.flow!.push(currentThinking)
        currentThinking = null
      }
    }

    const flushToolGroup = () => {
      if (currentToolGroup) {
        ensureFlow()
        msg.flow!.push(currentToolGroup)
        currentToolGroup = null
      }
    }

    for await (const chunk of gen) {
      switch (chunk.type) {
        case 'thinking':
          if (!currentThinking) {
            flushToolGroup()
            currentThinking = { type: 'thinking', content: '' }
          }
          currentThinking.content += chunk.thinking || ''
          break

        case 'text':
          flushThinking()
          flushToolGroup()
          msg.content += chunk.text || ''
          ensureFlow()
          // Append to last text segment or create new
          const lastSeg = msg.flow![msg.flow!.length - 1]
          if (lastSeg?.type === 'text') {
            lastSeg.content += chunk.text || ''
          } else {
            msg.flow!.push({ type: 'text', content: chunk.text || '' })
          }
          this.emit('stream', { messageId: msg.id, chunk })
          break

        case 'tool_use':
          flushThinking()
          if (!currentToolGroup) {
            currentToolGroup = { type: 'tool_group', tools: [] }
          }
          if (chunk.tool) {
            const tc: ToolCall = {
              id: chunk.tool.id,
              name: chunk.tool.name,
              input: chunk.tool.input || {},
              status: 'pending',
            }
            ;(currentToolGroup as any).tools.push(tc)
            ensureToolCalls()
            msg.toolCalls!.push(tc)
          }
          break

        case 'tool_result':
          if (chunk.tool) {
            const existing = msg.toolCalls?.find(t => t.id === chunk.tool!.id)
            if (existing) {
              existing.output = chunk.tool.output
              existing.status = 'complete'
              existing.durationMs = chunk.tool.durationMs
            }
          }
          break

        case 'tool_error':
          if (chunk.tool) {
            const existing = msg.toolCalls?.find(t => t.id === chunk.tool!.id)
            if (existing) {
              existing.error = chunk.tool.error
              existing.status = 'error'
            }
          }
          break

        case 'error':
          msg.error = chunk.error
          msg.status = 'error'
          break

        case 'done':
          flushThinking()
          flushToolGroup()
          break
      }

      // Emit update for UI
      this.emit('message:update', msg)
    }

    flushThinking()
    flushToolGroup()
  }
}
