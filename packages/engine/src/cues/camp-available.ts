import type { Cue } from './types.js'
import { isAvailable } from '../belief.js'

/**
 * A camp is up and its availability is still confirmed rather than merely likely.
 * Fires once per availability window, keyed on when that window opened.
 */
export const campAvailable: Cue = {
  id: 'camp-available',
  thresholds: ['freshSeconds'],
  evaluate(ctx, t) {
    const fresh = t.freshSeconds ?? 20
    for (const camp of ctx.camps) {
      if (camp.standing.kind !== 'Known' || !isAvailable(camp.standing)) continue
      if (camp.availableSince === undefined) continue
      if (ctx.now - camp.availableSince > fresh) continue
      return {
        key: `camp-available:${camp.id}:${Math.round(camp.availableSince)}`,
        basedOn: [camp.id],
        subject: camp.id,
      }
    }
    return null
  },
}
