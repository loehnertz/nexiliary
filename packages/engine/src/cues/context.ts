import type { Seconds, TimedEvent, Timeline } from '../types.js'
import type { MapDefinition } from '../map-types.js'
import { applyPresentClamp } from '../clamp.js'
import { currentTier } from '../generators/tiers.js'
import type { AdviceContext } from './types.js'

/**
 * Applies the present clamp **before** constructing the context, so cues and controls
 * read the numbers the player sees. Without that, a cue would speak "beacons due soon"
 * about an event whose own clamp says it cannot happen for another seventy seconds,
 * and an event the clamp drove past `maxUsefulBand` would still look `Estimated` to
 * the confidence filter.
 */
export function buildContext(map: MapDefinition, timeline: Timeline, now: Seconds): AdviceContext {
  const clamped = applyPresentClamp(timeline, now)
  const spawns = clamped.events
    .filter((e) => e.kind === 'objective' && e.role === 'spawn')
    .sort((a, b) => (a.cycle ?? 0) - (b.cycle ?? 0))
  const nextObjective: TimedEvent | null = spawns[0] ?? null
  const nextTier: TimedEvent | null = clamped.events.find((e) => e.kind === 'tier') ?? null

  return {
    now,
    map,
    timeline: clamped,
    nextObjective,
    camps: clamped.camps,
    tier: { current: currentTier(clamped.level.estimate), next: nextTier },
    deathTimer: clamped.deathTimer,
    level: clamped.level,
  }
}
