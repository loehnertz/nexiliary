import type { Seconds, Timeline } from './types.js'
import type { MapDefinition } from './map-types.js'
import type { ChainWalk } from './objective-chain.js'
import type { SuppressionState } from './generators/camps.js'
import { validUntilFallbackSeconds } from './tuning.js'
import { levelCurve, waveIntervalSeconds } from './game-constants.js'

/**
 * Re-running `project` every tick is unnecessary: event times do not move as the clock
 * advances, only remaining time does, and that is subtraction. A projection does
 * expire, though, and this is when.
 *
 * The earliest candidate **strictly greater than `now`**. Without the strictness it is
 * permanently in the past once any camp goes `Stale`, and the memo then recomputes
 * every tick, defeating the point.
 *
 * The present clamp is deliberately not a candidate. It lives in `view`, and once it
 * binds `displayLow` is a continuous function of `now`, which would collapse this to
 * `now`.
 */
export function validUntilFor(
  timeline: Timeline,
  map: MapDefinition,
  walk: ChainWalk | null,
  suppression: SuppressionState,
  now: Seconds,
): Seconds {
  const candidates: Seconds[] = []

  const waveEvents = timeline.events.filter((e) => e.kind === 'wave')
  const lastWave = waveEvents[waveEvents.length - 1]
  if (lastWave !== undefined) candidates.push(lastWave.at + waveIntervalSeconds)

  for (const event of timeline.events) {
    if (event.kind !== 'objective' || event.role !== 'spawn') continue
    if (event.confidence.kind === 'Estimated') candidates.push(event.confidence.high)
    else if (event.confidence.kind === 'Exact') candidates.push(event.at)
  }

  // A tier passing changes the rail, and a level boundary changes both the level
  // readout and the death timer that reads off it. Neither was a candidate, so the
  // death timer went stale until something else happened to expire the projection.
  for (const event of timeline.events) {
    if (event.kind === 'tier') candidates.push(event.at)
  }
  const nextLevel = levelCurve.find((e) => e.typicalSeconds > now)
  if (nextLevel !== undefined) candidates.push(nextLevel.typicalSeconds)

  for (const camp of timeline.camps) {
    const definition = map.camps.find((c) => c.id === camp.id)
    if (definition !== undefined && camp.availableSince !== undefined) {
      candidates.push(camp.availableSince + definition.decaySeconds)
      candidates.push(camp.availableSince + definition.staleSeconds)
    }
    if (camp.nextUp !== undefined) candidates.push(camp.nextUp.at)
  }

  // Both ends of a suppression window change every camp's `standing`.
  if (map.campsSuppressedDuringObjective === true && walk !== null) {
    candidates.push(walk.pending.low, walk.pending.resolutionHigh)
    if (walk.elapsed !== null) candidates.push(walk.elapsed.low, walk.elapsed.resolutionHigh)
    if (suppression.kind === 'active') candidates.push(suppression.until)
  }

  let best = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    if (candidate > now && candidate < best) best = candidate
  }
  return Number.isFinite(best) ? best : now + validUntilFallbackSeconds
}
