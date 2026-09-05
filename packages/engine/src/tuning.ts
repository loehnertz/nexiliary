import type { Seconds } from './types.js'

/**
 * Engine tuning values, gathered here rather than scattered as literals so they are
 * findable and replaceable. Each is marked guess or measurement.
 */

/** Band width past which confidence drops to `Unknown`. Guess. */
export const maxUsefulBand: Seconds = 120

/**
 * Correlation between consecutive fight durations. 0 gives sqrt(n) accumulation,
 * 1 gives linear. Guess, and the single value most worth replacing with a real
 * number from a replay corpus.
 */
export const correlation_r = 0.3

/**
 * Floor on the per-step spread. Guess. Exists because two maps have deterministic
 * phase durations and scalar offsets, so without it their chain would report
 * `Exact` at cycle twenty with no taps.
 */
export const minStepSpread: Seconds = 8

/**
 * The provenance clamp's band. Guess. It represents uncertainty in the map constant
 * itself, not in human behaviour.
 */
export const clampBandSeconds: Seconds = 20

/**
 * An anchor moving an event's `at` by more than this clears already-fired cues for
 * that event, so a real correction may speak once more. Guess.
 */
export const refireThresholdSeconds: Seconds = 15

/** Fallback horizon for `validUntil` when no candidate is in the future. Guess. */
export const validUntilFallbackSeconds: Seconds = 30
