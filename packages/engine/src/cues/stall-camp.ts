import type { Cue } from './types.js'
import { bestStallCamp, campDefinition, startCaptureAt } from './predicates.js'

interface StallMemory {
  readonly cycle: number
  readonly campId: string
}

/**
 * The skill in camps is not taking them, it is stalling them so mercenaries arrive
 * during the objective fight and the enemy cannot answer both.
 *
 * Rests on two facts of different kinds: a camp's `Belief` and an objective's
 * `Confidence`. That is why `basedOn` is a list rather than a scalar confidence, and
 * why `isAvailable` rather than a belief-strength comparison chooses the camp:
 * `Known(false)` is the strongest belief in the lattice and would otherwise win.
 */
export const stallCamp: Cue = {
  id: 'stall-camp',
  thresholds: ['windowSeconds'],
  evaluate(ctx, t, memory) {
    const spawn = ctx.nextObjective
    if (spawn === null) return null
    const camp = bestStallCamp(ctx)
    if (camp === null) return null
    const definition = campDefinition(ctx.map, camp.id)
    if (definition === undefined) return null

    const cycle = spawn.cycle ?? 1
    const start = startCaptureAt(definition, spawn.at, cycle)
    const window = t.windowSeconds ?? 15
    if (ctx.now < start - window || ctx.now > start + window) return null

    // Not on consecutive cycles unless the chosen camp differs, or the same sentence
    // arrives every cycle of every match.
    const last = memory as StallMemory | undefined
    if (last !== undefined && last.campId === camp.id && last.cycle === cycle - 1) return null

    return {
      key: `stall-camp:${camp.id}:cycle-${cycle}`,
      basedOn: [camp.id, spawn.id],
      timeFrom: spawn.id,
      subject: camp.id,
      memory: { cycle, campId: camp.id } satisfies StallMemory,
    }
  },
}
