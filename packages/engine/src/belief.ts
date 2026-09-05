import type { Belief, Seconds } from './types.js'

/**
 * Is the thing there. `Known(false)` is the strongest belief in the lattice and would
 * pass any "at least Likely" test, which is why availability is never expressed as a
 * strength comparison.
 */
export function isAvailable(b: Belief): boolean {
  return (b.kind === 'Known' || b.kind === 'Likely') && b.value
}

/** May we say anything at all about this. */
export function isClaimable(b: Belief): boolean {
  return b.kind !== 'Stale'
}

/** Decay from a known availability moment. Thresholds are per camp, never global. */
export function decayFrom(
  availableSince: Seconds,
  now: Seconds,
  decaySeconds: Seconds,
  staleSeconds: Seconds,
): Belief {
  const age = now - availableSince
  if (age < decaySeconds) return { kind: 'Known', value: true }
  if (age < staleSeconds) return { kind: 'Likely', value: true, since: availableSince }
  return { kind: 'Stale' }
}

export function describeBelief(b: Belief): string {
  switch (b.kind) {
    case 'Known':
      return b.value ? 'up' : 'down'
    case 'Likely':
      return b.value ? 'probably up' : 'probably down'
    case 'Stale':
      return 'unconfirmed'
  }
}
