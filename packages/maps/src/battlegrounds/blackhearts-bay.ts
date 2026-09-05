import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * The one `fixedInterval` map: chests respawn on their own clock rather than chaining off
 * a resolution.
 *
 * It carries a known residual limitation. The chest timer **pauses during a
 * bombardment**, and a bombardment is triggered by a player turning in doubloons, which
 * the app cannot see. Over a match with several bombardments the interval drifts by
 * minutes, and inventing an anchor for "a bombardment started" would fail the input gate:
 * nobody is tapping a phone while a bombardment is being contested.
 *
 * The recovery is defined rather than gestured at: an `ObjectiveEnded` anchor re-phases
 * the whole band from the tap. So the limitation is recoverable by the tap the player is
 * already making, and the band ships deliberately wide — 2:45 to 3:15 rather than a flat
 * 3:00 — because a single number here would be false precision about a clock the app
 * knows it cannot follow.
 *
 * Sources: objective figures from the validated table in `docs/architecture.md`; camps
 * from the wiki, recorded in `docs/camp-data.md`.
 */
export const blackheartsBay: MapDefinition = {
  id: 'blackhearts-bay',
  name: "Blackheart's Bay",
  provenance: 'published',
  objective: {
    kind: 'timed',
    label: 'Chests',
    firstSpawnSeconds: 90,
    fight: { medianSeconds: 55, spreadSeconds: 25 },
    respawn: { kind: 'fixedInterval', minSeconds: 165, maxSeconds: 195 },
    instances: '1, then 2, then 3 chests',
  },
  camps: [
    camp({ id: 'doubloon-s', label: 'doubloons', type: 'special', firstSpawnSeconds: 60, respawnSeconds: 150, travelSeconds: [40] }),
    camp({ id: 'doubloon-n', label: 'doubloons', type: 'special', firstSpawnSeconds: 60, respawnSeconds: 150, travelSeconds: [40] }),
    camp({ id: 'siege-w', label: 'siege', type: 'siege', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'siege-e', label: 'siege', type: 'siege', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'knight-s', label: 'knights', type: 'bruiser', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [40] }),
    camp({ id: 'knight-w', label: 'knights', type: 'bruiser', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [40] }),
    camp({ id: 'knight-e', label: 'knights', type: 'bruiser', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [40] }),
    camp({ id: 'golem', label: 'boss', type: 'boss', firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [60] }),
  ],
}
