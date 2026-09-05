import type { Cue } from './types.js'
import { objectivePrep } from './objective-prep.js'
import { stallCamp } from './stall-camp.js'
import { campAvailable } from './camp-available.js'
import { tierSpike } from './tier-spike.js'
import { waveReminder } from './wave-reminder.js'
import { deathTimerWarning } from './death-timer-warning.js'

/**
 * The registry: an array, one import per cue. Deliberately not a plugin system — no
 * dynamic registration, no manifest, no condition DSL. Adding a cue is a new file, one
 * import line and a `CueText` entry.
 *
 * Arbitration never depends on this array's order.
 */
export const cues: readonly Cue[] = [
  objectivePrep,
  stallCamp,
  campAvailable,
  tierSpike,
  waveReminder,
  deathTimerWarning,
]

export { objectivePrep, stallCamp, campAvailable, tierSpike, waveReminder, deathTimerWarning }
