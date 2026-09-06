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
import type { AdviceContext, Anchor, CueState, PromptSettings, Timeline } from '../src/index.js'
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
  it('reaches for the runner-up rather than going quiet on a repeat', () => {
    // A static argmax would name the same camp every cycle of every match, which is
    // "speech becomes noise" with a deterministic cause. Naming the next camp down fixes
    // that; dropping the prompt entirely, which is what it used to do, does not.
    const ctx = ctxAt(dragon, anchorSet(), 200)
    const match = stallCamp.evaluate(ctx, { windowSeconds: 600 }, undefined)
    expect(match).not.toBeNull()
    const cycle = ctx.nextObjective!.cycle!

    const repeated = stallCamp.evaluate(ctx, { windowSeconds: 600 }, { cycle: cycle - 1, campId: match!.subject })
    expect(repeated, 'still speaks').not.toBeNull()
    expect(repeated!.subject, 'but names a different camp').not.toBe(match!.subject)

    const unrelated = stallCamp.evaluate(ctx, { windowSeconds: 600 }, { cycle: cycle - 1, campId: 'somewhere-else' })
    expect(unrelated!.subject).toBe(match!.subject)
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

describe('stall-camp across a whole match', () => {
  // Braxis-shaped: a 130 second offset after a 70 second fight, so a cycle is about
  // 200 seconds and an anchor every 200 keeps the chain's cycle index moving by one.
  const ends = [300, 500, 700, 900]

  function fireLog(mapArg = dragon) {
    const anchors = new Map<string, Anchor>()
    let state = newCueState('m1')
    const fired: { at: number; camp: string; cycle: number }[] = []
    for (let now = 0; now <= 1100; now += 1) {
      ends.forEach((t, i) => {
        if (now === t) {
          anchors.set(`ObjectiveEnded:${i + 1}`, anchor('ObjectiveEnded', String(i + 1), t))
        }
      })
      const ctx = buildContext(mapArg, project(mapArg, anchors, now), now)
      const result = evaluateCues(cues, cueText, verbose, ctx, state)
      state = result.state
      for (const p of result.active) {
        if (p.cueId !== 'stall-camp') continue
        const [, camp, cycle] = p.key.split(':')
        fired.push({ at: now, camp: camp!, cycle: Number(cycle!.replace('cycle-', '')) })
      }
    }
    return fired
  }

  it('fires on every objective cycle, not every other one', () => {
    // Reported from a real match: the camp prompt "only hit the first time around".
    // The old rule dropped the cue whenever the same camp won two cycles running, which
    // on a map where one camp is simply the best is every cycle — observed firing on
    // 1, 3 and 5 and never on 2 or 4.
    const fired = fireLog()
    const cyclesFired = fired.map((f) => f.cycle)
    expect(new Set(cyclesFired).size).toBe(cyclesFired.length)
    for (let i = 1; i < cyclesFired.length; i += 1) {
      expect(cyclesFired[i]! - cyclesFired[i - 1]!, `skipped a cycle: ${cyclesFired}`).toBe(1)
    }
    expect(cyclesFired.length).toBeGreaterThanOrEqual(4)
  })

  it('names a different camp than last cycle when there is one to name', () => {
    // The design's actual goal: a static argmax would name the same camp every cycle of
    // every match. Reaching for the runner-up achieves that; going silent did not.
    //
    // Two camps of equal standing that both stay believed-available all match, which is
    // the real shape on Battlefield of Eternity: two shaman camps, one east, one west.
    const pair = {
      ...dragon,
      camps: dragon.camps
        .filter((c) => c.type === 'boss')
        .flatMap((c) => [
          { ...c, id: 'twin-w', label: 'twin w' },
          { ...c, id: 'twin-e', label: 'twin e' },
        ]),
    }
    const fired = fireLog(pair)
    expect(fired.length).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < fired.length; i += 1) {
      expect(fired[i]!.camp, `repeated ${fired[i]!.camp}`).not.toBe(fired[i - 1]!.camp)
    }
  })

  it('repeats the only camp rather than going quiet when there is no alternative', () => {
    // One available camp means that is the camp to take, and saying so twice beats
    // saying nothing.
    // The boss, because its `staleSeconds` keeps it believed-available all match; an
    // ordinary camp decays to Stale and drops out for reasons unrelated to this rule.
    const oneCamp = { ...dragon, camps: dragon.camps.filter((c) => c.type === 'boss') }
    const fired = fireLog(oneCamp)
    expect(fired.length).toBeGreaterThanOrEqual(2)
    expect(new Set(fired.map((f) => f.camp)).size).toBe(1)
  })
})
