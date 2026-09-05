import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * A scalar offset off a clean resolution event — the losing Immortal dying — which makes
 * this one of the eleven maps where the cycle after an anchor collapses to `Exact`, once
 * the map is hand-timed.
 *
 * Sources: objective figures from the validated table in `docs/architecture.md`; camps
 * from the wiki, recorded in `docs/camp-data.md`.
 */
export const battlefieldOfEternity: MapDefinition = {
  id: 'battlefield-of-eternity',
  name: 'Battlefield of Eternity',
  provenance: 'published',
  campsSuppressedDuringObjective: true,
  objective: {
    kind: 'timed',
    label: 'Immortals',
    firstSpawnSeconds: 180,
    // The race, then the winning Immortal marching until the loser dies.
    fight: { medianSeconds: 100, spreadSeconds: 30 },
    respawn: { kind: 'afterResolution', outcomes: { immortalDied: { minSeconds: 105, maxSeconds: 105 } } },
    instances: '2 immortals',
  },
  camps: [
    camp({ id: 'impaler-n', label: 'impalers', type: 'siege', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [40] }),
    camp({ id: 'impaler-s', label: 'impalers', type: 'siege', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [40] }),
    camp({ id: 'shaman-w', label: 'shaman', type: 'bruiser', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [35] }),
    camp({ id: 'shaman-e', label: 'shaman', type: 'bruiser', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [35] }),
  ],
}
