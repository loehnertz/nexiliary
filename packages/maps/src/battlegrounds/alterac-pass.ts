import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * The only map whose respawn offset scales with game time: 1:50 to 2:30, reduced by two
 * seconds per minute of elapsed game time. `scalePerMinuteSeconds` exists solely for it,
 * and without it the numbers would be visibly wrong by the twenty minute mark.
 *
 * `minOffsetSeconds` is not optional here, and its value is not a guess: the wiki caps
 * the elapsed-minutes term at 30, so the reduction stops at 60 seconds and the offset
 * bottoms out at 50 to 90. Without a floor the two-seconds-a-minute term reaches zero at
 * 55 minutes and goes negative after, and matches do run long. The floor moves both ends
 * together so the offset's half-width — which feeds the band — survives the scaling.
 *
 * Camps are removed while the cavalry are up, returning once all three are killed.
 *
 * Sources: objective figures from the validated table in `docs/architecture.md`; camps
 * from the wiki, recorded in `docs/camp-data.md`.
 */
export const alteracPass: MapDefinition = {
  id: 'alterac-pass',
  name: 'Alterac Pass',
  provenance: 'verified',
  provenanceNote:
    'Objective 3:00 and 110-150 minus 2s per elapsed minute (capped at 30 min) agree between the wiki and the Icy Veins table; camps from the wiki page. docs/objective-timings.md',
  campsSuppressedDuringObjective: true,
  objective: {
    kind: 'timed',
    label: 'Cavalry',
    firstSpawnSeconds: 180,
    // Three cavalry, escorted or killed. Long and variable.
    fight: { medianSeconds: 95, spreadSeconds: 30 },
    endedLabel: 'Cavalry gone',
    respawn: {
      kind: 'afterResolution',
      minOffsetSeconds: 50,
      scalePerMinuteSeconds: 2,
      outcomes: { completed: { label: 'Cavalry gone', minSeconds: 110, maxSeconds: 150 } },
    },
    instances: '3 cavalry',
  },
  camps: [
    camp({ id: 'gnoll-e', label: 'gnolls e', type: 'siege', bearing: 'e', position: { x: 0.615, y: 0.42 }, firstSpawnSeconds: 60, respawnSeconds: 90, travelSeconds: [40] }),
    camp({ id: 'gnoll-w', label: 'gnolls w', type: 'siege', bearing: 'w', position: { x: 0.355, y: 0.58 }, firstSpawnSeconds: 60, respawnSeconds: 90, travelSeconds: [40] }),
    camp({ id: 'giant-n', label: 'ice giant n', type: 'boss', bearing: 'n', position: { x: 0.485, y: 0.18 }, firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [60] }),
    camp({ id: 'giant-s', label: 'ice giant s', type: 'boss', bearing: 's', position: { x: 0.51, y: 0.815 }, firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [60] }),
  ],
}
