import type { MapDefinition } from '@nexiliary/engine'
import { camp } from '../camp-presets.js'

/**
 * Camps are removed while the Triglav Protector is active, which is after the capture
 * phase rather than at its start, so the suppression window opens earlier than the camps
 * actually leave. See `dragon-shire.ts` for why that is the right direction to be wrong.
 *
 * Sources: objective figures from the validated table in `docs/architecture.md`; camps
 * from the wiki, recorded in `docs/camp-data.md`. The wiki sentence stating that
 * mercenaries are disabled here is grammatically broken and was read as saying so.
 */
export const volskayaFoundry: MapDefinition = {
  id: 'volskaya-foundry',
  name: 'Volskaya Foundry',
  provenance: 'verified',
  provenanceNote:
    'Objective 3:00 and 3:00 after the Triglav Protector dies agree between the wiki and the Icy Veins table; camps from the wiki page. docs/objective-timings.md',
  campsSuppressedDuringObjective: true,
  objective: {
    kind: 'timed',
    label: 'Protector',
    firstSpawnSeconds: 180,
    // The point captured, then the Protector piloted until it dies.
    fight: { medianSeconds: 110, spreadSeconds: 35 },
    endedLabel: 'Protector died',
    respawn: { kind: 'afterResolution', outcomes: { protectorDied: { label: 'Protector died', minSeconds: 180, maxSeconds: 180 } } },
    instances: '1 capture point',
  },
  camps: [
    camp({ id: 'trooper-w', label: 'troopers w', type: 'siege', bearing: 'w', position: { x: 0.345, y: 0.315 }, firstSpawnSeconds: 60, respawnSeconds: 105, travelSeconds: [45] }),
    camp({ id: 'trooper-e', label: 'troopers e', type: 'siege', bearing: 'e', position: { x: 0.655, y: 0.315 }, firstSpawnSeconds: 60, respawnSeconds: 105, travelSeconds: [45] }),
    camp({ id: 'fort-w', label: 'turret w', type: 'special', bearing: 'w', position: { x: 0.395, y: 0.58 }, firstSpawnSeconds: 60, respawnSeconds: 105, travelSeconds: [40] }),
    camp({ id: 'fort-e', label: 'turret e', type: 'special', bearing: 'e', position: { x: 0.61, y: 0.58 }, firstSpawnSeconds: 60, respawnSeconds: 105, travelSeconds: [40] }),
    camp({ id: 'support', label: 'support', type: 'special', bearing: 'c', position: { x: 0.5, y: 0.29 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [30] }),
  ],
}
