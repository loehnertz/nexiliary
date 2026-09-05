import type { Cue } from './types.js'

/**
 * The death timer *length* needs no input, which is why it survived when the punish
 * window tracker did not. It carries the level estimate's confidence, so the
 * arbitration filter can silence it near a breakpoint the app cannot resolve.
 */
export const deathTimerWarning: Cue = {
  id: 'death-timer-warning',
  thresholds: ['costlySeconds'],
  evaluate(ctx, t) {
    const costly = t.costlySeconds ?? 30
    if (ctx.deathTimer.seconds < costly) return null
    return {
      key: `death-timer-warning:${ctx.deathTimer.seconds}`,
      basedOn: [ctx.deathTimer.id],
    }
  },
}
