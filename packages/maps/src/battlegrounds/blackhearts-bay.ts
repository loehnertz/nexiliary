import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * Not a fixed interval after all. `architecture.md` calls this "the one `fixedInterval`
 * map", but the wiki says it twice and unambiguously: chests spawn "3 minutes (paused
 * during the cannon firing event) after the final Chest of the previous event has been
 * captured". That is `afterResolution` with a scalar offset, exactly like the others —
 * which leaves `fixedInterval` with no users at all in the pool.
 *
 * The residual limitation survives the correction: the timer **pauses during a
 * bombardment**, which a player triggers by turning in doubloons and which the app cannot
 * see. Over a match with several bombardments it drifts by minutes, and inventing an
 * anchor for "a bombardment started" would fail the input gate — nobody is tapping a
 * phone while a bombardment is being contested.
 *
 * The recovery is the tap the player is already making: an `ObjectiveEnded` anchor
 * re-anchors the chain from that moment, so a bombardment costs one cycle rather than the
 * rest of the match.
 *
 * Sources: objective figures from the validated table in `docs/architecture.md`; camps
 * from the wiki, recorded in `docs/camp-data.md`.
 */
export const blackheartsBay: MapDefinition = {
  id: 'blackhearts-bay',
  name: "Blackheart's Bay",
  provenance: 'verified',
  provenanceNote:
    'Objective 1:30 and 3:00 after the final chest is captured, stated twice on the wiki page and matching the Icy Veins figure; camps from the wiki page. docs/objective-timings.md',
  objective: {
    kind: 'timed',
    label: 'Chests',
    firstSpawnSeconds: 90,
    fight: { medianSeconds: 55, spreadSeconds: 25 },
    respawn: {
      kind: 'afterResolution',
      outcomes: { lastChestTaken: { label: 'Last chest taken', minSeconds: 180, maxSeconds: 180 } },
    },
    instances: '1, then 2, then 3 chests',
  },
  camps: [
    camp({ id: 'doubloon-s', label: 'Doubloons south', type: 'special', bearing: 's', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 150, travelSeconds: [40] }),
    camp({ id: 'doubloon-n', label: 'Doubloons north', type: 'special', bearing: 'n', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 150, travelSeconds: [40] }),
    camp({ id: 'siege-w', label: 'Siege west', type: 'siege', bearing: 'w', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'siege-e', label: 'Siege east', type: 'siege', bearing: 'e', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
    camp({ id: 'knight-s', label: 'Knights south', type: 'bruiser', bearing: 's', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [40] }),
    camp({ id: 'knight-w', label: 'Knights west', type: 'bruiser', bearing: 'w', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [40] }),
    camp({ id: 'knight-e', label: 'Knights east', type: 'bruiser', bearing: 'e', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [40] }),
    camp({ id: 'golem', label: 'Boss', type: 'boss', bearing: 'n', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [60] }),
  ],
}
