import type { CampState, Seconds, TimedEvent } from '../types.js'
import type { CampDefinition, MapDefinition } from '../map-types.js'
import { byCycle } from '../map-types.js'
import { isAvailable } from '../belief.js'
import type { AdviceContext } from './types.js'

/**
 * Shared helpers. This file and `context.ts` are the two sanctioned growth surfaces of
 * the cue system; a helper used by one cue belongs in that cue's file until a second
 * cue needs it.
 */

/** Remaining seconds to an event's `at`, from the context's `now`. */
export function inSeconds(ctx: AdviceContext, event: TimedEvent): Seconds {
  return event.at - ctx.now
}

export function isWithin(ctx: AdviceContext, event: TimedEvent, seconds: Seconds): boolean {
  const remaining = inSeconds(ctx, event)
  return remaining >= 0 && remaining <= seconds
}

export function campDefinition(map: MapDefinition, id: string): CampDefinition | undefined {
  return map.camps.find((c) => c.id === id)
}

/**
 * To have mercenaries arrive as the objective starts:
 *
 *   startCaptureAt = objectiveSpawn - travelSeconds - clearSeconds - approachSeconds
 *
 * `approachSeconds` is the walk to the camp and was missing from an earlier version,
 * making the advice systematically late. `travelSeconds` is measured to the objective,
 * not to the lane generally, because the two differ and the objective is where the
 * pressure is meant to land.
 */
export function startCaptureAt(
  camp: CampDefinition,
  objectiveSpawnAt: Seconds,
  cycle: number,
): Seconds {
  const travel = byCycle(camp.travelSeconds, cycle, 0)
  return objectiveSpawnAt - travel - camp.clearSeconds - camp.approachSeconds
}

/**
 * Camps that are actually there, best first: highest `pressureValue`, ties broken by id.
 *
 * A ranked list rather than an argmax, because naming the same camp every cycle is the
 * "speech becomes noise" risk with a deterministic cause, and the runner-up is what the
 * cue reaches for instead. `pressureValue` is indexed by cycle for the same reason, but
 * only helps on the maps where the objective genuinely moves.
 */
export function rankedStallCamps(ctx: AdviceContext): CampState[] {
  return ctx.camps
    .filter((c) => isAvailable(c.standing))
    .sort((a, b) => b.pressureValue - a.pressureValue || a.id.localeCompare(b.id))
}
