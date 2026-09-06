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
  provenance: 'verified',
  provenanceNote:
    'Objective 3:00 and 3:00 after the payload fires agree between the wiki and the Icy Veins table; camps from the wiki page. docs/objective-timings.md',
  objective: {
    kind: 'timed',
    label: 'Payload',
    firstSpawnSeconds: 180,
    fight: { medianSeconds: 105, spreadSeconds: 30 },
    endedLabel: 'Payload fired',
    respawn: { kind: 'afterResolution', outcomes: { lastShot: { label: 'Payload fired', minSeconds: 180, maxSeconds: 180 } } },
    instances: '1 payload',
  },
  camps: [
    camp({ id: 'sentinel-sw', label: 'sentinel sw', type: 'siege', bearing: 'sw', position: { x: 0.36, y: 0.615 }, firstSpawnSeconds: 60, respawnSeconds: 120, travelSeconds: [45] }),
    camp({ id: 'sentinel-ne', label: 'sentinel ne', type: 'siege', bearing: 'ne', position: { x: 0.635, y: 0.4 }, firstSpawnSeconds: 60, respawnSeconds: 120, travelSeconds: [45] }),
    camp({ id: 'fort-se', label: 'turret se', type: 'special', bearing: 'se', position: { x: 0.6, y: 0.615 }, firstSpawnSeconds: 60, respawnSeconds: 150, travelSeconds: [40] }),
    camp({ id: 'fort-nw', label: 'turret nw', type: 'special', bearing: 'nw', position: { x: 0.4, y: 0.4 }, firstSpawnSeconds: 60, respawnSeconds: 150, travelSeconds: [40] }),
  ],
}
