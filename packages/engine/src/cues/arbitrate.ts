import type { Confidence, Seconds, TimedEvent, Timeline } from '../types.js'
import { isClaimable } from '../belief.js'
import { describeTime } from '../confidence.js'
import { refireThresholdSeconds } from '../tuning.js'
import type {
  AdviceContext,
  Cue,
  CueMatch,
  CueState,
  CueText,
  FiredRecord,
  PriorityBand,
  Prompt,
  PromptSettings,
  VerbosityTier,
} from './types.js'

const bandOrder: Record<PriorityBand, number> = { critical: 0, high: 1, normal: 2, low: 3 }
const tierOrder: Record<VerbosityTier, number> = { essential: 0, standard: 1, verbose: 2 }

type Fact =
  | { readonly kind: 'event'; readonly event: TimedEvent }
  | { readonly kind: 'claim'; readonly confidence: Confidence }
  | { readonly kind: 'camp'; readonly claimable: boolean }

function resolveFact(timeline: Timeline, id: string): Fact | null {
  const event = timeline.events.find((e) => e.id === id)
  if (event !== undefined) return { kind: 'event', event }
  const camp = timeline.camps.find((c) => c.id === id)
  if (camp !== undefined) return { kind: 'camp', claimable: isClaimable(camp.standing) }
  if (id === timeline.deathTimer.id) return { kind: 'claim', confidence: timeline.deathTimer.confidence }
  if (id === timeline.level.id) return { kind: 'claim', confidence: timeline.level.confidence }
  return null
}

/**
 * A prompt may fire only if no fact it rests on is `Unknown` or fails `isClaimable`.
 * A cue cannot fabricate its own confidence, and a multi-fact cue resting on both a
 * camp state and an objective spawn is handled rather than flattened into a scalar
 * that cannot express it.
 */
function factsPermit(timeline: Timeline, basedOn: readonly string[]): boolean {
  for (const id of basedOn) {
    const fact = resolveFact(timeline, id)
    if (fact === null) return false
    switch (fact.kind) {
      case 'event':
        if (fact.event.confidence.kind === 'Unknown') return false
        break
      case 'claim':
        if (fact.confidence.kind === 'Unknown') return false
        break
      case 'camp':
        if (!fact.claimable) return false
        break
    }
  }
  return true
}

function snapshot(timeline: Timeline, basedOn: readonly string[]): Record<string, Seconds> {
  const out: Record<string, Seconds> = {}
  for (const id of basedOn) {
    const event = timeline.events.find((e) => e.id === id)
    if (event !== undefined) out[id] = event.at
  }
  return out
}

/**
 * Keys deliberately exclude time, so a cue that fired stays fired. But an anchor that
 * moves an event later would otherwise keep the cue silent through the corrected
 * moment, which is the opposite of helpful. Small corrections do not re-fire; real
 * ones do.
 *
 * The same pass drops fired entries whose facts have left the timeline: on
 * `ANCHOR_CLEARED` cycle indices shift and event ids shift with them, and without this
 * a cue either re-fires immediately or goes silent for the match.
 */
function pruneFired(
  fired: Readonly<Record<string, FiredRecord>>,
  timeline: Timeline,
): Record<string, FiredRecord> {
  const out: Record<string, FiredRecord> = {}
  for (const [key, record] of Object.entries(fired)) {
    let keep = true
    for (const [id, at] of Object.entries(record.basedOn)) {
      const event = timeline.events.find((e) => e.id === id)
      if (event === undefined) {
        keep = false
        break
      }
      if (Math.abs(event.at - at) > refireThresholdSeconds) {
        keep = false
        break
      }
    }
    if (keep) out[key] = record
  }
  return out
}

/**
 * `{time}` reads the confidence of the fact the prompt rests on; `{camp}` names the
 * subject.
 *
 * Applied to `display` as well as `spoken`, which the spoken-only version could not do.
 * A screen reading "Camp is up." beside a voice naming which camp is worse than either
 * alone: it invites the player to look, which is the cost the prompt exists to avoid.
 */
function renderText(template: string, match: CueMatch, ctx: AdviceContext): string {
  let out = template
  if (out.includes('{time}')) {
    const id = match.timeFrom ?? match.basedOn[0]
    const event = id === undefined ? undefined : ctx.timeline.events.find((e) => e.id === id)
    const phrase = event === undefined ? '' : describeTime(event.confidence, event.at, ctx.now)
    out = out.replace('{time}', phrase)
  }
  if (out.includes('{camp}')) {
    const camp = ctx.camps.find((c) => c.id === match.subject)
    out = out.replace('{camp}', camp?.label ?? '')
  }
  return out.replace(/\s{2,}/g, ' ').trim()
}

export interface Arbitration {
  /** The top prompt only. Two sentences over each other in a teamfight is worse than silence. */
  readonly speak: Prompt | null
  /** The top two, for display. */
  readonly active: readonly Prompt[]
  readonly state: CueState
}

/**
 * The only place that knows more than one cue exists.
 *
 * Ties break by band, then score, then cue id alphabetically, never by registry array
 * order, which would make speech depend on import order.
 */
export function evaluateCues(
  registry: readonly Cue[],
  text: Readonly<Record<string, CueText>>,
  settings: PromptSettings,
  ctx: AdviceContext,
  state: CueState,
): Arbitration {
  const fired = pruneFired(state.fired, ctx.timeline)
  const maxTier = tierOrder[settings.maxTier]

  const candidates: { cue: Cue; match: CueMatch; text: CueText }[] = []

  for (const cue of registry) {
    const cueText = text[cue.id]
    if (cueText === undefined) continue
    if (cue.appliesTo !== undefined && !cue.appliesTo.includes(ctx.map.id)) continue
    if (tierOrder[cueText.tier] > maxTier) continue

    const cooldown = cueText.cooldownSeconds
    const last = state.lastFiredByCue[cue.id]
    if (cooldown !== undefined && last !== undefined && ctx.now - last < cooldown) continue

    const match = cue.evaluate(ctx, cueText.thresholds, state.perCue[cue.id])
    if (match === null) continue
    if (fired[match.key] !== undefined) continue
    if (!factsPermit(ctx.timeline, match.basedOn)) continue

    candidates.push({ cue, match, text: cueText })
  }

  candidates.sort((a, b) => {
    const band = bandOrder[a.text.basePriority] - bandOrder[b.text.basePriority]
    if (band !== 0) return band
    const scoreA = a.match.score ?? a.text.priorityWithinBand
    const scoreB = b.match.score ?? b.text.priorityWithinBand
    if (scoreA !== scoreB) return scoreB - scoreA
    return a.cue.id.localeCompare(b.cue.id)
  })

  const active = candidates.slice(0, 2).map(({ cue, match, text: cueText }) => ({
    cueId: cue.id,
    key: match.key,
    display: renderText(cueText.display, match, ctx),
    spoken: renderText(cueText.spoken, match, ctx),
    band: cueText.basePriority,
  }))

  const nextFired: Record<string, FiredRecord> = { ...fired }
  const nextLast: Record<string, Seconds> = { ...state.lastFiredByCue }
  const nextPerCue: Record<string, unknown> = { ...state.perCue }

  for (const { cue, match } of candidates.slice(0, 2)) {
    nextFired[match.key] = { at: ctx.now, basedOn: snapshot(ctx.timeline, match.basedOn) }
    nextLast[cue.id] = ctx.now
    if (match.memory !== undefined) nextPerCue[cue.id] = match.memory
  }

  return {
    speak: settings.speechEnabled ? (active[0] ?? null) : null,
    active,
    state: { matchId: state.matchId, fired: nextFired, lastFiredByCue: nextLast, perCue: nextPerCue },
  }
}
