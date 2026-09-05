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

export type AnchorType = 'MatchStart' | 'ObjectiveEnded' | 'CampTaken' | 'CampUp'

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
  /** Is the camp there right now. */
  readonly standing: Belief
  /** Respawn, when known. */
  readonly nextUp?: TimedEvent
  readonly availableSince?: Seconds
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
}

export type Provenance = 'verified' | 'archive' | 'published' | 'unknown'
