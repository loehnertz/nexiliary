import type { MapDefinition } from '@nexiliary/engine'
import { alteracPass } from './battlegrounds/alterac-pass.js'
import { battlefieldOfEternity } from './battlegrounds/battlefield-of-eternity.js'
import { blackheartsBay } from './battlegrounds/blackhearts-bay.js'
import { braxisHoldout } from './battlegrounds/braxis-holdout.js'
import { cursedHollow } from './battlegrounds/cursed-hollow.js'
import { dragonShire } from './battlegrounds/dragon-shire.js'
import { gardenOfTerror } from './battlegrounds/garden-of-terror.js'
import { hanamuraTemple } from './battlegrounds/hanamura-temple.js'
import { hauntedMines } from './battlegrounds/haunted-mines.js'
import { infernalShrines } from './battlegrounds/infernal-shrines.js'
import { skyTemple } from './battlegrounds/sky-temple.js'
import { tombOfTheSpiderQueen } from './battlegrounds/tomb-of-the-spider-queen.js'
import { towersOfDoom } from './battlegrounds/towers-of-doom.js'
import { volskayaFoundry } from './battlegrounds/volskaya-foundry.js'
import { warheadJunction } from './battlegrounds/warhead-junction.js'
import { fallbackMap } from './fallback.js'

export { fallbackMap }
export { cueText } from './cue-text.js'
export * from './schema.js'
export { camp } from './camp-presets.js'
export type { CampSpec } from './camp-presets.js'

/** The fifteen battlegrounds in rotation, in the order the picker shows them. */
export const battlegrounds: readonly MapDefinition[] = [
  alteracPass,
  battlefieldOfEternity,
  blackheartsBay,
  braxisHoldout,
  cursedHollow,
  dragonShire,
  gardenOfTerror,
  hanamuraTemple,
  hauntedMines,
  infernalShrines,
  skyTemple,
  tombOfTheSpiderQueen,
  towersOfDoom,
  volskayaFoundry,
  warheadJunction,
]

const byId = new Map(battlegrounds.map((m) => [m.id, m]))

/**
 * An unrecognised map falls back to waves, tiers and the death timer rather than
 * failing, which covers ARAM and any future rotation change without a release.
 */
export function mapById(id: string): MapDefinition {
  return byId.get(id) ?? { ...fallbackMap, id, name: id }
}

export {
  alteracPass,
  battlefieldOfEternity,
  blackheartsBay,
  braxisHoldout,
  cursedHollow,
  dragonShire,
  gardenOfTerror,
  hanamuraTemple,
  hauntedMines,
  infernalShrines,
  skyTemple,
  tombOfTheSpiderQueen,
  towersOfDoom,
  volskayaFoundry,
  warheadJunction,
}
