/**
 * Requested on MATCH_STARTED, released on MATCH_ENDED, re-requested on
 * `visibilitychange`, because the lock is dropped whenever the page is hidden.
 *
 * Falls back to a looping muted video where Wake Lock is unavailable, which is the
 * only thing that keeps older iOS awake. Wake Lock needs a secure context, which is one
 * reason the app is served over HTTPS.
 */

interface WakeLockSentinelLike {
  release(): Promise<void>
  addEventListener(type: 'release', listener: () => void): void
}

let sentinel: WakeLockSentinelLike | null = null
let video: HTMLVideoElement | null = null
let wanted = false

// A one-frame silent MP4. Playing it inline keeps the screen awake where Wake Lock is
// absent, at the cost of a decoder that does almost nothing.
const KEEPALIVE_VIDEO =
  'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAr1tZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzA5NSBiYWVlNDAwIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMiAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbAAAAAFljb2RlAAAAFHN0Y28AAAAAAAAAAQAAACw='

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
    void el.play().catch(() => undefined)
    video = el
  } catch {
    video = null
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
    startFallbackVideo()
    return
  }
  try {
    sentinel = await api.request('screen')
    sentinel.addEventListener('release', () => {
      sentinel = null
    })
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
