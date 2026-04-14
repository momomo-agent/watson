/**
 * Voice — Renderer Layer
 *
 * TTS + STT through agentic unified API (not agentic-voice directly).
 * All sub-library access goes through the agentic glue layer.
 */

import { ai } from 'agentic'

let initialized = false

export function initVoice(config: any) {
  if (!config?.voice) return

  ai.configure({
    tts: config.voice.tts?.apiKey ? {
      provider: config.voice.tts.provider || 'elevenlabs',
      apiKey: config.voice.tts.apiKey,
      voice: config.voice.tts.voice || 'alloy',
    } : undefined,
    stt: config.voice.stt || { mode: 'browser' },
  })
  initialized = true
}

export async function speak(text: string) {
  if (!initialized) return
  await ai.speak(text)
}

export function stopSpeaking() {
  if (!initialized) return
  ai.stopSpeaking?.()
}

export async function listen(): Promise<string> {
  if (!initialized) throw new Error('Voice not initialized')
  return await ai.listen()
}

export function isVoiceEnabled() {
  return initialized
}
