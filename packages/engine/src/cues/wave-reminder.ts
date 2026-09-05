import type { Cue } from './types.js'
import { isWithin } from './predicates.js'

/**
 * Off by default. A voice that talks every 30 seconds gets muted within two games,
 * which is what the verbosity tiers exist to prevent.
 */
export const waveReminder: Cue = {
  id: 'wave-reminder',
  thresholds: ['warnSeconds'],
  evaluate(ctx, t) {
    const wave = ctx.timeline.events.find((e) => e.kind === 'wave')
    if (wave === undefined) return null
    if (!isWithin(ctx, wave, t.warnSeconds ?? 10)) return null
    return { key: wave.id, basedOn: [wave.id] }
  },
}
