import { describe, expect, it } from 'vitest'
import {
  buildContext,
  cues,
  evaluateCues,
  isAvailable,
  newCueState,
  project,
  refireThresholdSeconds,
  stallCamp,
  waveReminder,
} from '../src/index.js'
import type { AdviceContext, CueState, PromptSettings, Timeline } from '../src/index.js'
import { anchor, anchorSet, braxis, dragon, tomb } from './fixtures.js'
import { cueText } from './cue-text.fixture.js'

const verbose: PromptSettings = { maxTier: 'verbose', speechEnabled: true }
const essential: PromptSettings = { maxTier: 'essential', speechEnabled: true }

function ctxAt(map = braxis, anchors = anchorSet(), now = 60): AdviceContext {
  return buildContext(map, project(map, anchors, now), now)
}

function run(ctx: AdviceContext, state: CueState, settings = verbose) {
  return evaluateCues(cues, cueText, settings, ctx, state)
}

describe('arbitration', () => {
  it('speaks only the highest prompt', () => {
    // Two sentences over each other in a teamfight is worse than silence, and that is
    // enforced once here rather than negotiated between cues.
    const ctx = ctxAt(braxis, anchorSet(), 60)
    const result = run(ctx, newCueState('m1'))
    expect(result.active.length).toBeLessThanOrEqual(2)
    if (result.speak !== null) expect(result.speak).toEqual(result.active[0])
  })

  it('orders independently of registry array order', () => {
    const ctx = ctxAt(braxis, anchorSet(), 60)
    const forwards = evaluateCues(cues, cueText, verbose, ctx, newCueState('m1'))
    const backwards = evaluateCues([...cues].reverse(), cueText, verbose, ctx, newCueState('m1'))
    expect(backwards.active.map((p) => p.cueId)).toEqual(forwards.active.map((p) => p.cueId))
  })

  it('drops cues above the configured verbosity tier', () => {
    const ctx = ctxAt(tomb, anchorSet(), 25)
    expect(run(ctx, newCueState('m1'), verbose).active.some((p) => p.cueId === 'wave-reminder')).toBe(true)
    expect(run(ctx, newCueState('m1'), essential).active.some((p) => p.cueId === 'wave-reminder')).toBe(false)
  })

  it('fires a key once per occurrence', () => {
    const ctx = ctxAt(tomb, anchorSet(), 25)
    const first = run(ctx, newCueState('m1'))
    expect(first.active.some((p) => p.cueId === 'wave-reminder')).toBe(true)
    const second = run(ctx, first.state)
    expect(second.active.some((p) => p.cueId === 'wave-reminder')).toBe(false)
  })

  it('holds a cue inside its cooldown even across different occurrences', () => {
    // `fired` keyed by CueMatch.key gives once-per-occurrence; `lastFiredByCue` gives
    // the cooldown. Both are needed; either alone is wrong.
    const anchors = anchorSet(anchor('CampTaken', 'siege-top:1', 100))
    const at = (now: number) => ctxAt(tomb, anchors, now)
    const first = run(at(285), newCueState('m1'))
    expect(first.active.some((p) => p.cueId === 'camp-available')).toBe(true)
    // A different occurrence would be a different key, but the cooldown still holds.
    const later = run(at(300), first.state)
    expect(later.active.some((p) => p.cueId === 'camp-available')).toBe(false)
  })

  it('is scoped to a matchId, so the second game of the evening is not silent', () => {
    const ctx = ctxAt(tomb, anchorSet(), 25)
    const first = run(ctx, newCueState('m1'))
    expect(first.active.length).toBeGreaterThan(0)
    // A fresh state for the new match, exactly as MATCH_STARTED creates.
    const secondMatch = run(ctx, newCueState('m2'))
    expect(secondMatch.active.map((p) => p.key)).toEqual(first.active.map((p) => p.key))
    expect(secondMatch.state.matchId).toBe('m2')
  })
})

describe('the confidence filter', () => {
  it('silences a prompt resting on an Unknown fact', () => {
    // A cue cannot fabricate its own confidence.
    const anchors = anchorSet(anchor('ObjectiveEnded', '1', 300))
    const ctx = ctxAt(braxis, anchors, 1800)
    expect(ctx.nextObjective!.confidence.kind).toBe('Unknown')
    const result = run(ctx, newCueState('m1'))
    expect(result.active.some((p) => p.cueId === 'objective-prep')).toBe(false)
    expect(result.active.some((p) => p.cueId === 'stall-camp')).toBe(false)
  })

  it('handles a multi-fact cue with mixed confidence', () => {
    // stall-camp rests on a camp Belief and an objective Confidence. A single scalar
    // could not express that, which is why basedOn is a list.
    const wide = { ...cueText, 'stall-camp': { ...cueText['stall-camp']!, thresholds: { windowSeconds: 600 } } }

    // Camp fine, objective fine: the prompt is available.
    const ok = ctxAt(dragon, anchorSet(anchor('CampUp', 'siege-top:1', 150)), 200)
    expect(isAvailable(ok.camps.find((c) => c.id === 'siege-top')!.standing)).toBe(true)
    expect(ok.nextObjective!.confidence.kind).not.toBe('Unknown')
    expect(evaluateCues(cues, wide, verbose, ok, newCueState('m1')).active.some((p) => p.cueId === 'stall-camp'))
      .toBe(true)

    // Same camp fact, objective now Unknown: the combination is what silences it.
    const lost = ctxAt(dragon, anchorSet(anchor('CampUp', 'siege-top:1', 1750)), 1800)
    expect(isAvailable(lost.camps.find((c) => c.id === 'siege-top')!.standing)).toBe(true)
    expect(lost.nextObjective!.confidence.kind).toBe('Unknown')
    expect(evaluateCues(cues, wide, verbose, lost, newCueState('m1')).active.some((p) => p.cueId === 'stall-camp'))
      .toBe(false)
  })

  it('does not fire stall-camp while camps are suppressed', () => {
    const ctx = ctxAt(braxis, anchorSet(), 100)
    expect(ctx.camps.every((c) => c.standing.kind === 'Known' && !c.standing.value)).toBe(true)
    expect(stallCamp.evaluate(ctx, { windowSeconds: 15 }, undefined)).toBeNull()
  })

  it('substitutes {time} from the fact rather than from the cue', () => {
    const ctx = ctxAt(tomb, anchorSet(), 25)
    const prompt = run(ctx, newCueState('m1')).active.find((p) => p.cueId === 'wave-reminder')!
    // Exact wording for an Exact fact.
    expect(prompt.spoken).toBe('Wave in 5.')
  })
})

describe('re-firing after an anchor correction', () => {
  function firedOnce(now: number) {
    const ctx = ctxAt(tomb, anchorSet(), now)
    return { ctx, state: run(ctx, newCueState('m1')).state }
  }

  it('re-fires when a fact moves by more than the threshold', () => {
    const { state } = firedOnce(25)
    const key = Object.keys(state.fired)[0]!
    const moved: CueState = {
      ...state,
      fired: {
        ...state.fired,
        [key]: {
          at: 25,
          basedOn: Object.fromEntries(
            Object.entries(state.fired[key]!.basedOn).map(([id, at]) => [id, at - refireThresholdSeconds - 5]),
          ),
        },
      },
    }
    const ctx = ctxAt(tomb, anchorSet(), 25)
    expect(run(ctx, moved).active.some((p) => p.cueId === 'wave-reminder')).toBe(true)
  })

  it('does not re-fire on a small correction', () => {
    const { state } = firedOnce(25)
    const key = Object.keys(state.fired)[0]!
    const nudged: CueState = {
      ...state,
      fired: {
        ...state.fired,
        [key]: {
          at: 25,
          basedOn: Object.fromEntries(
            Object.entries(state.fired[key]!.basedOn).map(([id, at]) => [id, at - 2]),
          ),
        },
      },
    }
    const ctx = ctxAt(tomb, anchorSet(), 25)
    expect(run(ctx, nudged).active.some((p) => p.cueId === 'wave-reminder')).toBe(false)
  })

  it('drops fired entries whose basedOn names an id no longer in the timeline', () => {
    // On ANCHOR_CLEARED cycle indices shift and event ids shift with them. Without
    // this a cue either re-fires immediately or goes silent for the match.
    const { state } = firedOnce(25)
    const stale: CueState = {
      ...state,
      fired: { ...state.fired, 'ghost:1': { at: 10, basedOn: { 'objective:spawn:99': 500 } } },
    }
    const ctx = ctxAt(tomb, anchorSet(), 25)
    expect(run(ctx, stale).state.fired['ghost:1']).toBeUndefined()
  })
})

describe('stall-camp', () => {
  it('does not repeat on consecutive cycles unless the camp differs', () => {
    // A static argmax would name the same camp every cycle of every match, which is
    // "speech becomes noise" with a deterministic cause.
    const ctx = ctxAt(dragon, anchorSet(), 200)
    const match = stallCamp.evaluate(ctx, { windowSeconds: 600 }, undefined)
    expect(match).not.toBeNull()
    const cycle = ctx.nextObjective!.cycle!
    const blocked = stallCamp.evaluate(ctx, { windowSeconds: 600 }, { cycle: cycle - 1, campId: match!.subject })
    expect(blocked).toBeNull()
    const allowed = stallCamp.evaluate(ctx, { windowSeconds: 600 }, { cycle: cycle - 1, campId: 'somewhere-else' })
    expect(allowed).not.toBeNull()
  })
})

describe('context', () => {
  it('carries the clamped numbers the player sees', () => {
    const now = 640
    const anchors = anchorSet(anchor('ObjectiveEnded', '1', 300))
    const raw: Timeline = project(braxis, anchors, now)
    const ctx = buildContext(braxis, raw, now)
    const rawSpawn = raw.events.find((e) => e.role === 'spawn')!
    expect(ctx.nextObjective!.at).toBeGreaterThan(rawSpawn.at)
  })

  it('does not carry settings', () => {
    const ctx = ctxAt()
    expect('settings' in ctx).toBe(false)
  })

  it('is unaffected by which cue reads it', () => {
    const ctx = ctxAt(tomb, anchorSet(), 25)
    const before = JSON.stringify(ctx)
    waveReminder.evaluate(ctx, { warnSeconds: 10 }, undefined)
    stallCamp.evaluate(ctx, { windowSeconds: 15 }, undefined)
    expect(JSON.stringify(ctx)).toBe(before)
  })
})
