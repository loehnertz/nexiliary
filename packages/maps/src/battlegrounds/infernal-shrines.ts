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
  provenance: 'verified',
  provenanceNote:
    'Objective 3:00 and 3:00 after the last Punisher dies agree between the wiki and the Icy Veins table; camps from the wiki page. docs/objective-timings.md',
  objective: {
    kind: 'timed',
    label: 'Shrine',
    firstSpawnSeconds: 180,
    // The shrine contested and cleared, then the Punisher's lifetime.
    fight: { medianSeconds: 110, spreadSeconds: 30 },
    endedLabel: 'Punisher died',
    respawn: { kind: 'afterResolution', outcomes: { punisherDied: { label: 'Punisher died', minSeconds: 180, maxSeconds: 180 } } },
    instances: '1 shrine',
  },
  camps: [
    camp({ id: 'impaler-w', label: 'impalers w', type: 'siege', bearing: 'w', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'impaler-c', label: 'impalers mid', type: 'siege', bearing: 'c', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [35] }),
    camp({ id: 'impaler-e', label: 'impalers e', type: 'siege', bearing: 'e', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'shaman-w', label: 'shaman w', type: 'bruiser', bearing: 'w', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [50] }),
    camp({ id: 'shaman-e', label: 'shaman e', type: 'bruiser', bearing: 'e', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [50] }),
  ],
}
