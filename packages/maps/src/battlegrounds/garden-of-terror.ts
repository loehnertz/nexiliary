import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * The second two-outcome map, and the wiki is exact about both branches: "50-80 seconds
 * after the last captured seed, or 90-120s after all Garden Terrors die".
 *
 * "Seeds will continue to spawn until either team gathers three in total", and the Terrors
 * spawn on the third — so the earliest cycle that can resolve as Terrors dying is the
 * third, which predicts the **fourth** spawn. `architecture.md` says
 * `possibleFromCycle: 3`; the field indexes the spawning cycle, so that is one early.
 *
 * Camps vanish once the Terrors are activated, which is after the seed phase rather than
 * at its start, so the suppression window opens earlier than the camps actually leave.
 * See `dragon-shire.ts` for why that is the right direction to be wrong.
 *
 * Sources: objective figures from the validated table in `docs/architecture.md`; camps
 * from the wiki, recorded in `docs/camp-data.md`.
 */
export const gardenOfTerror: MapDefinition = {
  id: 'garden-of-terror',
  name: 'Garden of Terror',
  provenance: 'verified',
  provenanceNote:
    'Objective 2:30, 50-80 after a seed and 90-120 after the Terrors die agree between the wiki and the Icy Veins table; camps from the wiki page. docs/objective-timings.md',
  campsSuppressedDuringObjective: true,
  objective: {
    kind: 'timed',
    label: 'Garden',
    firstSpawnSeconds: 150,
    fight: { medianSeconds: 100, spreadSeconds: 35 },
    endedLabel: 'Terror died',
    respawn: {
      kind: 'afterResolution',
      outcomes: {
        seedCollected: { label: 'Seeds gone', minSeconds: 50, maxSeconds: 80 },
        terrorsDied: { label: 'Terror died', minSeconds: 90, maxSeconds: 120, possibleFromCycle: 4 },
      },
    },
    instances: '1 seed',
  },
  camps: [
    camp({ id: 'siege-nw', label: 'Siege north-west', type: 'siege', bearing: 'nw', position: { x: 0.365, y: 0.28 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'siege-ne', label: 'Siege north-east', type: 'siege', bearing: 'ne', position: { x: 0.615, y: 0.435 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'siege-sw', label: 'Siege south-west', type: 'siege', bearing: 'sw', position: { x: 0.385, y: 0.535 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'siege-se', label: 'Siege south-east', type: 'siege', bearing: 'se', position: { x: 0.635, y: 0.69 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'knight-ne', label: 'Knights north-east', type: 'bruiser', bearing: 'ne', position: { x: 0.58, y: 0.21 }, firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [40] }),
    camp({ id: 'knight-sw', label: 'Knights south-west', type: 'bruiser', bearing: 'sw', position: { x: 0.42, y: 0.76 }, firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [40] }),
  ],
}
