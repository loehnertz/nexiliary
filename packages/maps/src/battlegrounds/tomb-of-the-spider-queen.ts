import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * The one map with no timed objective at all. Gems drop continuously from minions and the
 * turn-in is player-initiated with no clock, so there is nothing to count down to.
 *
 * `kind: 'none'` is a supported, tested state rather than an error: the app shows waves,
 * camps, tiers and the death timer, and the objective slot reads "no objective timer on
 * this battleground" rather than sitting blank or falling into the unknown-map path.
 *
 * The wiki says camps are removed while the webweavers are out, and this map nonetheless
 * does *not* carry `campsSuppressedDuringObjective` — the schema rejects the combination.
 * The reason is not bookkeeping: the suppression window is derived from the objective
 * chain's spawn and resolution band, and with no chain there is nothing to derive it
 * from. Setting the flag would ask the app to assert a window it cannot compute, which
 * is the founding principle in miniature.
 *
 * Sources: camps from the wiki, recorded in `docs/camp-data.md`.
 */
export const tombOfTheSpiderQueen: MapDefinition = {
  id: 'tomb-of-the-spider-queen',
  name: 'Tomb of the Spider Queen',
  provenance: 'verified',
  provenanceNote:
    'No timed objective to corroborate; camps from the wiki page. docs/camp-data.md',
  objective: { kind: 'none' },
  camps: [
    camp({ id: 'siege-s', label: 'siege', type: 'siege', bearing: 's', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [35] }),
    camp({ id: 'knight-w', label: 'knights w', type: 'bruiser', bearing: 'w', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [35] }),
    camp({ id: 'knight-e', label: 'knights e', type: 'bruiser', bearing: 'e', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [35] }),
    camp({ id: 'golem', label: 'boss', type: 'boss', bearing: 'n', position: { x: 0.5, y: 0.5 }, firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [55] }),
  ],
}
