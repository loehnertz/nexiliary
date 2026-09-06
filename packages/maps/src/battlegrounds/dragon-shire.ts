import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * Camps vanish once the Dragon Knight is *activated*, which is after both shrines are
 * held, rather than at the moment the shrines open. The suppression window here therefore
 * opens earlier than the camps actually leave.
 *
 * That is deliberate. Suppressing early produces silence about camps that are in fact
 * still there, which costs an opportunity; not suppressing at all would advise starting a
 * camp that has been removed from the map, which is advice acted on mid-match. The whole
 * project errs toward silence.
 *
 * Sources: objective figures from the validated table in `docs/architecture.md`; camps
 * from the wiki, recorded in `docs/camp-data.md`.
 */
export const dragonShire: MapDefinition = {
  id: 'dragon-shire',
  name: 'Dragon Shire',
  provenance: 'published',
  campsSuppressedDuringObjective: true,
  objective: {
    kind: 'timed',
    label: 'Shrines',
    firstSpawnSeconds: 90,
    // Shrines held, the Dragon Knight taken, then ridden until it dies. It expires on its
    // own after 1:07 if nobody kills it, which bounds the tail.
    fight: { medianSeconds: 110, spreadSeconds: 35 },
    endedLabel: 'Dragon Knight died',
    respawn: { kind: 'afterResolution', outcomes: { knightDied: { minSeconds: 120, maxSeconds: 120 } } },
    instances: '2 shrines',
  },
  camps: [
    camp({ id: 'siege-w', label: 'siege w', type: 'siege', bearing: 'w', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'siege-e', label: 'siege e', type: 'siege', bearing: 'e', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'knight-s', label: 'knights s', type: 'bruiser', bearing: 's', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [40] }),
    camp({ id: 'knight-w', label: 'knights w', type: 'bruiser', bearing: 'w', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [40] }),
    camp({ id: 'knight-e', label: 'knights e', type: 'bruiser', bearing: 'e', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [40] }),
  ],
}
