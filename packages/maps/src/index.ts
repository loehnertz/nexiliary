import type { MapDefinition } from '@nexiliary/engine'
import { braxisHoldout } from './battlegrounds/braxis-holdout.js'
import { fallbackMap } from './fallback.js'

export { fallbackMap }
export { cueText } from './cue-text.js'
export * from './schema.js'
export { camp } from './camp-presets.js'
export type { CampSpec } from './camp-presets.js'

export const battlegrounds: readonly MapDefinition[] = [braxisHoldout]

const byId = new Map(battlegrounds.map((m) => [m.id, m]))

/**
 * An unrecognised map falls back to waves, tiers and the death timer rather than
 * failing, which covers ARAM and any future rotation change without a release.
 */
export function mapById(id: string): MapDefinition {
  return byId.get(id) ?? { ...fallbackMap, id, name: id }
}

export { braxisHoldout }
