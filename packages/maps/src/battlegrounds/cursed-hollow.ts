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
 * A curse requires one team to hold three tributes, so the earliest cycle that *can*
 * resolve as a curse is the third — which predicts the **fourth** spawn.
 * `architecture.md` says `possibleFromCycle: 3`, which is the off-by-one it warns about
 * two paragraphs earlier: the field indexes the spawning cycle, not the resolving one.
 *
 * The gate is what keeps the early cycles on the tight band. Taking the union from cycle
 * one gives a 110 second band before any fight spread, which alone nearly exhausts
 * `maxUsefulBand` and would make the map go `Unknown` by its third cycle. Past that point the union is genuinely wide and this map
 * has little objective coaching in the second half of a match regardless of tapping.
 * The outcome-naming control is the fix, and it is deferred.
 *
 * Sources: objective figures from the validated table in `docs/architecture.md`; camps
 * from the wiki, recorded in `docs/camp-data.md`.
 */
export const cursedHollow: MapDefinition = {
  id: 'cursed-hollow',
  name: 'Cursed Hollow',
  provenance: 'verified',
  provenanceNote:
    'Objective 3:00, 0:50-1:30 and 2:00-2:40 after a curse agree between the wiki and the Icy Veins table; camps from the wiki page. docs/objective-timings.md',
  objective: {
    kind: 'timed',
    label: 'Tribute',
    firstSpawnSeconds: 180,
    // One tribute, contested and then collected. Short and fairly consistent.
    //
    // Note that the two outcomes are anchored at genuinely different moments, not just
    // given different offsets: 0:50-1:30 runs from the tribute being collected, while
    // 2:00-2:40 runs from the *curse ending*, and the curse itself lasts 70 seconds after
    // the third tribute. The two button labels say which moment each means, which is why
    // naming the outcome is a tap the player can actually make correctly.
    fight: { medianSeconds: 40, spreadSeconds: 20 },
    respawn: {
      kind: 'afterResolution',
      outcomes: {
        collected: { label: 'Tribute taken', minSeconds: 50, maxSeconds: 90 },
        curse: { label: 'Curse ended', minSeconds: 120, maxSeconds: 160, possibleFromCycle: 4 },
      },
    },
    instances: '1 tribute',
  },
  camps: [
    camp({ id: 'siege-nw', label: 'Siege north-west', type: 'siege', bearing: 'nw', position: { x: 0.305, y: 0.385 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'siege-se', label: 'Siege south-east', type: 'siege', bearing: 'se', position: { x: 0.714, y: 0.575 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'knight-ne', label: 'Knights north-east', type: 'bruiser', bearing: 'ne', position: { x: 0.653, y: 0.378 }, firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [40] }),
    camp({ id: 'knight-sw', label: 'Knights south-west', type: 'bruiser', bearing: 'sw', position: { x: 0.359, y: 0.605 }, firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [40] }),
    camp({ id: 'golem-ne', label: 'Boss north-east', type: 'boss', bearing: 'ne', position: { x: 0.604, y: 0.193 }, firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [60] }),
    camp({ id: 'golem-sw', label: 'Boss south-west', type: 'boss', bearing: 'sw', position: { x: 0.418, y: 0.782 }, firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [60] }),
  ],
}
