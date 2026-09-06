import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * The 1:45 runs from the **surviving** Immortal dying in lane, not from the middle race.
 * The wiki is explicit: "Once the Immortal is killed in lane, the next phase starts in
 * 1:45". So the objective resolves in two stages — the race in the middle, then the
 * winner charging for fifteen seconds and pushing a lane until the defenders kill it,
 * which can take anywhere from seconds to a very long time — and only the second one
 * starts the clock. That is why `endedLabel` names it.
 *
 * Sources: objective figures from the validated table in `docs/architecture.md`; camps
 * from the wiki, recorded in `docs/camp-data.md`.
 */
export const battlefieldOfEternity: MapDefinition = {
  id: 'battlefield-of-eternity',
  name: 'Battlefield of Eternity',
  provenance: 'published',
  campsSuppressedDuringObjective: true,
  objective: {
    kind: 'timed',
    label: 'Immortals',
    firstSpawnSeconds: 180,
    // The race, then the winning Immortal marching until the loser dies.
    fight: { medianSeconds: 100, spreadSeconds: 30 },
    endedLabel: 'Immortal died in lane',
    respawn: { kind: 'afterResolution', outcomes: { immortalDied: { label: 'Immortal died in lane', minSeconds: 105, maxSeconds: 105 } } },
    instances: '2 immortals',
  },
  camps: [
    camp({ id: 'impaler-n', label: 'impalers n', type: 'siege', bearing: 'n', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [40] }),
    camp({ id: 'impaler-s', label: 'impalers s', type: 'siege', bearing: 's', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [40] }),
    camp({ id: 'shaman-w', label: 'shaman w', type: 'bruiser', bearing: 'w', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [35] }),
    camp({ id: 'shaman-e', label: 'shaman e', type: 'bruiser', bearing: 'e', firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [35] }),
  ],
}
