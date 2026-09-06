import type { Cue } from './types.js'
import { campDefinition, rankedStallCamps, startCaptureAt } from './predicates.js'

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
    const ranked = rankedStallCamps(ctx)
    const best = ranked[0]
    if (best === undefined) return null

    const cycle = spawn.cycle ?? 1
    const last = memory as StallMemory | undefined

    // Not the same camp two cycles running — but by naming the next one down, not by
    // going quiet. Going quiet was the previous rule, and on a map where one camp is
    // simply the best every cycle it silenced the prompt on every other objective:
    // observed firing on cycles 1, 3 and 5 and never on 2 or 4. Half the cycles is a
    // steep price for avoiding a repetition, and this is one of the few prompts that
    // names a decision the player cannot time in their head.
    const repeat = last !== undefined && last.cycle === cycle - 1 && last.campId === best.id
    const camp = repeat ? (ranked[1] ?? best) : best

    const definition = campDefinition(ctx.map, camp.id)
    if (definition === undefined) return null
    const start = startCaptureAt(definition, spawn.at, cycle)
    const window = t.windowSeconds ?? 15
    if (ctx.now < start - window || ctx.now > start + window) return null

    return {
      key: `stall-camp:${camp.id}:cycle-${cycle}`,
      basedOn: [camp.id, spawn.id],
      timeFrom: spawn.id,
      subject: camp.id,
      memory: { cycle, campId: camp.id } satisfies StallMemory,
    }
  },
}
