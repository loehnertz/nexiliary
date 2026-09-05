import type { Confidence, LevelState, Seconds, TimedEvent } from '../types.js'
import { estimated } from '../confidence.js'
import { levelCurve, talentTiers } from '../game-constants.js'

/**
 * The estimated team level. **Never displayed** — it is on the player's own screen, and a
 * derived number that can visibly disagree with one they can read costs trust in the
 * numbers they cannot.
 *
 * It is still computed, because two things that the game does *not* show read off it: how
 * long the death timer currently is, and when the next talent tier lands. Both therefore
 * inherit its confidence and are never `Exact`. Team level
 * depends on soak nobody can observe, so it is never `Exact`; near a breakpoint an
 * exact-looking death timer is simply the wrong number rendered green.
 */
export function estimateLevel(now: Seconds): LevelState {
  let entry = levelCurve[0]!
  for (const candidate of levelCurve) {
    if (candidate.typicalSeconds <= now) entry = candidate
    else break
  }
  const confidence: Confidence = estimated(
    entry.typicalSeconds - entry.spreadSeconds,
    entry.typicalSeconds + entry.spreadSeconds,
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
export function tiers(now: Seconds, count = 2): TimedEvent[] {
  const out: TimedEvent[] = []
  for (const tier of talentTiers) {
    const entry = levelCurve.find((e) => e.level === tier)
    if (entry === undefined) continue
    if (entry.typicalSeconds <= now) continue
    out.push({
      id: `tier:${tier}`,
      kind: 'tier',
      label: `Lvl ${tier}`,
      at: entry.typicalSeconds,
      confidence: estimated(
        entry.typicalSeconds - entry.spreadSeconds,
        entry.typicalSeconds + entry.spreadSeconds,
      ),
    })
    if (out.length >= count) break
  }
  return out
}
