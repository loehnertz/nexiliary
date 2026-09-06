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
  provenance: 'published',
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
    camp({ id: 'trooper-w', label: 'troopers w', type: 'siege', bearing: 'w', firstSpawnSeconds: 60, respawnSeconds: 105, travelSeconds: [45] }),
    camp({ id: 'trooper-e', label: 'troopers e', type: 'siege', bearing: 'e', firstSpawnSeconds: 60, respawnSeconds: 105, travelSeconds: [45] }),
    camp({ id: 'fort-w', label: 'turret w', type: 'special', bearing: 'w', firstSpawnSeconds: 60, respawnSeconds: 105, travelSeconds: [40] }),
    camp({ id: 'fort-e', label: 'turret e', type: 'special', bearing: 'e', firstSpawnSeconds: 60, respawnSeconds: 105, travelSeconds: [40] }),
    camp({ id: 'support', label: 'support', type: 'special', bearing: 'c', firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [30] }),
  ],
}
