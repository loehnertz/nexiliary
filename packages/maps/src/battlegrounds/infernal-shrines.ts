import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * The slowest cadence in the pool — a 3:00 offset off a clean resolution — which is why
 * it degrades latest of any map with a real fight spread.
 *
 * Sources: objective figures from the validated table in `docs/architecture.md`; camps
 * from the wiki, recorded in `docs/camp-data.md`.
 */
export const infernalShrines: MapDefinition = {
  id: 'infernal-shrines',
  name: 'Infernal Shrines',
  provenance: 'published',
  objective: {
    kind: 'timed',
    label: 'Shrine',
    firstSpawnSeconds: 180,
    // The shrine contested and cleared, then the Punisher's lifetime.
    fight: { medianSeconds: 110, spreadSeconds: 30 },
    respawn: { kind: 'afterResolution', outcomes: { punisherDied: { minSeconds: 180, maxSeconds: 180 } } },
    instances: '1 shrine',
  },
  camps: [
    camp({ id: 'impaler-w', label: 'impalers', type: 'siege', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'impaler-c', label: 'impalers', type: 'siege', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [35] }),
    camp({ id: 'impaler-e', label: 'impalers', type: 'siege', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'shaman-w', label: 'shaman', type: 'bruiser', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [50] }),
    camp({ id: 'shaman-e', label: 'shaman', type: 'bruiser', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [50] }),
  ],
}
