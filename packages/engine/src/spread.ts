import type { Seconds } from './types.js'
import { correlation_r, minStepSpread } from './tuning.js'

/**
 * Each step contributes two independent uncertainties: how long the fight takes, and
 * the respawn offset, which is published as a range rather than a scalar on several
 * maps. Accumulating only the first understates the band on exactly the maps with the
 * widest offsets.
 */
export function stepSpread(fightSpreadSeconds: Seconds, offsetHalfWidth: Seconds): Seconds {
  const combined = Math.sqrt(fightSpreadSeconds ** 2 + offsetHalfWidth ** 2)
  return Math.max(combined, minStepSpread)
}

/**
 * The band over n projected steps.
 *
 * Independent draws partially cancel, so a sum of n draws spreads with sqrt(n), not
 * n. Pure sqrt(n) is also wrong, because fight durations are positively correlated: a
 * team that resolves objectives slowly tends to do so every cycle. `r` interpolates,
 * at 0 giving sqrt(n) and at 1 giving linear.
 *
 * Accumulating linearly is the most likely wrong implementation and silently costs
 * several usable cycles.
 */
export function spread(n: number, step: Seconds, r: number = correlation_r): Seconds {
  if (n <= 0) return 0
  return step * Math.sqrt(n + n * (n - 1) * r)
}
