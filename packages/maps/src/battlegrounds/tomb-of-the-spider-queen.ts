import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * The one map with no timed objective at all. Gems drop continuously from minions and the
 * turn-in is player-initiated with no clock, so there is nothing to count down to.
 *
 * The wiki's infobox and prose both give explicit numbers anyway — "First Objective 0:30",
 * "Subsequent Objectives 0:15 minutes after all Webweavers die" — which read like every
 * other map's timed-objective figures and were flagged in `docs/objective-timings.md` as
 * an open contradiction with this file. It is not one: 0:30 is when the Altars become
 * usable, not when a wave spawns, since that still needs a team to bank 50 gems first, an
 * unbounded, player-paced quantity with no timer to model. And neither figure comes with a
 * fight/spread duration for the Webweaver push itself, so even the 0:15 subsequent phase
 * has nothing to anchor a `timed` objective's active window on without inventing a number
 * — exactly what "never assert what cannot be derived" exists to rule out.
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
 * Sources: camps from the wiki, recorded in `docs/camp-data.md`. Objective figures
 * considered and rejected, recorded in `docs/objective-timings.md`.
 */
export const tombOfTheSpiderQueen: MapDefinition = {
  id: 'tomb-of-the-spider-queen',
  name: 'Tomb of the Spider Queen',
  provenance: 'verified',
  provenanceNote:
    'No timed objective to corroborate; camps from the wiki page. docs/camp-data.md',
  objective: { kind: 'none' },
  camps: [
    camp({ id: 'siege-s', label: 'Siege', type: 'siege', bearing: 's', position: { x: 0.495, y: 0.895 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [35] }),
    camp({ id: 'knight-w', label: 'Knights west', type: 'bruiser', bearing: 'w', position: { x: 0.33, y: 0.535 }, firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [35] }),
    camp({ id: 'knight-e', label: 'Knights east', type: 'bruiser', bearing: 'e', position: { x: 0.66, y: 0.535 }, firstSpawnSeconds: 60, respawnSeconds: 240, travelSeconds: [35] }),
    camp({ id: 'golem', label: 'Boss', type: 'boss', bearing: 'n', position: { x: 0.495, y: 0.1 }, firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [55] }),
  ],
}
