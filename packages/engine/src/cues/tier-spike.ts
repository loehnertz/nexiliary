import type { Cue } from './types.js'
import { isWithin } from './predicates.js'

/** A talent tier advantage matters far more than a level advantage. 10, 16 and 20. */
const spikeTiers = new Set([10, 16, 20])

export const tierSpike: Cue = {
  id: 'tier-spike',
  thresholds: ['warnSeconds'],
  evaluate(ctx, t) {
    const next = ctx.tier.next
    if (next === null) return null
    const level = Number(next.id.split(':')[1] ?? '0')
    if (!spikeTiers.has(level)) return null
    if (!isWithin(ctx, next, t.warnSeconds ?? 45)) return null
    return { key: `tier-spike:${level}`, basedOn: [next.id] }
  },
}
