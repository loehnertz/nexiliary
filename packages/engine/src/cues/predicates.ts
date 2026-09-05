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
 * The highest `pressureValue` among camps that are actually there, ties broken by id.
 * A static argmax would name the same camp every cycle of every match, which is the
 * "speech becomes noise" risk with a deterministic cause; `pressureValue` is indexed
 * by cycle for exactly that reason.
 */
export function bestStallCamp(ctx: AdviceContext): CampState | null {
  const candidates = ctx.camps.filter((c) => isAvailable(c.standing))
  if (candidates.length === 0) return null
  return candidates.reduce((best, c) =>
    c.pressureValue > best.pressureValue || (c.pressureValue === best.pressureValue && c.id < best.id)
      ? c
      : best,
  )
}
