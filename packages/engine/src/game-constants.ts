import type { Seconds } from './types.js'

/**
 * Game-wide rules, as distinct from per-map data. These feed waves, tiers and the
 * death timer: the floor the app never drops below, which is exempt from the
 * provenance clamp and therefore renders unqualified.
 *
 * Sourcing is recorded in `docs/game-constants.md`. In short:
 *
 * - `firstWaveSeconds` / `waveIntervalSeconds`: Heroes of the Storm wiki, Minion.
 *   Waves leave the Core every 30 seconds and are aligned to the :00 and :30 marks.
 * - `deathTimerByLevel`: Heroes of the Storm wiki, Death. A published, exact table.
 * - `levelCurve`: derived from the published experience table and wave values
 *   (Heroes Lounge, "Experience of the Storm", from Ahli's report) under a stated
 *   income model. It is an estimate and tiers are never rendered `Exact`.
 */

/**
 * Waves are aligned to the :00 and :30 marks of the match clock, so the first is at
 * 0:00. One source phrases it as "one second into the game"; the difference is below
 * the resolution of anything the app says out loud, and this is the value to correct
 * first if hand-timing disagrees.
 */
export const firstWaveSeconds: Seconds = 0

export const waveIntervalSeconds: Seconds = 30

/** Talent tiers. The game's own talent screen column headers. */
export const talentTiers: readonly number[] = [1, 4, 7, 10, 13, 16, 20]

export interface LevelCurveEntry {
  readonly level: number
  /** Typical game time at which a team reaches this level. */
  readonly typicalSeconds: Seconds
  /** Half-width of the plausible range. Team level depends on soak nobody can observe. */
  readonly spreadSeconds: Seconds
}

/**
 * Derived, not measured. See `docs/game-constants.md` for the model and its inputs.
 * Level 10 lands at 7:19 and level 20 at 19:03, which matches the pacing of a normal
 * twenty-minute match.
 *
 * `spreadSeconds` is 12% of the elapsed time with a 20 second floor: a fast-soaking
 * team and a slow one diverge proportionally, not by a constant.
 */
export const levelCurve: readonly LevelCurveEntry[] = [
  { level: 1, typicalSeconds: 0, spreadSeconds: 20 },
  { level: 2, typicalSeconds: 76, spreadSeconds: 20 },
  { level: 3, typicalSeconds: 114, spreadSeconds: 20 },
  { level: 4, typicalSeconds: 151, spreadSeconds: 20 },
  { level: 5, typicalSeconds: 188, spreadSeconds: 23 },
  { level: 6, typicalSeconds: 224, spreadSeconds: 27 },
  { level: 7, typicalSeconds: 279, spreadSeconds: 33 },
  { level: 8, typicalSeconds: 334, spreadSeconds: 40 },
  { level: 9, typicalSeconds: 387, spreadSeconds: 46 },
  { level: 10, typicalSeconds: 440, spreadSeconds: 53 },
  { level: 11, typicalSeconds: 492, spreadSeconds: 59 },
  { level: 12, typicalSeconds: 562, spreadSeconds: 67 },
  { level: 13, typicalSeconds: 630, spreadSeconds: 76 },
  { level: 14, typicalSeconds: 697, spreadSeconds: 84 },
  { level: 15, typicalSeconds: 763, spreadSeconds: 92 },
  { level: 16, typicalSeconds: 828, spreadSeconds: 99 },
  { level: 17, typicalSeconds: 909, spreadSeconds: 109 },
  { level: 18, typicalSeconds: 988, spreadSeconds: 119 },
  { level: 19, typicalSeconds: 1066, spreadSeconds: 128 },
  { level: 20, typicalSeconds: 1143, spreadSeconds: 137 },
]

export interface DeathTimerEntry {
  readonly level: number
  readonly seconds: Seconds
}

/**
 * Published and exact as a *function of level*. The level it is read at is an
 * estimate, which is why the death timer inherits the level estimate's confidence
 * rather than rendering `Exact`.
 */
export const deathTimerByLevel: readonly DeathTimerEntry[] = [
  { level: 1, seconds: 15 },
  { level: 2, seconds: 16 },
  { level: 3, seconds: 17 },
  { level: 4, seconds: 18 },
  { level: 5, seconds: 19 },
  { level: 6, seconds: 20 },
  { level: 7, seconds: 21 },
  { level: 8, seconds: 22 },
  { level: 9, seconds: 23 },
  { level: 10, seconds: 24 },
  { level: 11, seconds: 26 },
  { level: 12, seconds: 29 },
  { level: 13, seconds: 32 },
  { level: 14, seconds: 36 },
  { level: 15, seconds: 40 },
  { level: 16, seconds: 44 },
  { level: 17, seconds: 50 },
  { level: 18, seconds: 56 },
  { level: 19, seconds: 62 },
  { level: 20, seconds: 65 },
]

export function deathTimerSeconds(level: number): Seconds {
  const clamped = Math.min(Math.max(Math.round(level), 1), 20)
  return deathTimerByLevel[clamped - 1]?.seconds ?? 15
}
