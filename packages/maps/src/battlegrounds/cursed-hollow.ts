import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * The map that forced two resolution outcomes into the model, and the worst case in the
 * pool for degradation.
 *
 * A tribute respawns 0:50 to 1:30 after one is collected, but 2:00 to 2:40 after a curse
 * ends. Naming the outcome would need a control, and none exists: when the player has not
 * said which happened, the band spans the union of the *reachable* outcomes.
 *
 * A curse requires one team to hold three tributes, so it cannot possibly have occurred
 * before the third spawn. `possibleFromCycle: 3` is what keeps the early cycles on the
 * tight band; taking the union from cycle one would give a 110 second band before any
 * fight spread, which alone nearly exhausts `maxUsefulBand` and would make the map go
 * `Unknown` by its third cycle. Past that point the union is genuinely wide and this map
 * has little objective coaching in the second half of a match regardless of tapping.
 * The outcome-naming control is the fix, and it is deferred.
 *
 * Sources: objective figures from the validated table in `docs/architecture.md`; camps
 * from the wiki, recorded in `docs/camp-data.md`.
 */
export const cursedHollow: MapDefinition = {
  id: 'cursed-hollow',
  name: 'Cursed Hollow',
  provenance: 'published',
  objective: {
    kind: 'timed',
    label: 'Tribute',
    firstSpawnSeconds: 180,
    // One tribute, contested and then collected. Short and fairly consistent.
    fight: { medianSeconds: 40, spreadSeconds: 20 },
    respawn: {
      kind: 'afterResolution',
      outcomes: {
        collected: { minSeconds: 50, maxSeconds: 90 },
        curse: { minSeconds: 120, maxSeconds: 160, possibleFromCycle: 3 },
      },
    },
    instances: '1 tribute',
  },
  camps: [
    camp({ id: 'siege-nw', label: 'siege nw', type: 'siege', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'siege-se', label: 'siege se', type: 'siege', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'knight-ne', label: 'knights ne', type: 'bruiser', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [40] }),
    camp({ id: 'knight-sw', label: 'knights sw', type: 'bruiser', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [40] }),
    camp({ id: 'golem-ne', label: 'boss ne', type: 'boss', firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [60] }),
    camp({ id: 'golem-sw', label: 'boss sw', type: 'boss', firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [60] }),
  ],
}
