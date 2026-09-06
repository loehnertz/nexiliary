import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * The map that justifies `minStepSpread`.
 *
 * Temples fire for a fixed forty seconds and the offset is a single number, so both
 * inputs to `stepSpread` are zero and the chain would report `Exact` at cycle twenty
 * with no taps. Those cycles genuinely are close to deterministic, but "the phase
 * resolved exactly when the model says" is itself an assumption, and the floor prices
 * it. In practice this map stays `Estimated` for a whole match rather than reaching
 * `Unknown`, which is the honest answer for a near-deterministic cadence.
 *
 * `spreadSeconds: 0` is deliberate, not a missing value. Forcing a deterministic phase
 * through a spread would manufacture an amber "due soon" for a number the app knows.
 *
 * The objective's location moves between cycles — top and mid, then bottom, then a
 * random pair — so `travelSeconds` and `pressureValue` are indexed by cycle rather than
 * being one constant that cannot be right for all of them.
 *
 * Sources: objective figures from the validated table in `docs/architecture.md`; camps
 * from the wiki, recorded in `docs/camp-data.md`.
 */
export const skyTemple: MapDefinition = {
  id: 'sky-temple',
  name: 'Sky Temple',
  provenance: 'verified',
  provenanceNote:
    'Objective 3:00 and 2:00 after all temples clear agree between the wiki and the Icy Veins table; camps from the wiki page. docs/objective-timings.md',
  objective: {
    kind: 'timed',
    label: 'Temples',
    firstSpawnSeconds: 180,
    fight: { medianSeconds: 40, spreadSeconds: 0 },
    endedLabel: 'Temples stopped',
    respawn: { kind: 'afterResolution', outcomes: { lastShot: { label: 'Temples stopped', minSeconds: 120, maxSeconds: 120 } } },
    instances: '1-2 temples',
  },
  camps: [
    // Cycle 1 activates top and mid, cycle 2 bottom, and later cycles are random. The
    // bottom-lane siege camps are close to the first temples and far from the second.
    camp({
      id: 'siege-w',
      label: 'siege w',
      type: 'siege',
      bearing: 'w', position: { x: 0.5, y: 0.5 },
      firstSpawnSeconds: 60,
      respawnSeconds: 180,
      travelSeconds: [55, 30, 45],
      pressureValue: [5, 7, 6],
    }),
    camp({
      id: 'siege-e',
      label: 'siege e',
      type: 'siege',
      bearing: 'e', position: { x: 0.5, y: 0.5 },
      firstSpawnSeconds: 60,
      respawnSeconds: 180,
      travelSeconds: [55, 30, 45],
      pressureValue: [5, 7, 6],
    }),
    camp({
      id: 'knight-w',
      label: 'knights w',
      type: 'bruiser',
      bearing: 'w', position: { x: 0.5, y: 0.5 },
      firstSpawnSeconds: 60,
      respawnSeconds: 240,
      travelSeconds: [35, 55, 45],
      pressureValue: [8, 6, 7],
    }),
    camp({
      id: 'knight-e',
      label: 'knights e',
      type: 'bruiser',
      bearing: 'e', position: { x: 0.5, y: 0.5 },
      firstSpawnSeconds: 60,
      respawnSeconds: 240,
      travelSeconds: [35, 55, 45],
      pressureValue: [8, 6, 7],
    }),
    camp({ id: 'golem', label: 'boss', type: 'boss', bearing: 'c', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [55] }),
  ],
}
