import type { MapDefinition } from '@nexiliary/engine'

/**
 * Unrecognised battlegrounds, which also covers ARAM maps and any future rotation
 * change without a release. `provenance: 'unknown'` drops every map-derived event, so
 * what is left is the floor: waves, tiers and the death timer.
 */
export const fallbackMap: MapDefinition = {
  id: 'unknown',
  name: 'Unknown battleground',
  provenance: 'unknown',
  objective: { kind: 'none' },
  camps: [],
}
