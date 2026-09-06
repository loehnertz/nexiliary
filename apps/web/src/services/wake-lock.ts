/**
 * Keeps the phone's screen awake for the duration of a match.
 *
 * Requested on MATCH_STARTED, released on MATCH_ENDED, and re-requested on
 * `visibilitychange`, because the browser drops the lock every time the page stops being
 * visible — which on a phone is every time the screen goes off.
 *
 * There is no fallback, deliberately. The looping muted video that used to be here could
 * not work: Chrome pauses video-only media in the background outright, and a hidden video
 * does not hold the screen while visible either. A fallback that cannot be verified to
 * work is worse than none, because it turns "the screen will sleep" into a silent
 * failure. Screen Wake Lock needs a secure context, so the honest answer on a plain-http
 * origin is to say so.
 */

interface WakeLockSentinelLike {
  release(): Promise<void>
  addEventListener(type: 'release', listener: () => void): void
}

/** What is actually holding the screen, so the failure is never silent. */
export type WakeLockStatus = 'off' | 'locked' | 'insecure' | 'unavailable'

let sentinel: WakeLockSentinelLike | null = null
let wanted = false
let status: WakeLockStatus = 'off'
const listeners = new Set<(s: WakeLockStatus) => void>()

function setStatus(next: WakeLockStatus): void {
  if (status === next) return
  status = next
  for (const listener of listeners) listener(next)
}

export function wakeLockStatus(): WakeLockStatus {
  return status
}

export function onWakeLockStatus(listener: (s: WakeLockStatus) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function lockApi(): { request(type: 'screen'): Promise<WakeLockSentinelLike> } | null {
  const nav = navigator as Navigator & {
    wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> }
  }
  return nav.wakeLock ?? null
}

async function acquire(): Promise<void> {
  const api = lockApi()
  if (api === null) {
    // Naming the insecure case separately matters: it is the single reason a phone's
    // screen sleeps mid-match, and it is a property of the address rather than of the
    // phone, so "unavailable" would send someone looking in the wrong place.
    setStatus(window.isSecureContext ? 'unavailable' : 'insecure')
    return
  }
  try {
    sentinel = await api.request('screen')
    sentinel.addEventListener('release', () => {
      // The browser releases the lock whenever the page stops being visible. Leaving the
      // status at 'locked' would claim the screen is held while the phone is asleep.
      sentinel = null
      if (wanted) setStatus('off')
    })
    setStatus('locked')
  } catch {
    setStatus('unavailable')
  }
}

export function requestWakeLock(): void {
  wanted = true
  void acquire()
}

export function releaseWakeLock(): void {
  wanted = false
  setStatus('off')
  const held = sentinel
  sentinel = null
  if (held !== null) void held.release().catch(() => undefined)
}

export function installWakeLockRecovery(): () => void {
  const onVisible = () => {
    if (wanted && document.visibilityState === 'visible' && sentinel === null) void acquire()
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => document.removeEventListener('visibilitychange', onVisible)
}
