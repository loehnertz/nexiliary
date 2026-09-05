/**
 * Requested on MATCH_STARTED, released on MATCH_ENDED, re-requested on
 * `visibilitychange`, because the browser drops the lock whenever the page is hidden.
 *
 * **A secure context is the only thing that actually works.** The looping muted video is
 * kept because it is the classic trick and may still help older iOS, but it is not a
 * fallback on Android: Chrome pauses video-only media in the background outright —
 * "video-only background media was paused to save power" — and a 1px invisible video does
 * not hold the screen on while visible either. So on an insecure origin the status is
 * reported as `insecure` whether or not the video plays, rather than claiming a hold the
 * app cannot verify.
 */

interface WakeLockSentinelLike {
  release(): Promise<void>
  addEventListener(type: 'release', listener: () => void): void
}

/**
 * What is actually keeping the screen awake. Surfaced because the failure is silent
 * otherwise: the player's screen sleeps mid-match and nothing says why.
 */
export type WakeLockStatus = 'off' | 'locked' | 'video' | 'insecure' | 'unavailable'

let sentinel: WakeLockSentinelLike | null = null
let video: HTMLVideoElement | null = null
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

// A real two-by-two black MP4, one second long, silent, generated with ffmpeg and
// inlined so it cannot 404 offline. It has to be a genuine file: a plausible-looking
// base64 string decodes to something with no `moov` box, `play()` rejects, and the
// fallback is silently inert — which is worse than not having one, because the screen
// sleeps mid-match and nothing says why. `wake-lock.test.ts` asserts it stays real.
export const KEEPALIVE_VIDEO =
  'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMWbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAkF0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAIAAAACAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAAAAABAAAAAAG5bWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAQABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABZG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAASRzdGJsAAAAwHN0c2QAAAAAAAAAAQAAALBhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAIAAgBIAAAASAAAAAAAAAABFExhdmM2My4xLjEwMSBsaWJ4MjY0AAAAAAAAAAAAAAAAGP//AAAANmF2Y0MBZAAK/+EAGWdkAAqs2V+IiMBEAAADAAQAAAMACDxIllgBAAZo6+PLIsD9+PgAAAAAEHBhc3AAAAABAAAAAQAAABRidHJ0AAAAAAAAFigAAAAAAAAAGHN0dHMAAAAAAAAAAQAAAAEAAEAAAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAABAAAAAQAAABRzdHN6AAAAAAAAAsUAAAABAAAAFHN0Y28AAAAAAAAAAQAAA0YAAABhdWR0YQAAAFltZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAACxpbHN0AAAAJKl0b28AAAAcZGF0YQAAAAEAAAAATGF2ZjYzLjEuMTAxAAAACGZyZWUAAALNbWRhdAAAAq0GBf//qdxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjUgcjMyMjIgYjM1NjA1YSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjUgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0xIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDM6MHgxMTMgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTEgYl9iaWFzPTAgZGlyZWN0PTEgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0yIGtleWludD0yNTAga2V5aW50X21pbj0xIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAEGWIhAAV//73ye/Apuvb34E='

function lockApi(): { request(type: 'screen'): Promise<WakeLockSentinelLike> } | null {
  const nav = navigator as Navigator & {
    wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> }
  }
  return nav.wakeLock ?? null
}

function startFallbackVideo(): void {
  if (video !== null) return
  try {
    const el = document.createElement('video')
    el.setAttribute('playsinline', '')
    el.muted = true
    el.loop = true
    el.src = KEEPALIVE_VIDEO
    el.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;'
    document.body.appendChild(el)
    video = el
    // Report what actually happened rather than what was attempted. Muted inline
    // playback is normally allowed, but it can still be refused, and then the screen
    // will sleep.
    void el
      .play()
      .then(() => setStatus(window.isSecureContext ? 'video' : 'insecure'))
      .catch(() => setStatus(window.isSecureContext ? 'unavailable' : 'insecure'))
  } catch {
    video = null
    setStatus('unavailable')
  }
}

function stopFallbackVideo(): void {
  if (video === null) return
  try {
    video.pause()
    video.remove()
  } catch {
    /* nothing to recover */
  }
  video = null
}

async function acquire(): Promise<void> {
  const api = lockApi()
  if (api === null) {
    // Wake Lock needs a secure context, so on a plain-HTTP LAN address it is simply
    // absent. Naming that separately matters: it is the single reason a phone's screen
    // sleeps mid-match, and it is a property of the address rather than of the phone,
    // so "unavailable" would send someone looking in the wrong place.
    startFallbackVideo()
    if (!window.isSecureContext) setStatus('insecure')
    return
  }
  try {
    sentinel = await api.request('screen')
    sentinel.addEventListener('release', () => {
      // The browser releases the lock whenever the page stops being visible, which on a
      // phone is every time the screen goes off. Leaving the status at 'locked' would
      // have the settings panel claiming the screen is held while it is not.
      sentinel = null
      if (wanted) setStatus('off')
    })
    setStatus('locked')
  } catch {
    startFallbackVideo()
  }
}

export function requestWakeLock(): void {
  wanted = true
  void acquire()
}

export function releaseWakeLock(): void {
  wanted = false
  setStatus('off')
  stopFallbackVideo()
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
