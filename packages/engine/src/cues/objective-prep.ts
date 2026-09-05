import type { Cue } from './types.js'
import { isWithin } from './predicates.js'

/**
 * Phrased as a condition the player evaluates, never as an assertion about the world.
 * The app cannot see health, mana or position, so it says what to check, not what is.
 */
export const objectivePrep: Cue = {
  id: 'objective-prep',
  thresholds: ['warnSeconds'],
  evaluate(ctx, t) {
    const spawn = ctx.nextObjective
    if (spawn === null) return null
    if (!isWithin(ctx, spawn, t.warnSeconds ?? 45)) return null
    return { key: `objective-prep:cycle-${spawn.cycle ?? 1}`, basedOn: [spawn.id] }
  },
}
