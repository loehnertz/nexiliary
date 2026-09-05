import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * The second two-outcome map. A seed collected respawns the objective in 0:50 to 1:20;
 * the Garden Terrors dying takes 1:30 to 2:00. Three seeds are needed before a Terror can
 * exist, so the slow branch is unreachable before the third spawn.
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
  provenance: 'published',
  campsSuppressedDuringObjective: true,
  objective: {
    kind: 'timed',
    label: 'Garden',
    firstSpawnSeconds: 150,
    fight: { medianSeconds: 100, spreadSeconds: 35 },
    respawn: {
      kind: 'afterResolution',
      outcomes: {
        seedCollected: { minSeconds: 50, maxSeconds: 80 },
        terrorsDied: { minSeconds: 90, maxSeconds: 120, possibleFromCycle: 3 },
      },
    },
    instances: '1 seed',
  },
  camps: [
    camp({ id: 'siege-nw', label: 'siege nw', type: 'siege', bearing: 'nw', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'siege-ne', label: 'siege ne', type: 'siege', bearing: 'ne', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'siege-sw', label: 'siege sw', type: 'siege', bearing: 'sw', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'siege-se', label: 'siege se', type: 'siege', bearing: 'se', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'knight-ne', label: 'knights ne', type: 'bruiser', bearing: 'ne', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [40] }),
    camp({ id: 'knight-sw', label: 'knights sw', type: 'bruiser', bearing: 'sw', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [40] }),
  ],
}
