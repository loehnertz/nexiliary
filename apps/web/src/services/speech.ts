/**
 * A singleton outside React. Keeps at most one utterance in flight, drops stale ones
 * rather than queueing them, and degrades to silence when unavailable.
 *
 * iOS silently drops utterances not triggered by a user gesture, so the "start match"
 * tap doubles as the audio unlock. Safari's `getVoices()` returns nothing on first
 * call, so voice selection retries on `voiceschanged` and falls back to the default.
 */

let unlocked = false
let voices: SpeechSynthesisVoice[] = []
let speaking = false

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  return 'speechSynthesis' in window ? window.speechSynthesis : null
}

function refreshVoices(): void {
  const s = synth()
  if (s === null) return
  const found = s.getVoices()
  if (found.length > 0) voices = found
}

export function initSpeech(): void {
  const s = synth()
  if (s === null) return
  refreshVoices()
  s.addEventListener('voiceschanged', refreshVoices)
}

export function listVoices(): SpeechSynthesisVoice[] {
  refreshVoices()
  return voices
}

export function isSpeechAvailable(): boolean {
  return synth() !== null
}

/**
 * Must be called from inside a user gesture. Speaking an empty utterance is the
 * standard way to satisfy iOS's gesture requirement without making a sound.
 */
export function unlockSpeech(): void {
  const s = synth()
  if (s === null || unlocked) return
  try {
    const warmup = new SpeechSynthesisUtterance(' ')
    warmup.volume = 0
    s.speak(warmup)
    unlocked = true
    refreshVoices()
  } catch {
    // Nothing to recover: the app simply stays silent.
  }
}

export function speak(text: string, voiceId?: string): void {
  const s = synth()
  if (s === null || text.trim() === '') return
  try {
    // Two sentences over each other in a teamfight is worse than silence, and an
    // utterance queued behind a stale one arrives after the moment it described.
    if (speaking || s.speaking || s.pending) s.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    const voice = voiceId === undefined ? undefined : listVoices().find((v) => v.voiceURI === voiceId)
    if (voice !== undefined) utterance.voice = voice
    utterance.rate = 1.05
    utterance.onend = () => {
      speaking = false
    }
    utterance.onerror = () => {
      speaking = false
    }
    speaking = true
    s.speak(utterance)
  } catch {
    speaking = false
  }
}

export function stopSpeech(): void {
  const s = synth()
  if (s === null) return
  try {
    s.cancel()
  } catch {
    /* nothing to recover */
  }
  speaking = false
}
