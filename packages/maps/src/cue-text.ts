import type { CueText } from '@nexiliary/engine'

/**
 * Data, no logic. Wording, priority and thresholds live here so tuning a sentence is a
 * value edit rather than an engine rebuild, and so a post-match review could later
 * promote the prompts a given player keeps failing by changing `basePriority`.
 *
 * Every prompt is phrased as a condition the player evaluates, never as an assertion
 * about the world. The app cannot see health, mana, positions or who is alive, so it
 * says what to check rather than what is true. `{time}` is substituted from the fact's
 * own confidence at render time, so no prompt can speak an estimated event as though
 * it were exact.
 *
 * `priorityWithinBand` sorts higher-first. Verbosity defaults are in `spec.md`:
 * objectives and level 10 on, waves off.
 */
export const cueText: Record<string, CueText> = {
  'objective-prep': {
    id: 'objective-prep',
    display: 'Objective coming. Reset now if you are not full.',
    spoken: 'Objective {time}. Reset if you are not full.',
    tier: 'essential',
    basePriority: 'high',
    priorityWithinBand: 50,
    cooldownSeconds: 60,
    // The thirty to forty-five seconds before a spawn is where preparation happens.
    thresholds: { warnSeconds: 40 },
  },

  'stall-camp': {
    id: 'stall-camp',
    display: 'Start a camp now and it lands during the objective.',
    spoken: 'Start a camp now and it lands on the objective. Objective {time}.',
    tier: 'essential',
    basePriority: 'high',
    // Outranks objective-prep: the stall window is narrow and passes, whereas
    // "reset if you are not full" stays true for the whole approach.
    priorityWithinBand: 60,
    cooldownSeconds: 90,
    thresholds: { windowSeconds: 12 },
  },

  'camp-available': {
    id: 'camp-available',
    display: 'Camp is up.',
    spoken: 'Camp is up.',
    tier: 'standard',
    basePriority: 'normal',
    priorityWithinBand: 40,
    // Camps come back often. Without this the same sentence arrives every few minutes.
    cooldownSeconds: 120,
    thresholds: { freshSeconds: 15 },
  },

  'tier-spike': {
    id: 'tier-spike',
    display: 'Talent tier close. Avoid an even fight if they get there first.',
    spoken: 'Talent tier {time}. Avoid an even fight if they hit it first.',
    tier: 'essential',
    basePriority: 'high',
    priorityWithinBand: 45,
    cooldownSeconds: 120,
    thresholds: { warnSeconds: 40 },
  },

  'wave-reminder': {
    id: 'wave-reminder',
    display: 'Wave about to spawn. Soak it if nobody is there.',
    spoken: 'Wave {time}.',
    // Off by default. A voice that talks every thirty seconds gets muted within two
    // games, and missing waves is still the most common macro failure below high ranks,
    // so it is worth having available rather than absent.
    tier: 'verbose',
    basePriority: 'low',
    priorityWithinBand: 10,
    thresholds: { warnSeconds: 8 },
  },

  'death-timer-warning': {
    id: 'death-timer-warning',
    display: 'Dying is expensive now. Do not trade a death for a camp.',
    spoken: 'Death timers are long now. Do not trade a death for a camp.',
    tier: 'standard',
    basePriority: 'normal',
    priorityWithinBand: 20,
    // It crosses once and stays crossed, so this fires about twice a match.
    cooldownSeconds: 300,
    // Level 15 is where the curve steepens and a death starts costing a full objective.
    thresholds: { costlySeconds: 40 },
  },
}
