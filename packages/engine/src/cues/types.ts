import type { CampState, Seconds, TimedEvent, Timeline } from '../types.js'
import type { MapDefinition } from '../map-types.js'

/**
 * Every cue reads from one uniform object, built at most once a second. Cues never
 * project, never call each other, and never touch the anchor set directly.
 *
 * It deliberately does not carry settings. Verbosity governs which prompts are
 * spoken, not which facts exist; including it made the button set depend on speech
 * preferences once controls began sharing this context.
 */
export interface AdviceContext {
  readonly now: Seconds
  readonly map: MapDefinition
  readonly timeline: Timeline
  readonly nextObjective: TimedEvent | null
  /**
   * Not in the design note's `AdviceContext`, which left `wave-reminder` to search the
   * timeline itself and find a wave that had already spawned.
   */
  readonly nextWave: TimedEvent | null
  readonly camps: readonly CampState[]
  readonly tier: { readonly current: number; readonly next: TimedEvent | null }
  readonly deathTimer: Timeline['deathTimer']
  readonly level: Timeline['level']
}

export type PriorityBand = 'critical' | 'high' | 'normal' | 'low'
export type VerbosityTier = 'essential' | 'standard' | 'verbose'

/**
 * Conditions are code, because they genuinely are code. Everything tunable is not:
 * wording is what tuning exists to change, and it must not mean a rebuild.
 *
 * The interface lives in `engine` because `evaluateCues` is typed against it and the
 * dependency runs `maps -> engine`. The *data* lives in `packages/maps`.
 */
export interface CueText {
  readonly id: string
  /** May contain `{camp}`, substituted from the match's subject at render time. */
  readonly display: string
  /** May contain `{time}`, from the fact's confidence, and `{camp}`, from the subject. */
  readonly spoken: string
  readonly tier: VerbosityTier
  readonly basePriority: PriorityBand
  readonly priorityWithinBand: number
  readonly cooldownSeconds?: number
  readonly thresholds: Readonly<Record<string, number>>
}

export interface Prompt {
  readonly cueId: string
  readonly key: string
  readonly display: string
  readonly spoken: string
  readonly band: PriorityBand
}

export interface PromptSettings {
  readonly maxTier: VerbosityTier
  readonly speechEnabled: boolean
  readonly voiceId?: string
}

export interface CueMatch {
  /** Excludes time, so a cue that fired stays fired for that occurrence. */
  readonly key: string
  /** `TimedEvent` ids, camp ids, `deathTimer` or `level`. What the prompt rests on. */
  readonly basedOn: readonly string[]
  /** Which `basedOn` entry supplies `{time}`. Defaults to the first. */
  readonly timeFrom?: string
  /** Per-occurrence urgency override. Higher sorts first. Absent sorts as `priorityWithinBand`. */
  readonly score?: number
  readonly subject?: string
  /**
   * Written back to `CueState.perCue[cue.id]` when the match fires. The design note's
   * `evaluate(ctx, t)` had no access to `perCue`, so `stall-camp` could not implement
   * the rule the note gives it; memory in, memory out keeps the cue a pure function
   * while the state still travels with the caller.
   */
  readonly memory?: unknown
}

export interface Cue {
  readonly id: string
  readonly appliesTo?: readonly string[]
  /** Threshold keys this cue reads. Declared so CI can check them against `CueText`. */
  readonly thresholds: readonly string[]
  evaluate(
    ctx: AdviceContext,
    t: Readonly<Record<string, number>>,
    memory: unknown,
  ): CueMatch | null
}

export interface FiredRecord {
  readonly at: Seconds
  /** Each fact's `at` as it was at fire time. "Changed by more than X" needs the value. */
  readonly basedOn: Readonly<Record<string, Seconds>>
}

export interface CueState {
  /** Without it, keys from match one silence match two. */
  readonly matchId: string
  readonly fired: Readonly<Record<string, FiredRecord>>
  /** Cue id -> last fire of anything. This is what stops a cue chattering. */
  readonly lastFiredByCue: Readonly<Record<string, Seconds>>
  readonly perCue: Readonly<Record<string, unknown>>
}

export function newCueState(matchId: string): CueState {
  return { matchId, fired: {}, lastFiredByCue: {}, perCue: {} }
}
