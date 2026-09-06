import type { CampState, Confidence, Seconds, Timeline, TimedEvent } from './types.js'
import type { MapDefinition } from './map-types.js'
import { displayTime, mmss } from './confidence.js'
import { isAvailable } from './belief.js'
import { compareBearing } from './types.js'
import { applyPresentClamp } from './clamp.js'

export type Tone = 'exact' | 'estimated' | 'unknown'

export function toneOf(c: Confidence): Tone {
  switch (c.kind) {
    case 'Exact':
      return 'exact'
    case 'Estimated':
      return 'estimated'
    case 'Unknown':
      return 'unknown'
  }
}

export function confidenceLabel(c: Confidence): string {
  switch (c.kind) {
    case 'Exact':
      return 'Exact'
    case 'Estimated':
      return 'Estimated'
    case 'Unknown':
      return 'Unknown'
  }
}

export interface Countdown {
  readonly label: string
  readonly text: string
  readonly tone: Tone
  readonly confidenceLabel: string
  /** Remaining seconds to `at`, or null when unknown. Drives urgency, never wording. */
  readonly remaining: Seconds | null
}

/**
 * Empty states are defined rather than left to render blank. A blank countdown reads
 * as a bug, and the three reasons a countdown is absent are different facts.
 */
export type ObjectiveSlot =
  | { readonly kind: 'countdown'; readonly countdown: Countdown; readonly cycle: number; readonly instances?: string }
  /**
   * The phase is believed to be running. The countdown to the *next* spawn is still
   * available on the rail; showing it here instead would count down to the objective
   * after the one being fought, at the moment the app exists for.
   */
  | {
      readonly kind: 'live'
      readonly label: string
      readonly cycle: number
      readonly tone: Tone
      readonly confidenceLabel: string
      readonly endsText: string
      readonly instances?: string
    }
  | { readonly kind: 'noObjective'; readonly message: string }
  | { readonly kind: 'timingLost'; readonly message: string }
  | { readonly kind: 'unknownMap'; readonly message: string }

/**
 * Every camp, always visible, each carrying the taps that make sense for what it is.
 *
 * The camps used to be two rail slots plus a list behind the overflow menu. That put the
 * control one tap away from a player mid-match who is not looking at the phone, which
 * means de facto never — the same friction that makes the objective tap expensive,
 * applied to the input that happens most often.
 */
export type CampChipState = 'up' | 'down' | 'away' | 'unconfirmed'

export interface CampChip {
  readonly id: string
  readonly label: string
  /** `UP`, a respawn countdown, `AWAY` during an objective phase, or `?`. */
  readonly text: string
  readonly tone: Tone
  readonly state: CampChipState
  /** The app believes it is there, or does not know, so "we took it" means something. */
  readonly offerTaken: boolean
  /** The app believes it is not there, so offer the correction. */
  readonly offerUp: boolean
}

/** The objective cycle after the dominant countdown, for planning two events ahead. */
export interface FollowingObjective {
  readonly label: string
  readonly text: string
  readonly tone: Tone
}

export interface LiveView {
  readonly clock: string
  readonly mapName: string
  readonly objective: ObjectiveSlot
  /** Every camp on the battleground, west to east. */
  readonly camps: readonly CampChip[]
  /** How long you would be dead. Not shown in game until you already are. */
  readonly deathTimer: { readonly text: string; readonly tone: Tone }
  /** The objective after the one being counted down. */
  readonly following: FollowingObjective | null
  /** The clamped timeline, for controls and anything that needs the raw facts. */
  readonly timeline: Timeline
}

function objectiveSpawns(timeline: Timeline): TimedEvent[] {
  return timeline.events
    .filter((e) => e.kind === 'objective' && e.role === 'spawn')
    .sort((a, b) => (a.cycle ?? 0) - (b.cycle ?? 0))
}

function countdownFor(event: TimedEvent, now: Seconds, label: string): Countdown {
  return {
    label,
    text: displayTime(event.confidence, event.at, now),
    tone: toneOf(event.confidence),
    confidenceLabel: confidenceLabel(event.confidence),
    remaining: event.confidence.kind === 'Unknown' ? null : Math.round(event.at - now),
  }
}

function objectiveSlot(map: MapDefinition, timeline: Timeline, now: Seconds): ObjectiveSlot {
  if (map.objective.kind === 'none') {
    return { kind: 'noObjective', message: 'No objective timer on this battleground' }
  }
  const spawns = objectiveSpawns(timeline)
  if (spawns.length === 0) {
    return { kind: 'unknownMap', message: 'No timings for this battleground' }
  }

  const phase = timeline.objectivePhase
  if (phase.kind === 'active') {
    return {
      kind: 'live',
      label: map.objective.label,
      cycle: phase.cycle,
      tone: toneOf(phase.confidence),
      confidenceLabel: confidenceLabel(phase.confidence),
      // How much longer the phase could plausibly run. The far end of the resolution
      // band is the honest answer: the near end is "any moment now".
      endsText: mmss(Math.max(0, phase.until - now)),
      ...(map.objective.instances !== undefined ? { instances: map.objective.instances } : {}),
    }
  }

  const next = spawns[0]!
  if (timeline.objectiveTimingLost || next.confidence.kind === 'Unknown') {
    // Shown deliberately rather than silently. A blank countdown reads as a bug.
    return { kind: 'timingLost', message: 'Objective timing lost — tap when it ends' }
  }
  return {
    kind: 'countdown',
    countdown: countdownFor(next, now, map.objective.label),
    cycle: next.cycle ?? 1,
    ...(map.objective.instances !== undefined ? { instances: map.objective.instances } : {}),
  }
}

function campChip(camp: CampState, now: Seconds): CampChip {
  const available = isAvailable(camp.standing)
  const stale = camp.standing.kind === 'Stale'
  const state: CampChipState = available
    ? 'up'
    : stale
      ? 'unconfirmed'
      : camp.suppressed
        ? 'away'
        : 'down'

  const text =
    state === 'up'
      ? 'UP'
      : state === 'unconfirmed'
        ? '?'
        : state === 'away'
          // Removed from the battlefield while the objective is live, rather than taken.
          ? 'AWAY'
          : camp.nextUp !== undefined
            ? displayTime(camp.nextUp.confidence, camp.nextUp.at, now)
            : '—'

  const tone: Tone =
    state === 'up'
      ? 'exact'
      : state === 'unconfirmed' || state === 'away'
        ? // Neither is a number, and green would read as "available".
          'unknown'
        : camp.nextUp !== undefined
          ? toneOf(camp.nextUp.confidence)
          : 'estimated'

  return {
    id: camp.id,
    label: camp.label,
    text,
    tone,
    state,
    // "We took it" is meaningful when the camp is believed there, and when the app has
    // stopped believing anything — which is exactly when the correction is needed.
    offerTaken: state === 'up' || state === 'unconfirmed',
    // Offer the correction whenever the app thinks it is not there and could be wrong.
    offerUp: state !== 'up',
  }
}

/**
 * Arithmetic and formatting only. Safe to call every frame; it never projects.
 */
export function view(timeline: Timeline, map: MapDefinition, now: Seconds): LiveView {
  const clamped = applyPresentClamp(timeline, now)
  const objective = objectiveSlot(map, clamped, now)

  // While a phase is live the dominant slot shows that, so the pending spawn is what
  // comes next; otherwise it is the cycle after the one being counted down.
  const spawns = objectiveSpawns(clamped)
  const following = objective.kind === 'live' ? spawns[0] : spawns[1]

  return {
    clock: mmss(now),
    mapName: map.name,
    objective,
    // A map of the battleground, so it reads west to east. On a map with no data the
    // chips would be controls writing anchors read back through respawn figures the
    // provenance clamp has already declared worthless, so there are none.
    camps:
      clamped.provenance === 'unknown'
        ? []
        : [...clamped.camps]
            .sort((a, b) => compareBearing(a.bearing, b.bearing) || a.id.localeCompare(b.id))
            .map((c) => campChip(c, now)),
    deathTimer: { text: mmss(clamped.deathTimer.seconds), tone: toneOf(clamped.deathTimer.confidence) },
    following:
      following === undefined || following.confidence.kind === 'Unknown'
        ? null
        : {
            label: `next ${following.label.toLowerCase()}`,
            text: displayTime(following.confidence, following.at, now),
            tone: toneOf(following.confidence),
          },
    timeline: clamped,
  }
}
