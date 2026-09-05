import type { CampState, Confidence, Seconds, Timeline, TimedEvent } from './types.js'
import type { MapDefinition } from './map-types.js'
import { displayTime, mmss } from './confidence.js'
import { isClaimable, isAvailable } from './belief.js'
import { compareBearing } from './types.js'
import { applyPresentClamp } from './clamp.js'
import { currentTier } from './generators/tiers.js'
import { talentTiers } from './game-constants.js'

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

export interface RailCamp {
  readonly id: string
  readonly standingLabel: string
  /** Tappable while the camp is believed available: the tap writes `CampTaken`. */
  readonly tappable: boolean
  /** A `Stale` chip still shows, and offers both "taken" and "camp is up". */
  readonly stale: boolean
}

export interface RailSlot {
  readonly key: string
  readonly kind: 'objective' | 'wave' | 'camp' | 'tier' | 'empty'
  readonly label: string
  readonly text: string
  readonly tone: Tone
  readonly camp?: RailCamp
}

export interface TierCell {
  readonly level: number
  readonly state: 'reached' | 'next' | 'future'
  /** True when an anchor established this tier, rather than the curve estimating it. */
  readonly known: boolean
}

export interface LiveView {
  readonly clock: string
  readonly mapName: string
  readonly objective: ObjectiveSlot
  readonly rail: readonly RailSlot[]
  /**
   * Every camp, in rail order, including the ones that did not win a slot and the
   * `Stale` ones the rail's `isClaimable` filter excludes by construction. Without it a
   * typical map with five or six camps leaves three or four with no control anywhere,
   * and a boss is the common casualty: its long `staleSeconds` is exactly what makes it
   * lose to two siege camps on `pressureValue`.
   */
  readonly overflowCamps: readonly RailSlot[]
  readonly tiers: readonly TierCell[]
  readonly deathTimer: { readonly text: string; readonly tone: Tone }
  readonly level: { readonly text: string; readonly estimated: boolean; readonly tone: Tone }
  /** The clamped timeline, for controls and anything that needs the raw facts. */
  readonly timeline: Timeline
}

/**
 * The earliest emitted event of a kind that has not yet happened.
 *
 * `find` on the emitted list is not the same thing. Waves are emitted as a block and
 * the block stays valid until it ends — that is what keeps `validUntil` from forcing a
 * projection every thirty seconds — so the first entry in the block is routinely in the
 * past, and reading it renders a wave countdown frozen at 0:00.
 */
function nextOfKind(timeline: Timeline, kind: TimedEvent['kind'], now: Seconds): TimedEvent | undefined {
  return timeline.events.find((e) => e.kind === kind && e.at >= now)
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

function campSlot(camp: CampState, now: Seconds): RailSlot {
  const available = isAvailable(camp.standing)
  const stale = camp.standing.kind === 'Stale'
  const text = stale
    ? '?'
    : available
      ? 'UP'
      : camp.nextUp !== undefined
        ? displayTime(camp.nextUp.confidence, camp.nextUp.at, now)
        : camp.suppressed
          // Removed from the battlefield while the objective is live, rather than
          // taken. An em-dash here reads as missing data instead of as a fact.
          ? 'AWAY'
          : '—'
  const tone: Tone = stale || camp.suppressed
    ? // "AWAY" is not a number, and green here reads as "available" rather than as
      // "you can rely on this".
      'unknown'
    : camp.nextUp !== undefined
      ? toneOf(camp.nextUp.confidence)
      : camp.standing.kind === 'Known'
        ? 'exact'
        : 'estimated'
  return {
    key: `camp:${camp.id}`,
    kind: 'camp',
    label: camp.label,
    text,
    tone,
    camp: {
      id: camp.id,
      standingLabel: stale ? 'camp?' : available ? 'up' : 'down',
      tappable: available,
      stale,
    },
  }
}

/**
 * Fixed rather than emergent, because the rail serves two purposes over four slots.
 * Without a stated rule, a map with four camps up shows no upcoming events at all.
 *
 * Slot 1 is the objective column. The dominant countdown already carries the pending
 * cycle, so the rail shows the one after it: that is what "plan two events ahead"
 * needs, and printing the same number twice is not information.
 */
function buildRail(timeline: Timeline, now: Seconds, objective: ObjectiveSlot): RailSlot[] {
  const slots: (RailSlot | null)[] = [null, null, null, null]

  const spawns = objectiveSpawns(timeline)
  // While a phase is live the dominant slot shows that, so slot 1 carries the pending
  // spawn rather than the one after it.
  const following = objective.kind === 'live' ? spawns[0] : spawns[1]
  if (
    (objective.kind === 'countdown' || objective.kind === 'live') &&
    following !== undefined &&
    following.confidence.kind !== 'Unknown'
  ) {
    slots[0] = {
      key: following.id,
      kind: 'objective',
      label: `next ${following.label.toLowerCase()}`,
      text: displayTime(following.confidence, following.at, now),
      tone: toneOf(following.confidence),
    }
  }

  const wave = nextOfKind(timeline, 'wave', now)
  if (wave !== undefined) {
    slots[1] = {
      key: wave.id,
      kind: 'wave',
      label: 'wave',
      text: displayTime(wave.confidence, wave.at, now),
      tone: toneOf(wave.confidence),
    }
  }

  // Selection is by pressure, as the design specifies. Layout is by bearing, so the
  // westerly of the two chosen camps sits on the left and the rail reads like the map.
  const chosen = timeline.camps
    .filter((c) => isClaimable(c.standing))
    .sort((a, b) => b.pressureValue - a.pressureValue || a.id.localeCompare(b.id))
    .slice(0, 2)
    .sort((a, b) => compareBearing(a.bearing, b.bearing) || a.id.localeCompare(b.id))
  slots[2] = chosen[0] !== undefined ? campSlot(chosen[0], now) : null
  slots[3] = chosen[1] !== undefined ? campSlot(chosen[1], now) : null

  // Fill whatever did not qualify with the next tiers, then with further waves.
  const fallbacks: RailSlot[] = [
    ...timeline.events
      .filter((e) => e.kind === 'tier' && e.at >= now)
      .map((e) => ({
        key: e.id,
        kind: 'tier' as const,
        label: e.label.toLowerCase(),
        text: displayTime(e.confidence, e.at, now),
        tone: toneOf(e.confidence),
      })),
    ...timeline.events
      .filter((e) => e.kind === 'wave' && e.at >= now)
      .slice(1)
      .map((e) => ({
        key: e.id,
        kind: 'wave' as const,
        label: 'wave',
        text: displayTime(e.confidence, e.at, now),
        tone: toneOf(e.confidence),
      })),
  ]

  let f = 0
  return slots.map((slot) => {
    if (slot !== null) return slot
    const fallback = fallbacks[f]
    f += 1
    return fallback ?? { key: `empty:${f}`, kind: 'empty' as const, label: '', text: '—', tone: 'unknown' as const }
  })
}

/**
 * Arithmetic and formatting only. Safe to call every frame; it never projects.
 */
export function view(timeline: Timeline, map: MapDefinition, now: Seconds): LiveView {
  const clamped = applyPresentClamp(timeline, now)
  const objective = objectiveSlot(map, clamped, now)
  const tier = currentTier(clamped.level.estimate)
  const nextTier = talentTiers.find((t) => t > tier)

  return {
    clock: mmss(now),
    mapName: map.name,
    objective,
    rail: buildRail(clamped, now, objective),
    // The overflow list is a map of the battleground, so it reads west to east.
    overflowCamps: [...clamped.camps]
      .sort((a, b) => compareBearing(a.bearing, b.bearing) || a.id.localeCompare(b.id))
      .map((c) => campSlot(c, now)),
    tiers: talentTiers.map((level) => ({
      level,
      state: level <= tier ? 'reached' : level === nextTier ? 'next' : 'future',
      known: clamped.level.confidence.kind === 'Exact' && level === tier,
    })),
    deathTimer: { text: mmss(clamped.deathTimer.seconds), tone: toneOf(clamped.deathTimer.confidence) },
    level: {
      // No tilde. At this size it reads as a minus sign, and the colour and the label
      // already carry whether it is an estimate.
      text: String(clamped.level.estimate),
      estimated: clamped.level.confidence.kind !== 'Exact',
      tone: toneOf(clamped.level.confidence),
    },
    timeline: clamped,
  }
}
