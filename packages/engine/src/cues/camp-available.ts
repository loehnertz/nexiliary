import type { Cue } from './types.js'
import type { CampState } from '../types.js'
import { isAvailable } from '../belief.js'

/**
 * A camp is up and its availability is still confirmed rather than merely likely.
 * Fires once per availability window, keyed on when that window opened.
 *
 * Several camps can come up in the same tick, so which one is worth interrupting a fight
 * for is a question about the camp rather than about the order it happens to sit in the
 * map file. `pressureValue` answers it: a boss (9) outranks a bruiser (7) outranks a
 * siege camp (6), and mistiming a boss is the expensive case.
 */
export const campAvailable: Cue = {
  id: 'camp-available',
  thresholds: ['freshSeconds'],
  evaluate(ctx, t) {
    const fresh = t.freshSeconds ?? 20
    let best: CampState | null = null
    for (const camp of ctx.camps) {
      if (camp.standing.kind !== 'Known' || !isAvailable(camp.standing)) continue
      if (camp.availableSince === undefined) continue
      if (ctx.now - camp.availableSince > fresh) continue
      if (best === null || camp.pressureValue > best.pressureValue) best = camp
    }
    if (best === null || best.availableSince === undefined) return null
    return {
      key: `camp-available:${best.id}:${Math.round(best.availableSince)}`,
      basedOn: [best.id],
      subject: best.id,
      score: best.pressureValue,
    }
  },
}
