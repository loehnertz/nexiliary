import type { Belief, CampState, Confidence, Timeline, TimedEvent } from './types.js'
import { clampBandSeconds } from './tuning.js'

/**
 * The last step of `project`, and the one place to audit what the app may claim.
 *
 * Waves, tiers and the death timer are exempt at every level. That exemption is about
 * map files: a wrong map cannot make a game-wide rule wrong. It says nothing about the
 * constants themselves, which are hand-sourced rather than measured.
 */
function widen(c: Confidence, at: number): Confidence {
  switch (c.kind) {
    case 'Exact':
      return { kind: 'Estimated', low: at - clampBandSeconds, high: at + clampBandSeconds }
    case 'Estimated':
      // The two uncertainties are independent: the map constant being unverified does
      // not remove the behavioural spread, so the band is widened rather than replaced.
      return { kind: 'Estimated', low: c.low - clampBandSeconds, high: c.high + clampBandSeconds }
    case 'Unknown':
      return c
  }
}

function isMapDerived(e: TimedEvent): boolean {
  return e.kind === 'objective' || e.kind === 'camp'
}

function clampBelief(b: Belief): Belief {
  // A camp's pre-first-spawn `Known(false)` is map-derived, so a map with no data
  // cannot assert it.
  return b.kind === 'Stale' ? b : { kind: 'Stale' }
}

export function applyProvenance(t: Timeline): Timeline {
  switch (t.provenance) {
    case 'verified':
      return t

    case 'archive':
    case 'published': {
      const events = t.events.map((e) =>
        isMapDerived(e) ? { ...e, confidence: widen(e.confidence, e.at) } : e,
      )
      const camps: CampState[] = t.camps.map((c) =>
        c.nextUp === undefined
          ? c
          : { ...c, nextUp: { ...c.nextUp, confidence: widen(c.nextUp.confidence, c.nextUp.at) } },
      )
      return { ...t, events, camps }
    }

    case 'unknown': {
      const events = t.events.filter((e) => !isMapDerived(e))
      const camps: CampState[] = t.camps.map((c) => {
        const { nextUp: _dropped, ...rest } = c
        return { ...rest, standing: clampBelief(c.standing) }
      })
      return { ...t, events, camps }
    }
  }
}
