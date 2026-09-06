import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * Beacons at 1:30, then 2:10 after both Zerg swarms die. A scalar offset, so the cycle
 * after an anchor collapses to `Exact` once the map is hand-timed.
 *
 * `fight` spans beacon activation to the Zerg waves being cleared, which is the event
 * the respawn actually chains off: the wiki says "Beacon events after the first will spawn
 * 2 minutes and 10 seconds after a previous Zerg wave has been defeated". Capturing the
 * beacons is only the first half, so `endedLabel` says "Zerg cleared" — tapping at the
 * capture would anchor the whole chain a minute or more early.
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
  provenance: 'verified',
  provenanceNote:
    'Objective 1:30 and 2:10 after the Zerg wave is defeated agree between the wiki and the Icy Veins table; camps from the wiki page. docs/objective-timings.md',
  campsSuppressedDuringObjective: true,
  objective: {
    kind: 'timed',
    label: 'Beacons',
    firstSpawnSeconds: 90,
    fight: { medianSeconds: 110, spreadSeconds: 30 },
    endedLabel: 'Zerg cleared',
    respawn: { kind: 'afterResolution', outcomes: { zergCleared: { label: 'Zerg cleared', minSeconds: 130, maxSeconds: 130 } } },
    instances: '2 beacons',
  },
  camps: [
    camp({ id: 'hellbat-ne', label: 'hellbats ne', type: 'siege', bearing: 'ne', position: { x: 0.564, y: 0.352 }, firstSpawnSeconds: 60, respawnSeconds: 90, travelSeconds: [35] }),
    camp({ id: 'hellbat-sw', label: 'hellbats sw', type: 'siege', bearing: 'sw', position: { x: 0.372, y: 0.619 }, firstSpawnSeconds: 60, respawnSeconds: 90, travelSeconds: [35] }),
    camp({ id: 'raven-nw', label: 'raven nw', type: 'bruiser', bearing: 'nw', position: { x: 0.353, y: 0.389 }, firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [35] }),
    camp({ id: 'raven-se', label: 'raven se', type: 'bruiser', bearing: 'se', position: { x: 0.59, y: 0.574 }, firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [35] }),
    camp({ id: 'archangel', label: 'archangel', type: 'boss', bearing: 'c', position: { x: 0.469, y: 0.487 }, firstSpawnSeconds: 300, respawnSeconds: 250, travelSeconds: [50] }),
  ],
}
