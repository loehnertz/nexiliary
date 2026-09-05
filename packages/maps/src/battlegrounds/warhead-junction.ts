import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * The row that needs confirming. Sources disagree on whether the 2:55 is a true clock
 * cadence or an offset from all warheads being collected; it is recorded as
 * `afterResolution` because that is what the more detailed source says. If it turns out
 * to be a genuine cadence it becomes the second `fixedInterval` map rather than needing a
 * new variant, which is the whole reason the model has exactly three.
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
  provenance: 'published',
  objective: {
    kind: 'timed',
    label: 'Warheads',
    firstSpawnSeconds: 180,
    // Two to four warheads scattered across a large map, collected rather than fought
    // over in one place, so this varies more than most.
    fight: { medianSeconds: 85, spreadSeconds: 35 },
    respawn: { kind: 'afterResolution', outcomes: { allCollected: { minSeconds: 175, maxSeconds: 175 } } },
    instances: '2-4 warheads',
  },
  camps: [
    camp({
      id: 'hellbat-w',
      label: 'hellbats',
      type: 'siege',
      firstSpawnSeconds: 60,
      respawnSeconds: 90,
      travelSeconds: [50, 40, 45],
      pressureValue: [6, 7, 6],
    }),
    camp({
      id: 'hellbat-e',
      label: 'hellbats',
      type: 'siege',
      firstSpawnSeconds: 60,
      respawnSeconds: 90,
      travelSeconds: [50, 40, 45],
      pressureValue: [6, 7, 6],
    }),
    camp({
      id: 'raven-w',
      label: 'raven',
      type: 'bruiser',
      firstSpawnSeconds: 60,
      respawnSeconds: 240,
      travelSeconds: [45, 55, 50],
      pressureValue: [8, 6, 7],
    }),
    camp({
      id: 'raven-e',
      label: 'raven',
      type: 'bruiser',
      firstSpawnSeconds: 60,
      respawnSeconds: 240,
      travelSeconds: [45, 55, 50],
      pressureValue: [8, 6, 7],
    }),
    camp({ id: 'slime', label: 'boss', type: 'boss', firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [60] }),
  ],
}
