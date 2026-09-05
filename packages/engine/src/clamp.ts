import type { CampState, Seconds, TimedEvent, Timeline } from './types.js'
import { bandOf } from './confidence.js'

/**
 * The present clamp. It must translate the interval, never compress it.
 *
 *   width       = high - low
 *   displayLow  = max(low,  now + offsetMin)
 *   displayHigh = max(high, now + offsetMax, displayLow + width)
 *   displayAt   = clamp(at, displayLow, displayHigh)
 *
 * The `displayLow + width` term is the whole point. Without it, when both ends bind
 * the width becomes `offsetMax - offsetMin`, which is zero on every scalar-offset map,
 * and a zero-width `Estimated` collapses to `Exact`: the countdown turns green and
 * precise about a spawn the app knows nothing about, sliding forward with `now`
 * forever. Clamping only the near end inverts the interval instead, and a negative
 * width never exceeds `maxUsefulBand`, so the safety net is defeated by its own sign.
 *
 * The band may move right and may grow. It may never narrow.
 *
 * Confidence is never changed here. Once the clamp binds, `displayAt` is a floor
 * rather than a median, which is the right thing for a player: "no sooner than".
 */
export function clampEvent(event: TimedEvent, now: Seconds): TimedEvent {
  const { offsetMin, offsetMax } = event
  if (offsetMin === undefined || offsetMax === undefined) return event
  // Only an `Estimated` band can be translated without inventing one. Clampable events
  // always carry a non-zero spread, so an `Exact` one cannot arise from projection.
  if (event.confidence.kind !== 'Estimated') return event

  const band = bandOf(event.confidence, event.at)
  if (band === null) return event

  const width = band.high - band.low
  const displayLow = Math.max(band.low, now + offsetMin)
  const displayHigh = Math.max(band.high, now + offsetMax, displayLow + width)
  const displayAt = Math.min(Math.max(event.at, displayLow), displayHigh)

  return {
    ...event,
    at: displayAt,
    confidence: { kind: 'Estimated', low: displayLow, high: displayHigh },
  }
}

/**
 * Applied in `view` for display, and in `buildContext` before cues run, so cues and
 * controls read the numbers the player sees. Without that, a cue would speak
 * "beacons due soon" about an event whose own clamp says it cannot happen for another
 * seventy seconds.
 *
 * It is deliberately *not* applied in `project`: advancement and the clamp read the
 * same silence and draw opposite conclusions, and evaluated in one place they cancel.
 */
export function applyPresentClamp(timeline: Timeline, now: Seconds): Timeline {
  const events = timeline.events.map((e) => clampEvent(e, now))
  const camps: CampState[] = timeline.camps.map((c) =>
    c.nextUp === undefined ? c : { ...c, nextUp: clampEvent(c.nextUp, now) },
  )
  return { ...timeline, events, camps }
}
