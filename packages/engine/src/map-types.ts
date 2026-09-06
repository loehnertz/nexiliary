import type { Bearing, Seconds, Provenance } from './types.js'

/**
 * How long humans take to resolve the objective. `spreadSeconds: 0` is legal and
 * meaningful: some phases end on a deterministic timer rather than on a fight.
 */
export interface FightEstimate {
  readonly medianSeconds: Seconds
  /** Roughly an 80% half-width. */
  readonly spreadSeconds: Seconds
}

export interface RespawnOutcome {
  /**
   * What the button says, naming the exact event this branch's respawn runs from.
   *
   * Most objectives resolve in two stages — a contest in the middle, then a vehicle or
   * monster that pushes a lane until it dies — and the timer keys off the second. A
   * generic "<objective> ended" invites the tap at the first, which anchors the whole
   * chain a minute or more early. The trigger differs per map, so the wording is data.
   *
   * This is the only place the wording lives. A second map-level label duplicated it and
   * was allowed to disagree, which is exactly what it did on Garden of Terror.
   */
  readonly label: string
  readonly minSeconds: Seconds
  readonly maxSeconds: Seconds
  /**
   * The branch is unreachable before this **spawning** cycle, the one whose time is
   * being predicted, not the resolving cycle before it.
   */
  readonly possibleFromCycle?: number
}

/**
 * Every battleground in the pool chains its next spawn off the resolution of the previous
 * cycle. `architecture.md` carries a second `fixedInterval` variant for Blackheart's Bay,
 * on the reading that its chests run on their own clock; the wiki says twice that they
 * spawn three minutes after the final chest of the previous event is captured, which is
 * this shape. With no map left using it, the variant was removed rather than carried —
 * "no speculative fourth" applies just as well to a third that turned out to be wrong.
 */
export interface RespawnRule {
  readonly kind: 'afterResolution'
  /** Floor for `scalePerMinuteSeconds`, applied to the low end of the offset. */
  readonly minOffsetSeconds?: Seconds
  readonly outcomes: Readonly<Record<string, RespawnOutcome>>
  readonly scalePerMinuteSeconds?: number
}

export type ObjectiveModel =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'timed'
      readonly label: string
      readonly firstSpawnSeconds: Seconds
      readonly fight: FightEstimate
      readonly respawn: RespawnRule
      /** Display hint only: "2-3 altars", "1, then 2, then 3 chests". Never a timing input. */
      readonly instances?: string
    }

export type CampType = 'siege' | 'bruiser' | 'boss' | 'special'

export interface CampDefinition {
  readonly id: string
  readonly label: string
  readonly type: CampType
  readonly bearing: Bearing
  /**
   * The camp's marker, normalised 0..1 within the battleground's playable bounding box.
   *
   * The image is cropped to that box, so coordinates are frame-independent: a later
   * re-crop changes the asset, never the fifteen map files. This is a tap target rather
   * than a survey pin, so it may sit slightly off the literal location to keep two
   * adjacent camps separately tappable.
   */
  readonly position: { readonly x: number; readonly y: number }
  readonly firstSpawnSeconds: Seconds
  readonly respawnSeconds: Seconds
  /** Belief becomes `Likely` after this long unconfirmed. Per camp, never global. */
  readonly decaySeconds: Seconds
  /** Belief becomes `Stale` after this long unconfirmed. Per camp, never global. */
  readonly staleSeconds: Seconds
  /** How long the camp takes to clear. */
  readonly clearSeconds: Seconds
  /** The walk to the camp. Without it, stall advice is systematically late. */
  readonly approachSeconds: Seconds
  /**
   * Mercenary travel time to the *objective*, not to the lane generally.
   * Indexed by objective cycle, last entry repeating, because the objective's
   * location moves between cycles on several maps.
   */
  readonly travelSeconds: readonly Seconds[]
  /** Indexed by objective cycle, last entry repeating. */
  readonly pressureValue: readonly number[]
}

export interface MapDefinition {
  readonly id: string
  readonly name: string
  readonly provenance: Provenance
  /** Required when `provenance` is 'verified': a corpus reference or hand-timing note. */
  readonly provenanceNote?: string
  readonly objective: ObjectiveModel
  readonly camps: readonly CampDefinition[]
  /** Alterac Pass and Braxis Holdout remove camps while the objective is active. */
  readonly campsSuppressedDuringObjective?: boolean
}

/** Indexed by cycle with the last entry repeating. Cycles are 1-based. */
export function byCycle<T>(table: readonly T[], cycle: number, fallback: T): T {
  if (table.length === 0) return fallback
  const i = Math.min(Math.max(cycle, 1), table.length) - 1
  return table[i] ?? fallback
}
