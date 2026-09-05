import type { Confidence, Seconds } from './types.js'

export const exact: Confidence = { kind: 'Exact' }
export const unknown: Confidence = { kind: 'Unknown' }

/** A zero-width `Estimated` collapses to `Exact`. Provenance may reopen it later. */
export function estimated(low: Seconds, high: Seconds): Confidence {
  if (high <= low) return { kind: 'Exact' }
  return { kind: 'Estimated', low, high }
}

/** The band's ends, in absolute game seconds. `Unknown` has none. */
export function bandOf(c: Confidence, at: Seconds): { low: Seconds; high: Seconds } | null {
  switch (c.kind) {
    case 'Exact':
      return { low: at, high: at }
    case 'Estimated':
      return { low: c.low, high: c.high }
    case 'Unknown':
      return null
  }
}

export function bandWidth(c: Confidence): Seconds {
  return c.kind === 'Estimated' ? c.high - c.low : 0
}

function mmss(seconds: Seconds): string {
  const whole = Math.max(0, Math.round(seconds))
  const m = Math.floor(whole / 60)
  const s = whole % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * The one place a time becomes words. No cue writes a time phrase itself, so no cue
 * can speak an estimated event as though it were exact.
 */
export function describeTime(c: Confidence, at: Seconds, now: Seconds): string {
  switch (c.kind) {
    case 'Exact': {
      const remaining = Math.round(at - now)
      if (remaining <= 0) return 'now'
      if (remaining < 60) return `in ${remaining}`
      return `in ${mmss(remaining)}`
    }
    case 'Estimated': {
      const low = c.low - now
      if (low <= 0) return 'due now'
      if (low <= 30) return 'due soon'
      if (low <= 75) return 'in about a minute'
      return `in about ${Math.round(low / 60)} minutes`
    }
    case 'Unknown':
      return ''
  }
}

/** `0:42` or `~0:25-1:05`, for display rather than speech. */
export function displayTime(c: Confidence, at: Seconds, now: Seconds): string {
  switch (c.kind) {
    case 'Exact':
      return mmss(at - now)
    case 'Estimated':
      return `~${mmss(c.low - now)}-${mmss(c.high - now)}`
    case 'Unknown':
      return '—'
  }
}

export { mmss }
