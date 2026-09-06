import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * The altars move between cycles — two, then two or three, in different places — so
 * `travelSeconds` and `pressureValue` are indexed by cycle. A single camp constant cannot
 * be right for all of them, and a static argmax would name the same camp every cycle of
 * every match.
 *
 * The wiki's general mercenary page gives the sappers a 2:30 respawn here against the
 * 3:00 on its own page for this battleground. The per-map page is used, as everywhere
 * else, and the disagreement is recorded in `docs/camp-data.md`.
 *
 * Sources: objective figures from the validated table in `docs/architecture.md`; camps
 * from the wiki, recorded in `docs/camp-data.md`.
 */
export const towersOfDoom: MapDefinition = {
  id: 'towers-of-doom',
  name: 'Towers of Doom',
  provenance: 'verified',
  provenanceNote:
    'Objective 3:00 and 1:50 after all altars are captured agree between the wiki and the Icy Veins table; camps from the wiki page. docs/objective-timings.md',
  objective: {
    kind: 'timed',
    label: 'Altars',
    firstSpawnSeconds: 180,
    // Capturing altars is quick and rarely drags.
    fight: { medianSeconds: 50, spreadSeconds: 20 },
    endedLabel: 'Altars captured',
    respawn: { kind: 'afterResolution', outcomes: { altarsCaptured: { label: 'Altars captured', minSeconds: 110, maxSeconds: 110 } } },
    instances: '2-3 altars',
  },
  camps: [
    camp({
      id: 'sapper-n',
      label: 'Sappers north',
      type: 'siege',
      bearing: 'n', position: { x: 0.5, y: 0.12 },
      firstSpawnSeconds: 60,
      respawnSeconds: 180,
      travelSeconds: [35, 50, 45],
      pressureValue: [7, 5, 6],
    }),
    camp({
      id: 'sapper-w',
      label: 'Sappers west',
      type: 'siege',
      bearing: 'w', position: { x: 0.415, y: 0.615 },
      firstSpawnSeconds: 60,
      respawnSeconds: 180,
      travelSeconds: [50, 35, 45],
      pressureValue: [5, 7, 6],
    }),
    camp({
      id: 'sapper-e',
      label: 'Sappers east',
      type: 'siege',
      bearing: 'e', position: { x: 0.585, y: 0.61 },
      firstSpawnSeconds: 60,
      respawnSeconds: 180,
      travelSeconds: [50, 35, 45],
      pressureValue: [5, 7, 6],
    }),
    camp({ id: 'horseman', label: 'Boss', type: 'boss', bearing: 'c', position: { x: 0.5, y: 0.31 }, firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [50] }),
  ],
}
