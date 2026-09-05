import type { AnchorSet, ObjectivePhase, Seconds, Timeline, TimedEvent } from './types.js'
import type { MapDefinition } from './map-types.js'
import { phaseInProgress, walkChain } from './objective-chain.js'
import { waves } from './generators/waves.js'
import { tiers, estimateLevel } from './generators/tiers.js'
import { camps, suppressionState } from './generators/camps.js'
import { objectives } from './generators/objectives.js'
import { applyProvenance } from './provenance.js'
import { deathTimerSeconds } from './game-constants.js'
import { validUntilFor } from './valid-until.js'

/**
 * The whole product. Pure: no I/O, no clock, no framework. Time is a parameter, which
 * is what lets the deferred desktop companion reuse this verbatim and the test suite
 * be table-driven.
 *
 * A merge over independent generators, each producing events for one source and
 * knowing nothing about the others. Truncation is per generator, never global.
 */
export function project(map: MapDefinition, anchors: AnchorSet, now: Seconds): Timeline {
  const walk = walkChain(map, anchors, now)
  const suppression = suppressionState(map, walk, now)
  const objectiveCycle = walk?.pending.cycle ?? 1

  const campResult = camps(map, anchors, now, suppression, objectiveCycle)

  const events: TimedEvent[] = [
    ...waves(now),
    ...tiers(now),
    ...objectives(map, walk, now),
    ...campResult.events,
  ].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))

  const level = estimateLevel(now)
  const deathTimer = {
    id: 'deathTimer',
    seconds: deathTimerSeconds(level.estimate),
    // Not `Exact`, and earlier drafts said it was. It is a step function of team
    // level, and team level is estimated; near a breakpoint that is simply the wrong
    // number rendered green.
    confidence: level.confidence,
  }

  const running = phaseInProgress(walk, now)
  // An `Unknown` cycle cannot support a claim about the present either, so the phase
  // readout goes quiet with the countdown rather than outliving it.
  const objectivePhase: ObjectivePhase =
    running === null || running.confidence.kind === 'Unknown'
      ? { kind: 'idle' }
      : {
          kind: 'active',
          cycle: running.cycle,
          since: running.low,
          until: running.resolutionHigh,
          confidence: running.confidence,
        }

  const objectiveTimingLost =
    walk !== null &&
    walk.pending.confidence.kind === 'Unknown' &&
    walk.following.confidence.kind === 'Unknown'

  const raw: Timeline = {
    events,
    camps: campResult.states,
    deathTimer,
    level,
    validUntil: now + 30,
    provenance: map.provenance,
    objectiveTimingLost,
    objectivePhase,
  }

  const clamped = applyProvenance(raw)
  return { ...clamped, validUntil: validUntilFor(clamped, map, walk, suppression, now) }
}
