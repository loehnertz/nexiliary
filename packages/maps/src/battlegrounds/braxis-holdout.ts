import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * Beacons at 1:30, then 2:10 after both Zerg swarms die. A scalar offset, so the cycle
 * after an anchor collapses to `Exact` once the map is hand-timed.
 *
 * `fight` spans beacon activation to the Zerg waves being cleared, which is the event
 * the respawn actually chains off: roughly forty seconds of capture, the cells filling,
 * then the waves marching and dying. Judgement, and wide on purpose.
 *
 * Camps are removed from the field while the objective is live, which is why this map
 * carries `campsSuppressedDuringObjective`.
 *
 * Sources: Heroes of the Storm wiki, Braxis Holdout; objective figures cross-checked
 * against the validated table in `docs/architecture.md`.
 */
export const braxisHoldout: MapDefinition = {
  id: 'braxis-holdout',
  name: 'Braxis Holdout',
  provenance: 'published',
  campsSuppressedDuringObjective: true,
  objective: {
    kind: 'timed',
    label: 'Beacons',
    firstSpawnSeconds: 90,
    fight: { medianSeconds: 110, spreadSeconds: 30 },
    respawn: { kind: 'afterResolution', outcomes: { zergCleared: { minSeconds: 130, maxSeconds: 130 } } },
    instances: '2 beacons',
  },
  camps: [
    camp({ id: 'hellbat-ne', label: 'hellbats ne', type: 'siege', bearing: 'ne', firstSpawnSeconds: 60, respawnSeconds: 90, travelSeconds: [35] }),
    camp({ id: 'hellbat-sw', label: 'hellbats sw', type: 'siege', bearing: 'sw', firstSpawnSeconds: 60, respawnSeconds: 90, travelSeconds: [35] }),
    camp({ id: 'raven-nw', label: 'raven nw', type: 'bruiser', bearing: 'nw', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [35] }),
    camp({ id: 'raven-se', label: 'raven se', type: 'bruiser', bearing: 'se', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [35] }),
    camp({ id: 'archangel', label: 'archangel', type: 'boss', bearing: 'c', firstSpawnSeconds: 300, respawnSeconds: 250, travelSeconds: [50] }),
  ],
}
