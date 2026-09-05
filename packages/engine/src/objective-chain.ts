import type { AnchorSet, Confidence, Seconds } from './types.js'
import type { MapDefinition, ObjectiveModel, RespawnRule } from './map-types.js'
import { estimated, exact, unknown } from './confidence.js'
import { objectiveEndedAnchors, objectiveSpawnedAnchors } from './anchors.js'
import { spread, stepSpread } from './spread.js'
import { maxUsefulBand } from './tuning.js'

export interface OffsetRange {
  readonly min: Seconds
  readonly max: Seconds
}

export interface ChainStep {
  readonly cycle: number
  /** Median-accumulated, unclamped. */
  readonly at: Seconds
  readonly low: Seconds
  readonly high: Seconds
  /** Projected steps since the newest anchor, or since match start. */
  readonly n: number
  readonly spread: Seconds
  readonly confidence: Confidence
  /**
   * The offset from the preceding resolution to this spawn, present only when that
   * resolution has *not* been observed. The clamp is meaningless otherwise: the
   * resolution already happened, so "no sooner than now plus the offset" is false.
   */
  readonly offset: OffsetRange | null
  /** Estimated resolution band for this cycle's phase. */
  readonly resolutionAt: Seconds
  readonly resolutionLow: Seconds
  readonly resolutionHigh: Seconds
}

export interface ChainWalk {
  /** The cycle the clock has not yet passed. */
  readonly pending: ChainStep
  /** The one after it, so the rail can plan two events ahead. */
  readonly following: ChainStep
  /** The most recent cycle advancement walked past. Its phase may still be live. */
  readonly elapsed: ChainStep | null
  readonly anchored: boolean
  readonly anchorTimeSeconds: Seconds | null
}

type TimedObjective = Extract<ObjectiveModel, { kind: 'timed' }>

/**
 * The offset that applies to a spawn at `cycle`, given the resolution it chains off.
 *
 * `possibleFromCycle` indexes the spawning cycle, not the resolving one. An
 * off-by-one here produces false precision on the one map it was added for.
 */
export function offsetFor(
  rule: RespawnRule,
  cycle: number,
  resolutionTimeSeconds: Seconds,
): OffsetRange {
  if (rule.kind === 'fixedInterval') {
    return { min: rule.minSeconds, max: rule.maxSeconds }
  }

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const outcome of Object.values(rule.outcomes)) {
    if ((outcome.possibleFromCycle ?? 1) > cycle) continue
    min = Math.min(min, outcome.minSeconds)
    max = Math.max(max, outcome.maxSeconds)
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    // Every branch gated out. Take the union of all of them rather than inventing a
    // number; a map authored this way fails the `maps` CI check.
    for (const outcome of Object.values(rule.outcomes)) {
      min = Math.min(min, outcome.minSeconds)
      max = Math.max(max, outcome.maxSeconds)
    }
  }

  const scale = rule.scalePerMinuteSeconds
  if (scale !== undefined && scale !== 0) {
    const floor = rule.minOffsetSeconds ?? 0
    // Both ends move by the same amount, so the half-width is unchanged by scaling.
    // Without the floor a 2s-per-minute reduction reaches zero at 55 minutes and goes
    // negative after, and matches do run long.
    const headroom = Math.max(0, min - floor)
    const reduction = Math.min(Math.max(0, (scale * resolutionTimeSeconds) / 60), headroom)
    min -= reduction
    max -= reduction
  }

  return { min, max }
}

function stepSpreadFor(objective: TimedObjective, offset: OffsetRange): Seconds {
  const halfWidth = (offset.max - offset.min) / 2
  // A fixed-interval map's spawns do not chain off a fight, so the fight spread is
  // not part of its step-to-step uncertainty.
  const fightSpread = objective.respawn.kind === 'fixedInterval' ? 0 : objective.fight.spreadSeconds
  return stepSpread(fightSpread, halfWidth)
}

function confidenceFor(low: Seconds, high: Seconds): Confidence {
  if (high - low > maxUsefulBand) return unknown
  return estimated(low, high)
}

/**
 * When the phase resolves is the spawn's uncertainty *plus this cycle's fight*, which
 * are independent. Using the spawn's spread alone made the first objective of a match
 * resolve at an exact instant — it is `Exact` at `firstSpawnSeconds`, so the band was
 * zero-width — and that end is what closes the camp suppression window and the live
 * readout. An `ObjectiveSpawned` anchor makes the same mistake visible immediately: the
 * spawn becomes exactly known and the fight does not.
 */
function resolutionSpread(objective: TimedObjective, spawnSpread: Seconds): Seconds {
  return Math.sqrt(spawnSpread ** 2 + objective.fight.spreadSeconds ** 2)
}

function makeStep(
  objective: TimedObjective,
  cycle: number,
  at: Seconds,
  n: number,
  spreadSeconds: Seconds,
  confidence: Confidence,
  offset: OffsetRange | null,
): ChainStep {
  const resolutionAt = at + objective.fight.medianSeconds
  const resSpread = resolutionSpread(objective, spreadSeconds)
  return {
    cycle,
    at,
    low: at - spreadSeconds,
    high: at + spreadSeconds,
    n,
    spread: spreadSeconds,
    confidence,
    offset,
    resolutionAt,
    resolutionLow: resolutionAt - resSpread,
    resolutionHigh: resolutionAt + resSpread,
  }
}

/**
 * The cycle whose phase window contains `now`, if any. The window runs from the spawn's
 * `low` to the resolution band's `high`. Both the camp suppression rule and the
 * live-phase readout ask this question, so it is answered once.
 *
 * The pending cycle counts only when its spawn is **unclampable** — that is, when its
 * predecessor's resolution was observed. A clampable pending spawn is one the present
 * clamp pushes to `now + offsetMin` or later, so the display is simultaneously saying
 * "no sooner than two minutes" and "it is happening now" about the same cycle. Reading
 * unclamped values here would put those two sentences on screen together, and the same
 * disagreement would make camps read as removed from a battlefield the countdown says
 * the objective has not reached.
 *
 * An elapsed cycle is never clamped — its spawn is in the past and is not emitted as an
 * event — so it always counts.
 */
export function phaseInProgress(walk: ChainWalk | null, now: Seconds): ChainStep | null {
  if (walk === null) return null
  const { pending, elapsed } = walk
  if (pending.offset === null && now >= pending.low && now <= pending.resolutionHigh) return pending
  if (elapsed !== null && now >= elapsed.low && now <= elapsed.resolutionHigh) return elapsed
  return null
}

/** The first step of the chain: from the newest anchor, or from the fixed first spawn. */
function firstStep(
  objective: TimedObjective,
  anchors: AnchorSet,
): { step: ChainStep; anchored: boolean; anchorTimeSeconds: Seconds | null } {
  const ended = objectiveEndedAnchors(anchors)
  const spawned = objectiveSpawnedAnchors(anchors)
  const newest = ended.length > 0 ? ended[ended.length - 1] : undefined
  const newestSpawn = spawned.length > 0 ? spawned[spawned.length - 1] : undefined

  // A spawn observation is the stronger fact when it is the more recent one: it pins a
  // spawn outright rather than predicting one from an offset, so the cycle it names is
  // `Exact` and only its resolution is still open.
  if (
    newestSpawn !== undefined &&
    (newest === undefined || newestSpawn.gameTimeSeconds > newest.gameTimeSeconds)
  ) {
    const cycle = Number(newestSpawn.subject)
    const step = makeStep(
      objective,
      Number.isFinite(cycle) && cycle >= 1 ? cycle : ended.length + 1,
      newestSpawn.gameTimeSeconds,
      0,
      0,
      exact,
      null,
    )
    return { step, anchored: true, anchorTimeSeconds: newestSpawn.gameTimeSeconds }
  }

  if (newest === undefined) {
    const step = makeStep(objective, 1, objective.firstSpawnSeconds, 0, 0, exact, null)
    return { step, anchored: false, anchorTimeSeconds: null }
  }

  // The chain walks from the anchor's *time*, not its index, so a missed tap leaves
  // the count one short without moving any timing.
  const t = newest.gameTimeSeconds
  const cycle = ended.length + 1
  const offset = offsetFor(objective.respawn, cycle, t)
  const at = t + (offset.min + offset.max) / 2
  const low = t + offset.min
  const high = t + offset.max
  // Exact only when the offset is a single number. Rendering a 40-second range as one
  // green number is a claim that can be forty seconds wrong, made at the moment the
  // player has most reason to trust it.
  const confidence = confidenceFor(low, high)
  const spawnSpread = (high - low) / 2
  const resSpread = resolutionSpread(objective, spawnSpread)
  const step: ChainStep = {
    cycle,
    at,
    low,
    high,
    n: 0,
    spread: spawnSpread,
    confidence,
    offset: null,
    resolutionAt: at + objective.fight.medianSeconds,
    resolutionLow: at + objective.fight.medianSeconds - resSpread,
    resolutionHigh: at + objective.fight.medianSeconds + resSpread,
  }
  return { step, anchored: true, anchorTimeSeconds: t }
}

function advance(objective: TimedObjective, from: ChainStep): ChainStep {
  const cycle = from.cycle + 1
  // A fixed-interval map's next spawn is on its own clock, not after a fight.
  const usesFight = objective.respawn.kind !== 'fixedInterval'
  const resolutionTime = usesFight ? from.at + objective.fight.medianSeconds : from.at
  const offset = offsetFor(objective.respawn, cycle, resolutionTime)
  const at = resolutionTime + (offset.min + offset.max) / 2
  const n = from.n + 1
  const s = spread(n, stepSpreadFor(objective, offset))
  return makeStep(objective, cycle, at, n, s, confidenceFor(at - s, at + s), offset)
}

/**
 * Advancement runs on **unclamped** values, in `project`. The clamp lives in `view`.
 *
 * The two read the same silence and draw opposite conclusions from it, which is
 * coherent only because they run in different places. Evaluated together they cancel:
 * if the clamp raises `high` to `now + offsetMax` before advancement is tested, then
 * `now > high` is never true, the cycle never advances, the band never widens, and
 * the app sits indefinitely showing a green `Exact` objective at `now + offset`.
 */
export function walkChain(map: MapDefinition, anchors: AnchorSet, now: Seconds): ChainWalk | null {
  if (map.objective.kind !== 'timed') return null
  const objective = map.objective

  const { step, anchored, anchorTimeSeconds } = firstStep(objective, anchors)
  let pending = step
  let elapsed: ChainStep | null = null

  // Bounded defensively: a map authored with a non-positive step would otherwise spin.
  for (let guard = 0; guard < 1000 && now > pending.high; guard += 1) {
    const next = advance(objective, pending)
    if (next.at <= pending.at) break
    elapsed = pending
    pending = next
  }

  return {
    pending,
    following: advance(objective, pending),
    elapsed,
    anchored,
    anchorTimeSeconds,
  }
}
