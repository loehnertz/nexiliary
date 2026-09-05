import type { Bearing, CampDefinition, CampType } from '@nexiliary/engine'

/**
 * Camp shapes, so fifteen map files do not each restate the same six numbers.
 *
 * Spawn and respawn come from the wiki's per-map pages and are recorded in
 * `docs/camp-data.md`. Everything else — how long a camp takes to clear, the walk to
 * it, how long its mercenaries take to reach the objective, and how much pressure they
 * apply there — is judgement. It governs one cue and is deliberately generous.
 *
 * `decaySeconds` and `staleSeconds` live per camp rather than globally: a boss
 * routinely stands untaken for a whole match while a contested siege camp falls in
 * twenty seconds, so one pair of constants would make boss availability `Stale` in
 * essentially every match and quietly kill boss timers.
 */
interface Preset {
  readonly type: CampType
  readonly clearSeconds: number
  readonly approachSeconds: number
  readonly decaySeconds: number
  readonly staleSeconds: number
  readonly pressureValue: number
}

const presets: Record<CampType, Preset> = {
  siege: { type: 'siege', clearSeconds: 18, approachSeconds: 12, decaySeconds: 45, staleSeconds: 120, pressureValue: 6 },
  bruiser: { type: 'bruiser', clearSeconds: 30, approachSeconds: 12, decaySeconds: 45, staleSeconds: 120, pressureValue: 7 },
  // A boss spawning around 5:00 in a twenty-minute match needs at least 900, or
  // availability goes Stale in the last third of every game, which is exactly when
  // bosses are contested. The cost is a boss believed standing that was quietly taken,
  // which is the right trade: a boss being up is the default state.
  boss: { type: 'boss', clearSeconds: 50, approachSeconds: 18, decaySeconds: 300, staleSeconds: 900, pressureValue: 9 },
  special: { type: 'special', clearSeconds: 15, approachSeconds: 12, decaySeconds: 45, staleSeconds: 120, pressureValue: 4 },
}

export interface CampSpec {
  readonly id: string
  readonly label: string
  readonly type: CampType
  /** Where it sits on the battleground, from the wiki's location text. */
  readonly bearing: Bearing
  readonly firstSpawnSeconds: number
  readonly respawnSeconds: number
  /** Seconds for the mercenaries to reach the objective, by cycle, last repeating. */
  readonly travelSeconds: readonly number[]
  /** Overrides the preset when a map's objective moves between cycles. */
  readonly pressureValue?: readonly number[]
  readonly clearSeconds?: number
  readonly approachSeconds?: number
}

export function camp(spec: CampSpec): CampDefinition {
  const preset = presets[spec.type]
  return {
    id: spec.id,
    label: spec.label,
    type: spec.type,
    bearing: spec.bearing,
    firstSpawnSeconds: spec.firstSpawnSeconds,
    respawnSeconds: spec.respawnSeconds,
    decaySeconds: preset.decaySeconds,
    staleSeconds: preset.staleSeconds,
    clearSeconds: spec.clearSeconds ?? preset.clearSeconds,
    approachSeconds: spec.approachSeconds ?? preset.approachSeconds,
    travelSeconds: spec.travelSeconds,
    pressureValue: spec.pressureValue ?? [preset.pressureValue],
  }
}
