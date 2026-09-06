import type { AdviceContext } from '@nexiliary/engine'
import { isAvailable, isClaimable } from '@nexiliary/engine'

/**
 * Controls live in `web`, not in `engine`. `AnchorControl` carries labels and layout
 * placements, and a desktop companion driven by global hotkeys has no use for
 * `placement: 'rail'`. `AdviceContext` is the shared interface, exported by `engine`
 * and consumed by both.
 *
 * Anchors are read by key, never through a central switch, so widening `AnchorType`
 * touches the union and nothing else, and an anchor nobody reads is inert.
 */
export type Placement = 'primary' | 'rail' | 'header' | 'overflow'

export type ControlAction =
  /** Write the control's anchor for `subject`. */
  | { readonly kind: 'write'; readonly anchorType: string }
  /** Undo of a first write: remove the entry. */
  | { readonly kind: 'clear' }
  | { readonly kind: 'restore' }
  | { readonly kind: 'endMatch' }
  | { readonly kind: 'adjustClock' }
  | { readonly kind: 'openOverflow' }

export interface ControlOffer {
  readonly key: string
  readonly label: string
  /** Camp id, cycle index, whatever the anchor needs. */
  readonly subject?: string
  readonly emphasis?: 'normal' | 'urgent'
  readonly action: ControlAction
  /**
   * The "camp is up" affordance on a stale chip. The design note types this as
   * `'clear' | 'restore'`, which are undo verbs; a `CampUp` anchor is a write, so the
   * action union carries the write rather than being forced through a restore.
   */
  readonly secondary?: { readonly label: string; readonly action: ControlAction }
}

export interface AnchorControl {
  readonly id: string
  readonly placement: Placement
  readonly appliesTo?: readonly string[]
  /**
   * Every offer this control makes now, which is usually zero or one. The camp chip
   * makes one per camp, and a single-offer signature could not express that while the
   * design note also makes the rail entries themselves the camp buttons.
   */
  offer(ctx: AdviceContext): ControlOffer[]
}

const objectiveEnded: AnchorControl = {
  id: 'objective-ended',
  placement: 'primary',
  offer(ctx) {
    // Returning nothing on a map with no timed objective. Offering it there would
    // write an anchor no generator reads.
    if (ctx.map.objective.kind !== 'timed') return []
    const phase = ctx.timeline.objectivePhase

    // Offered only when there is an end to report. `idle` covers both the case one
    // second into a match, before any objective has existed, and the moment after the
    // tap lands — so the control cannot record an objective that never ran, and cannot
    // record the same one twice.
    if (phase.kind === 'idle') return []

    return [
      {
        key: 'objective-ended',
        // Names the event the respawn actually runs from, which on most maps is the
        // second of two stages. A generic "<objective> ended" invites the tap at the
        // first and anchors the whole chain a minute or more early.
        label: ctx.map.objective.endedLabel,
        subject: String(ctx.nextObjective?.cycle ?? 1),
        // Urgent while it is actually running. Reading the *next* spawn's band instead
        // gets this backwards: by the time a phase is live the chain has advanced past
        // it, so the next spawn is minutes away and the button would sit quiet through
        // the whole objective.
        emphasis: phase.kind === 'active' ? 'urgent' : 'normal',
        action: { kind: 'write', anchorType: 'ObjectiveEnded' },
      },
    ]
  },
}

/**
 * Optional, and the only control that records a spawn rather than a resolution. It is
 * what separates the fight duration from the respawn offset — two taps a cycle instead
 * of one gives a map the measurements it needs before it can be marked `verified`.
 *
 * Offered only while the objective is plausibly appearing: from the near end of the
 * predicted band until the phase is reported live or ended. Offering it earlier would
 * invite recording a spawn that has not happened, which is the same fault as the
 * "objective ended" button being pressable one second into a match.
 */
const objectiveSpawned: AnchorControl = {
  id: 'objective-spawned',
  placement: 'primary',
  offer(ctx) {
    if (ctx.map.objective.kind !== 'timed') return []
    // Once a phase is live or unreported the spawn has been observed or missed, and the
    // useful tap is the other one.
    if (ctx.timeline.objectivePhase.kind !== 'idle') return []

    const spawn = ctx.nextObjective
    if (spawn === null || spawn.confidence.kind === 'Unknown') return []
    const earliest = spawn.confidence.kind === 'Estimated' ? spawn.confidence.low : spawn.at
    if (ctx.now < earliest) return []

    return [
      {
        key: 'objective-spawned',
        label: `${ctx.map.objective.label} up`,
        subject: String(spawn.cycle ?? 1),
        emphasis: 'normal',
        action: { kind: 'write', anchorType: 'ObjectiveSpawned' },
      },
    ]
  },
}

const campChips: AnchorControl = {
  id: 'camp',
  placement: 'rail',
  offer(ctx) {
    return ctx.camps
      .filter((camp) => isAvailable(camp.standing) || !isClaimable(camp.standing))
      .map((camp) => ({
        key: `camp:${camp.id}`,
        // A Stale camp still shows a chip. An earlier version made Stale mean no chip,
        // which deadlocked camp coaching for the rest of the match after one missed
        // tap, in exactly the solo case that is most likely.
        label: isAvailable(camp.standing) ? camp.label : 'camp?',
        subject: camp.id,
        action: { kind: 'write', anchorType: 'CampTaken' } as const,
        ...(isClaimable(camp.standing)
          ? {}
          : { secondary: { label: 'camp is up', action: { kind: 'write', anchorType: 'CampUp' } as const } }),
      }))
  },
}

const clockAdjust: AnchorControl = {
  id: 'clock-adjust',
  placement: 'header',
  offer: () => [{ key: 'clock-adjust', label: 'Adjust clock', action: { kind: 'adjustClock' } }],
}

const overflow: AnchorControl = {
  id: 'overflow',
  placement: 'header',
  offer: () => [{ key: 'overflow', label: 'More', action: { kind: 'openOverflow' } }],
}

const endMatch: AnchorControl = {
  id: 'end-match',
  placement: 'overflow',
  offer: () => [{ key: 'end-match', label: 'End match', action: { kind: 'endMatch' } }],
}

export const controls: readonly AnchorControl[] = [
  objectiveEnded,
  objectiveSpawned,
  campChips,
  clockAdjust,
  overflow,
  endMatch,
]

export function offersFor(placement: Placement, ctx: AdviceContext): ControlOffer[] {
  return controls
    .filter((c) => c.placement === placement)
    .filter((c) => c.appliesTo === undefined || c.appliesTo.includes(ctx.map.id))
    .flatMap((c) => c.offer(ctx))
}
