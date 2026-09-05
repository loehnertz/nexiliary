/**
 * Domain types. Zero dependencies, no I/O, no clock: time enters as a parameter.
 */

/** Game time. 0 is match start. */
export type Seconds = number
/** Wall clock, epoch based, in the session's epoch rather than the device's. */
export type Millis = number

/**
 * When will this happen. Belongs to events on a timeline.
 *
 * `low` and `high` are absolute game seconds, not offsets from `at`, because
 * `at` is a median and the band is not symmetric around it once clamped.
 */
export type Confidence =
  | { readonly kind: 'Exact' }
  | { readonly kind: 'Estimated'; readonly low: Seconds; readonly high: Seconds }
  | { readonly kind: 'Unknown' }

/**
 * Is this currently true. Belongs to states, principally whether a camp is standing.
 *
 * The ordering `Known > Likely > Stale` is over epistemic strength, never over the
 * value: `Known(false)` is the *strongest* belief in the lattice. Use `isAvailable`
 * for "is it there", never a strength comparison.
 */
export type Belief =
  | { readonly kind: 'Known'; readonly value: boolean }
  | { readonly kind: 'Likely'; readonly value: boolean; readonly since: Seconds }
  | { readonly kind: 'Stale' }

/**
 * Where a camp sits on the battleground. Data rather than a naming convention, because
 * the view orders chips by it: a westerly camp belongs to the left of an easterly one,
 * so the rail reads the way the map does.
 */
export type Bearing = 'nw' | 'n' | 'ne' | 'w' | 'c' | 'e' | 'sw' | 's' | 'se'

/** West to east first, north to south within that, which is how a rail is read. */
const bearingOrder: Record<Bearing, number> = {
  nw: 0, w: 1, sw: 2,
  n: 3, c: 4, s: 5,
  ne: 6, e: 7, se: 8,
}

export function compareBearing(a: Bearing, b: Bearing): number {
  return bearingOrder[a] - bearingOrder[b]
}

export type AnchorType =
  | 'MatchStart'
  | 'ObjectiveEnded'
  /**
   * The objective actually appeared, at this moment. Optional, and the only anchor that
   * pins a spawn rather than a resolution, which is what lets the fight duration and the
   * respawn offset be told apart — the two numbers a map needs measured before it can be
   * marked `verified`.
   */
  | 'ObjectiveSpawned'
  | 'CampTaken'
  | 'CampUp'

/**
 * An anchor pins a real moment to a game fact. Anchors overwrite by key and never
 * accumulate, so the model cannot drift.
 *
 * `type` is widened so an anchor written by a newer client is representable and
 * ignorable rather than forced through with a cast.
 */
export interface Anchor {
  readonly type: AnchorType | (string & {})
  /** '' for MatchStart. See `anchorKey`. */
  readonly subject: string
  readonly gameTimeSeconds: Seconds
  readonly wallClock: Millis
  /** 'local' | 'peer' | 'ocr' | 'hotkey' | 'replay'. The engine never branches on it. */
  readonly source: string
  /** Anchor payload version. */
  readonly schema: number
}

/** Keyed by `${type}:${subject}`. Writing an anchor replaces that entry. */
export type AnchorSet = ReadonlyMap<string, Anchor>

export type EventKind = 'objective' | 'camp' | 'wave' | 'tier'

/**
 * `role` is not in the original design note, which nevertheless requires the
 * objective generator to emit both a spawn and a resolution as events. Without a
 * discriminator nothing downstream could tell them apart, so the rail would count a
 * resolution as the next objective.
 */
export type EventRole = 'spawn' | 'resolution'

export interface TimedEvent {
  /** Stable across re-projection. */
  readonly id: string
  readonly kind: EventKind
  /** Camp id for camp events. Objectives have one chain per map. */
  readonly subjectId?: string
  readonly role?: EventRole
  readonly label: string
  /** The median-accumulated estimate, not the midpoint of the band. */
  readonly at: Seconds
  readonly confidence: Confidence
  readonly cycle?: number

  /**
   * Clamp inputs, computed in `project` so `view` can clamp with arithmetic alone.
   * Present only on events whose preceding resolution has *not* been observed: the
   * clamp says "the pending resolution has not been reported, so this cannot happen
   * sooner than now", which is false for the cycle immediately after an anchor.
   */
  readonly offsetMin?: Seconds
  readonly offsetMax?: Seconds
  /** spread(n) for this cycle. Not recoverable from `confidence`, since `at` is a median. */
  readonly spread?: Seconds
}

export interface CampState {
  readonly id: string
  readonly label: string
  readonly campType: string
  readonly bearing: Bearing
  /** Is the camp there right now. */
  readonly standing: Belief
  /** Respawn, when known. */
  readonly nextUp?: TimedEvent
  readonly availableSince?: Seconds
  /** Removed from the battlefield by an active objective phase, rather than taken. */
  readonly suppressed: boolean
  /** Highest-`pressureValue` first is a view concern; this is the raw value for `now`. */
  readonly pressureValue: number
}

export interface DeathTimerState {
  readonly id: string
  readonly seconds: Seconds
  readonly confidence: Confidence
}

export interface LevelState {
  readonly id: string
  readonly estimate: number
  readonly confidence: Confidence
}

/**
 * Whether an objective phase is believed to be running right now.
 *
 * This is a `Belief` about the present derived from the chain's own band, not a new
 * kind of fact, and it carries the cycle's `Confidence` so it can be rendered and
 * filtered like anything else. Without it the app counts down to the *next* objective
 * while the current one is being fought, which is the moment it exists for, and the
 * re-anchor button — the core interaction — is not emphasised when the tap is wanted.
 */
export type ObjectivePhase =
  /** Nothing has spawned that has not already been reported. There is nothing to tap. */
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'active'
      readonly cycle: number
      readonly since: Seconds
      readonly until: Seconds
      readonly confidence: Confidence
    }
  /**
   * A phase went live and no anchor was written for it. The tap is still wanted — and
   * this is the only other state in which it means anything, which is what keeps
   * "objective ended" off the screen one second into a match, before any objective has
   * existed, and off it again the moment the tap has landed.
   */
  | { readonly kind: 'unreported'; readonly cycle: number }

export interface Timeline {
  /** Sorted by `at`. */
  readonly events: readonly TimedEvent[]
  readonly camps: readonly CampState[]
  readonly deathTimer: DeathTimerState
  readonly level: LevelState
  /** Always strictly greater than the `now` the timeline was projected at. */
  readonly validUntil: Seconds
  readonly provenance: Provenance
  /** True when the map has an objective chain but every projected cycle is `Unknown`. */
  readonly objectiveTimingLost: boolean
  readonly objectivePhase: ObjectivePhase
}

export type Provenance = 'verified' | 'archive' | 'published' | 'unknown'
