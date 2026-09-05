import type { AnchorSet, Belief, CampState, Seconds, TimedEvent } from '../types.js'
import type { CampDefinition, MapDefinition } from '../map-types.js'
import { byCycle } from '../map-types.js'
import { exact } from '../confidence.js'
import { decayFrom } from '../belief.js'
import { latestCampAnchor } from '../anchors.js'
import type { ChainWalk } from '../objective-chain.js'

/**
 * Camps vanish from the battlefield during some objective phases. A camp model that
 * does not know this will advise starting a camp that is not there.
 *
 * "A phase is believed active" has to expire. The obvious reading, active from spawn
 * until an anchor arrives, pins every camp to `Known(false)` for the rest of the match
 * after one missed tap: a wrong claim produced by forgetting, with no correction
 * affordance, since `Known(false)` renders as a countdown rather than a tappable chip.
 */
export type SuppressionState =
  | { readonly kind: 'notApplicable' }
  | { readonly kind: 'beforeFirst' }
  | { readonly kind: 'active'; readonly since: Seconds; readonly until: Seconds }
  | { readonly kind: 'lifted'; readonly at: Seconds; readonly confirmed: boolean }

export function suppressionState(
  map: MapDefinition,
  walk: ChainWalk | null,
  now: Seconds,
): SuppressionState {
  if (map.campsSuppressedDuringObjective !== true || walk === null) {
    return { kind: 'notApplicable' }
  }

  // The window opens at the spawn, not at the resolution band. Camps vanish when the
  // objective becomes active, so a window opening at the band's start would advise
  // starting a camp through the minute when the objective is live and camps are gone.
  const { pending, elapsed } = walk

  if (now >= pending.low && now <= pending.resolutionHigh) {
    return { kind: 'active', since: pending.low, until: pending.resolutionHigh }
  }
  if (elapsed !== null) {
    if (now <= elapsed.resolutionHigh) {
      return { kind: 'active', since: elapsed.low, until: elapsed.resolutionHigh }
    }
    // Elapsed with no anchor: the phase must have ended, but not when. The app stops
    // claiming rather than asserting a camp is back.
    return { kind: 'lifted', at: elapsed.resolutionHigh, confirmed: false }
  }
  if (walk.anchored && walk.anchorTimeSeconds !== null && now >= walk.anchorTimeSeconds) {
    // The anchor names the moment the phase ended, so camps returned then. Carrying
    // the pre-suppression value forward would have them emerge already past
    // `staleSeconds`, killing camp coaching from the first objective onward.
    return { kind: 'lifted', at: walk.anchorTimeSeconds, confirmed: true }
  }
  return { kind: 'beforeFirst' }
}

function campEvent(camp: CampDefinition, at: Seconds, occurrence: number): TimedEvent {
  return {
    id: `camp:${camp.id}:${occurrence}`,
    kind: 'camp',
    subjectId: camp.id,
    label: camp.label,
    at,
    confidence: exact,
  }
}

/**
 * Camps are independent of each other and never chain, so no camp band widens the way
 * the objective chain does. They have the opposite failure mode: a missing anchor
 * would produce a false positive, claiming a camp is available when someone took it
 * two minutes ago. That is worse than silence.
 *
 * Availability decays from `availableSince` regardless of how availability was
 * derived. Scoping decay to the no-anchor branch would make one tap mark a camp
 * `Known` forever, reintroducing the exact bug the model exists to prevent.
 */
export function camps(
  map: MapDefinition,
  anchors: AnchorSet,
  now: Seconds,
  suppression: SuppressionState,
  objectiveCycle: number,
): { states: CampState[]; events: TimedEvent[] } {
  const states: CampState[] = []
  const events: TimedEvent[] = []

  for (const camp of map.camps) {
    const taken = latestCampAnchor(anchors, 'CampTaken', camp.id)
    const up = latestCampAnchor(anchors, 'CampUp', camp.id)

    let availableSince: Seconds | undefined
    let pendingRespawn: { at: Seconds; occurrence: number } | undefined
    let occurrence = 1

    if (taken !== null && (up === null || taken.gameTimeSeconds >= up.gameTimeSeconds)) {
      occurrence = countOccurrences(anchors, 'CampTaken', camp.id)
      const respawnAt = taken.gameTimeSeconds + camp.respawnSeconds
      if (now < respawnAt) pendingRespawn = { at: respawnAt, occurrence: occurrence + 1 }
      else availableSince = respawnAt
    } else if (up !== null) {
      availableSince = up.gameTimeSeconds
    } else if (now < camp.firstSpawnSeconds) {
      pendingRespawn = { at: camp.firstSpawnSeconds, occurrence: 1 }
    } else {
      availableSince = camp.firstSpawnSeconds
    }

    let standing: Belief
    let effectiveSince = availableSince

    if (suppression.kind === 'active') {
      standing = { kind: 'Known', value: false }
      effectiveSince = undefined
      pendingRespawn = undefined
    } else {
      if (suppression.kind === 'lifted') {
        if (pendingRespawn !== undefined && pendingRespawn.at <= suppression.at) {
          // The camp's own respawn completed while the phase was running, so it comes
          // back with the rest of them when the phase ends.
          pendingRespawn = undefined
          effectiveSince = suppression.at
        } else if (pendingRespawn === undefined) {
          effectiveSince =
            availableSince === undefined
              ? suppression.at
              : Math.max(availableSince, suppression.at)
        }
      }
      if (pendingRespawn !== undefined) {
        // A `CampTaken` respawn is a fact about this camp alone and outlives the phase.
        standing = { kind: 'Known', value: false }
      } else if (suppression.kind === 'lifted' && !suppression.confirmed) {
        // The phase must have ended, but not when, so the app stops claiming.
        standing = { kind: 'Stale' }
      } else if (effectiveSince !== undefined) {
        standing = decayFrom(effectiveSince, now, camp.decaySeconds, camp.staleSeconds)
      } else {
        standing = { kind: 'Stale' }
      }
    }

    const nextUp =
      pendingRespawn === undefined
        ? undefined
        : campEvent(camp, pendingRespawn.at, pendingRespawn.occurrence)
    if (nextUp !== undefined) events.push(nextUp)

    states.push({
      id: camp.id,
      label: camp.label,
      campType: camp.type,
      standing,
      ...(nextUp !== undefined ? { nextUp } : {}),
      ...(effectiveSince !== undefined ? { availableSince: effectiveSince } : {}),
      pressureValue: byCycle(camp.pressureValue, objectiveCycle, 0),
    })
  }

  return { states, events }
}

function countOccurrences(anchors: AnchorSet, type: string, campId: string): number {
  let count = 0
  for (const key of anchors.keys()) if (key.startsWith(`${type}:${campId}:`)) count += 1
  return count
}
