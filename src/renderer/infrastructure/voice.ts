/**
 * Voice — Renderer Layer
 * 
 * TTS + STT using agentic-voice
 */

import { createVoice } from 'agentic-voice'

let voice: any = null

export function initVoice(config: any) {
  if (!config?.voice) return
  
  voice = createVoice({
    tts: config.voice.tts?.apiKey ? {
      baseUrl: config.voice.tts.provider === 'elevenlabs' 
        ? 'https://api.elevenlabs.io/v1'
        : 'https://api.openai.com/v1',
      apiKey: config.voice.tts.apiKey,
      voice: config.voice.tts.voice || 'alloy'
    } : undefined,
    stt: config.voice.stt || { mode: 'browser' }
  })
}

export async function speak(text: string) {
  if (!voice) return
  await voice.speak(text)
}

export function stopSpeaking() {
  if (!voice) return
  voice.stop()
}

export async function listen(): Promise<string> {
  if (!voice) throw new Error('Voice not initialized')
  return await voice.listen()
}

export function isVoiceEnabled() {
  return voice !== null
}
