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
    const cycle = ctx.nextObjective?.cycle ?? 1
    // Urgent while the phase is believed to be running, which is when the tap is
    // wanted. Reading the *next* spawn's band instead gets this backwards: by the time
    // a phase is live the chain has already advanced past it, so the next spawn is
    // minutes away and the button would sit quiet through the whole objective.
    const running = ctx.timeline.objectivePhase.kind === 'active'
    return [
      {
        key: 'objective-ended',
        label: `${ctx.map.objective.label} ended`,
        subject: String(cycle),
        emphasis: running ? 'urgent' : 'normal',
        action: { kind: 'write', anchorType: 'ObjectiveEnded' },
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

export const controls: readonly AnchorControl[] = [objectiveEnded, campChips, clockAdjust, overflow, endMatch]

export function offersFor(placement: Placement, ctx: AdviceContext): ControlOffer[] {
  return controls
    .filter((c) => c.placement === placement)
    .filter((c) => c.appliesTo === undefined || c.appliesTo.includes(ctx.map.id))
    .flatMap((c) => c.offer(ctx))
}
