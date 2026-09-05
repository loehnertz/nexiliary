import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * The only map whose respawn offset scales with game time: 1:50 to 2:30, reduced by two
 * seconds per minute of elapsed game time. `scalePerMinuteSeconds` exists solely for it,
 * and without it the numbers would be visibly wrong by the twenty minute mark.
 *
 * `minOffsetSeconds` is not optional here. Two seconds a minute against a 110 second
 * floor reaches zero at 55 minutes and goes negative after, and matches do run long. The
 * floor moves both ends together so the offset's half-width — which feeds the band —
 * survives the scaling.
 *
 * Camps are removed while the cavalry are up, returning once all three are killed.
 *
 * Sources: objective figures from the validated table in `docs/architecture.md`; camps
 * from the wiki, recorded in `docs/camp-data.md`.
 */
export const alteracPass: MapDefinition = {
  id: 'alterac-pass',
  name: 'Alterac Pass',
  provenance: 'published',
  campsSuppressedDuringObjective: true,
  objective: {
    kind: 'timed',
    label: 'Cavalry',
    firstSpawnSeconds: 180,
    // Three cavalry, escorted or killed. Long and variable.
    fight: { medianSeconds: 95, spreadSeconds: 30 },
    respawn: {
      kind: 'afterResolution',
      minOffsetSeconds: 60,
      scalePerMinuteSeconds: 2,
      outcomes: { completed: { minSeconds: 110, maxSeconds: 150 } },
    },
    instances: '3 cavalry',
  },
  camps: [
    camp({ id: 'gnoll-e', label: 'gnolls e', type: 'siege', firstSpawnSeconds: 60, respawnSeconds: 90, travelSeconds: [40] }),
    camp({ id: 'gnoll-w', label: 'gnolls w', type: 'siege', firstSpawnSeconds: 60, respawnSeconds: 90, travelSeconds: [40] }),
    camp({ id: 'giant-n', label: 'ice giant n', type: 'boss', firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [60] }),
    camp({ id: 'giant-s', label: 'ice giant s', type: 'boss', firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [60] }),
  ],
}
