import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * `architecture.md` names this map alongside Sky Temple as having a deterministic phase
 * duration and therefore `spreadSeconds: 0`. Only half of that is true here. The final
 * barrage is a fixed fifteen seconds, but the phase is *pushing a payload*, and how long
 * that takes is exactly the human variable the fight spread exists to price. Claiming
 * otherwise would render an escort that can run two minutes long as though the app knew
 * when it ends.
 *
 * So the spread is real here, and Sky Temple is left as the sole map that `minStepSpread`
 * carries.
 *
 * The Recon camps are omitted rather than modelled. They respawn immediately, so there is
 * no countdown to give, and a chip with nothing to say is not an input.
 *
 * Sources: objective figures from the validated table in `docs/architecture.md`; camps
 * from the wiki, recorded in `docs/camp-data.md`.
 */
export const hanamuraTemple: MapDefinition = {
  id: 'hanamura-temple',
  name: 'Hanamura Temple',
  provenance: 'published',
  objective: {
    kind: 'timed',
    label: 'Payload',
    firstSpawnSeconds: 180,
    fight: { medianSeconds: 105, spreadSeconds: 30 },
    respawn: { kind: 'afterResolution', outcomes: { lastShot: { minSeconds: 180, maxSeconds: 180 } } },
    instances: '1 payload',
  },
  camps: [
    camp({ id: 'sentinel-sw', label: 'sentinel sw', type: 'siege', bearing: 'sw', firstSpawnSeconds: 60, respawnSeconds: 120, travelSeconds: [45] }),
    camp({ id: 'sentinel-ne', label: 'sentinel ne', type: 'siege', bearing: 'ne', firstSpawnSeconds: 60, respawnSeconds: 120, travelSeconds: [45] }),
    camp({ id: 'fort-se', label: 'turret se', type: 'special', bearing: 'se', firstSpawnSeconds: 60, respawnSeconds: 150, travelSeconds: [40] }),
    camp({ id: 'fort-nw', label: 'turret nw', type: 'special', bearing: 'nw', firstSpawnSeconds: 60, respawnSeconds: 150, travelSeconds: [40] }),
  ],
}
