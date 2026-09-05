import type { AnchorSet, Confidence, LevelState, Seconds, TimedEvent } from '../types.js'
import { estimated, exact } from '../confidence.js'
import { levelCurve, talentTiers } from '../game-constants.js'

/**
 * How far the whole curve is displaced by an observation, and from when.
 *
 * The curve is derived rather than measured, and its one free parameter — how well the
 * lanes are soaked — moves level 10 only between 6:38 and 8:13 across its entire
 * plausible range, which the authored band covers. What it cannot price is a blowout: a
 * team far ahead or far behind is off the curve entirely and the app has no way to know.
 *
 * A `TierReached` anchor fixes that the same way an `ObjectiveEnded` anchor fixes the
 * objective chain — it re-phases rather than accumulating, so one tap corrects the rest
 * of the match and forgetting it leaves exactly the previous estimate.
 */
interface LevelPhase {
  readonly shiftSeconds: Seconds
  readonly knownLevel: number
  readonly sinceSeconds: Seconds
}

function levelPhase(anchors: AnchorSet): LevelPhase | null {
  let newest: { level: number; at: Seconds } | null = null
  for (const [key, anchor] of anchors) {
    if (!key.startsWith('TierReached:')) continue
    const level = Number(anchor.subject)
    if (!Number.isFinite(level) || level < 1 || level > 20) continue
    if (newest === null || anchor.gameTimeSeconds > newest.at) {
      newest = { level, at: anchor.gameTimeSeconds }
    }
  }
  if (newest === null) return null
  const entry = levelCurve.find((e) => e.level === newest.level)
  if (entry === undefined) return null
  return {
    shiftSeconds: newest.at - entry.typicalSeconds,
    knownLevel: newest.level,
    sinceSeconds: newest.at,
  }
}

/** Uncertainty in levelling *since* a known point, rather than since the match began. */
function spreadSinceAnchor(now: Seconds, phase: LevelPhase): Seconds {
  return Math.max(20, 0.12 * Math.max(0, now - phase.sinceSeconds))
}

/**
 * The level readout, and the band in which its current boundary sits. Team level
 * depends on soak nobody can observe, so it is never `Exact`; near a breakpoint an
 * exact-looking death timer is simply the wrong number rendered green.
 */
export function estimateLevel(now: Seconds, anchors?: AnchorSet): LevelState {
  const phase = anchors === undefined ? null : levelPhase(anchors)
  const shift = phase?.shiftSeconds ?? 0

  let entry = levelCurve[0]!
  for (const candidate of levelCurve) {
    if (candidate.typicalSeconds + shift <= now) entry = candidate
    else break
  }
  // A team does not lose levels, so an observation is a floor as well as a phase.
  if (phase !== null && entry.level < phase.knownLevel) {
    entry = levelCurve.find((e) => e.level === phase.knownLevel) ?? entry
  }

  if (phase !== null && entry.level === phase.knownLevel) {
    // We were told, and no boundary has been crossed since. This is the only path on
    // which the death timer is exact.
    return { id: 'level', estimate: entry.level, confidence: exact }
  }

  const half =
    phase === null ? entry.spreadSeconds : spreadSinceAnchor(now, phase)
  const confidence: Confidence = estimated(
    entry.typicalSeconds + shift - half,
    entry.typicalSeconds + shift + half,
  )
  return { id: 'level', estimate: entry.level, confidence }
}

export function currentTier(level: number): number {
  let tier = talentTiers[0]!
  for (const t of talentTiers) if (t <= level) tier = t
  return tier
}

/**
 * Future tiers are always `Estimated`. Presenting a tier countdown as exact would
 * violate the founding principle.
 */
export function tiers(now: Seconds, anchors?: AnchorSet, count = 2): TimedEvent[] {
  const phase = anchors === undefined ? null : levelPhase(anchors)
  const shift = phase?.shiftSeconds ?? 0
  const out: TimedEvent[] = []
  for (const tier of talentTiers) {
    const entry = levelCurve.find((e) => e.level === tier)
    if (entry === undefined) continue
    const at = entry.typicalSeconds + shift
    if (at <= now) continue
    const half = phase === null ? entry.spreadSeconds : spreadSinceAnchor(at, phase)
    out.push({
      id: `tier:${tier}`,
      kind: 'tier',
      label: `Lvl ${tier}`,
      at,
      confidence: estimated(at - half, at + half),
    })
    if (out.length >= count) break
  }
  return out
}
