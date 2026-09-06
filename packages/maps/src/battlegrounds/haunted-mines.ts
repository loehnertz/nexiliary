import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * The one map whose wiki page carries no camp timings at all: it names the camps and
 * their locations under "areas of interest" and gives no spawn or respawn line. The
 * values below therefore fall back to the game-wide figures on the wiki's general
 * mercenary page — siege giants at 1:00 with a 3:00 respawn, sappers at 1:00 with 2:00 —
 * rather than being invented. That is recorded in `docs/camp-data.md` and is the first
 * thing to correct by hand.
 *
 * The page also does not say whether camps are removed while the mine is open, so the
 * flag is left off: asserting suppression on no evidence would remove every camp from the
 * rail for two minutes a cycle.
 *
 * Sources: objective figures from the validated table in `docs/architecture.md`; camps
 * from the wiki's general mercenary page, as noted above.
 */
export const hauntedMines: MapDefinition = {
  id: 'haunted-mines',
  name: 'Haunted Mines',
  // Stays `published`: the objective figures corroborate, but the wiki page carries no
  // camp timings at all, so the camps below are the game-wide fallback rather than this
  // battleground's own numbers. One source, and not even a specific one.
  provenance: 'published',
  objective: {
    kind: 'timed',
    label: 'Mines',
    firstSpawnSeconds: 180,
    // The mine phase, then the golems marching until the last one dies.
    fight: { medianSeconds: 145, spreadSeconds: 40 },
    endedLabel: 'Golems died',
    respawn: { kind: 'afterResolution', outcomes: { golemsDied: { label: 'Golems died', minSeconds: 120, maxSeconds: 120 } } },
    instances: '1 mine',
  },
  camps: [
    camp({ id: 'siege-w', label: 'siege w', type: 'siege', bearing: 'w', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [40] }),
    camp({ id: 'siege-e', label: 'siege e', type: 'siege', bearing: 'e', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [40] }),
    camp({ id: 'sapper-n', label: 'sappers n', type: 'siege', bearing: 'n', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 120, travelSeconds: [35] }),
    camp({ id: 'sapper-s', label: 'sappers s', type: 'siege', bearing: 's', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 120, travelSeconds: [35] }),
  ],
}
