import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * The row `architecture.md` flagged as needing confirming, and it still does. The trigger
 * is settled — the wiki agrees it is an offset from all warheads being collected, not a
 * clock cadence — but the two sources disagree on the number: Icy Veins says 2:55, the
 * wiki says 3:05. The wiki's figure is used because it is the more recently maintained,
 * and the map stays `published` so the ten second disagreement is priced by the clamp
 * rather than papered over. This is the one map the provenance field is doing real work
 * on.
 *
 * Warheads spawn in different places each cycle, so `travelSeconds` and `pressureValue`
 * are indexed by cycle.
 *
 * Sources: objective figures from the validated table in `docs/architecture.md`; camps
 * from the wiki, recorded in `docs/camp-data.md`.
 */
export const warheadJunction: MapDefinition = {
  id: 'warhead-junction',
  name: 'Warhead Junction',
  // Stays `published`: Icy Veins says 2:55 and the wiki says 3:05. Two sources, and they
  // disagree, which is exactly the case the clamp exists for.
  provenance: 'published',
  objective: {
    kind: 'timed',
    label: 'Warheads',
    firstSpawnSeconds: 180,
    // Two to four warheads scattered across a large map, collected rather than fought
    // over in one place, so this varies more than most.
    fight: { medianSeconds: 85, spreadSeconds: 35 },
    endedLabel: 'Warheads gone',
    respawn: { kind: 'afterResolution', outcomes: { allCollected: { label: 'Warheads gone', minSeconds: 185, maxSeconds: 185 } } },
    instances: '2-4 warheads',
  },
  camps: [
    camp({
      id: 'hellbat-w',
      label: 'hellbats w',
      type: 'siege',
      bearing: 'w', position: { x: 0.345, y: 0.6 },
      firstSpawnSeconds: 60,
      respawnSeconds: 90,
      travelSeconds: [50, 40, 45],
      pressureValue: [6, 7, 6],
    }),
    camp({
      id: 'hellbat-e',
      label: 'hellbats e',
      type: 'siege',
      bearing: 'e', position: { x: 0.64, y: 0.6 },
      firstSpawnSeconds: 60,
      respawnSeconds: 90,
      travelSeconds: [50, 40, 45],
      pressureValue: [6, 7, 6],
    }),
    camp({
      id: 'raven-w',
      label: 'raven w',
      type: 'bruiser',
      bearing: 'w', position: { x: 0.365, y: 0.335 },
      firstSpawnSeconds: 60,
      respawnSeconds: 240,
      travelSeconds: [45, 55, 50],
      pressureValue: [8, 6, 7],
    }),
    camp({
      id: 'raven-e',
      label: 'raven e',
      type: 'bruiser',
      bearing: 'e', position: { x: 0.63, y: 0.335 },
      firstSpawnSeconds: 60,
      respawnSeconds: 240,
      travelSeconds: [45, 55, 50],
      pressureValue: [8, 6, 7],
    }),
    camp({ id: 'slime', label: 'boss', type: 'boss', bearing: 'n', position: { x: 0.495, y: 0.07 }, firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [60] }),
  ],
}
