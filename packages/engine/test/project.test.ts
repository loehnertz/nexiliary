import { describe, expect, it } from 'vitest'
import {
  buildContext,
  deathTimerSeconds,
  levelCurve,
  project,
  validUntilFallbackSeconds,
  view,
  walkChain,
} from '../src/index.js'
import { anchor, anchorSet, braxis, tomb } from './fixtures.js'

describe('validUntil', () => {
  it('is always strictly greater than now, including once every camp is Stale', () => {
    for (let now = 0; now < 2400; now += 3) {
      const t = project(braxis, anchorSet(), now)
      expect(t.validUntil).toBeGreaterThan(now)
    }
    // Without the strictness it is permanently in the past once any camp goes Stale,
    // and the memo then recomputes every tick, defeating the whole design.
    const late = project(tomb, anchorSet(), 2400)
    expect(late.camps.every((c) => c.standing.kind === 'Stale')).toBe(true)
    expect(late.validUntil).toBeGreaterThan(2400)
  })

  it('is the earliest candidate strictly in the future', () => {
    // Individual wave boundaries are not candidates: wave events do not move, so the
    // projection stays valid until the end of the block already emitted, and `view`
    // picks the next wave within it. What does change is a camp's `standing`, a tier
    // passing, and a level boundary — which the death timer reads off.
    const nextLevelAfter = (now: number) => levelCurve.find((e) => e.typicalSeconds > now)!.typicalSeconds
    expect(project(tomb, anchorSet(), 10).validUntil).toBe(nextLevelAfter(10))
    expect(project(tomb, anchorSet(), 125).validUntil).toBe(nextLevelAfter(125))
    // The level curve is dense early, so it usually wins; a camp boundary wins once
    // the curve thins out.
    expect(project(tomb, anchorSet(), 200).validUntil).toBe(nextLevelAfter(200))
    expect(project(tomb, anchorSet(), 230).validUntil).toBe(240)
  })

  it('falls back rather than returning infinity when nothing is pending', () => {
    expect(validUntilFallbackSeconds).toBeGreaterThan(0)
  })
})

describe('truncation is per generator', () => {
  it('never yields a merged timeline of waves alone', () => {
    // Waves recur every 30 seconds, so a single global horizon over an at-sorted list
    // is always four waves, evicting everything the cues depend on.
    for (const now of [0, 100, 400, 900, 1500]) {
      const t = project(braxis, anchorSet(), now)
      const kinds = new Set(t.events.map((e) => e.kind))
      expect(kinds.has('wave')).toBe(true)
      expect(kinds.size).toBeGreaterThan(1)
    }
  })

  it('emits four waves, two tiers and two objective cycles', () => {
    const t = project(braxis, anchorSet(), 200)
    expect(t.events.filter((e) => e.kind === 'wave')).toHaveLength(4)
    expect(t.events.filter((e) => e.kind === 'tier')).toHaveLength(2)
    expect(t.events.filter((e) => e.role === 'spawn')).toHaveLength(2)
  })

  it('sorts by at', () => {
    const t = project(braxis, anchorSet(), 200)
    for (let i = 1; i < t.events.length; i += 1) {
      expect(t.events[i]!.at).toBeGreaterThanOrEqual(t.events[i - 1]!.at)
    }
  })
})

describe('the floor', () => {
  it('gives the death timer the level estimate confidence, never Exact', () => {
    // It is a step function of team level, and team level is Estimated. Near a
    // breakpoint an Exact death timer is simply the wrong number rendered green.
    for (const now of [0, 200, 440, 900, 1400]) {
      const t = project(braxis, anchorSet(), now)
      expect(t.deathTimer.confidence).toEqual(t.level.confidence)
      expect(t.deathTimer.confidence.kind).not.toBe('Exact')
      expect(t.deathTimer.seconds).toBe(deathTimerSeconds(t.level.estimate))
    }
  })

  it('reads the level off the curve', () => {
    expect(project(braxis, anchorSet(), 0).level.estimate).toBe(1)
    const tenth = levelCurve.find((e) => e.level === 10)!
    expect(project(braxis, anchorSet(), tenth.typicalSeconds).level.estimate).toBe(10)
    expect(project(braxis, anchorSet(), tenth.typicalSeconds - 1).level.estimate).toBe(9)
  })

  it('holds on an unrecognised map with no data at all', () => {
    const t = project({ id: 'x', name: 'x', provenance: 'unknown', objective: { kind: 'none' }, camps: [] }, anchorSet(), 300)
    expect(t.events.filter((e) => e.kind === 'wave').length).toBe(4)
    expect(t.events.filter((e) => e.kind === 'tier').length).toBe(2)
    expect(t.deathTimer.seconds).toBeGreaterThan(0)
  })

  it('is unaffected by an anchor that no generator reads', () => {
    const withNoise = project(braxis, anchorSet(anchor('FortLost', 'top', 400)), 500)
    const without = project(braxis, anchorSet(), 500)
    expect(withNoise.events).toEqual(without.events)
  })
})

describe('reading an emitted block after time has moved inside it', () => {
  it('never shows a wave that has already spawned', () => {
    // Waves are emitted as a block and the block stays valid until it ends, which is
    // what keeps `validUntil` from forcing a projection every thirty seconds. So the
    // first entry in the block is routinely in the past, and reading it renders a wave
    // countdown frozen at 0:00.
    const timeline = project(tomb, anchorSet(), 0)
    for (let now = 0; now <= timeline.validUntil; now += 1) {
      const v = view(timeline, tomb, now)
      const wave = v.rail.find((s) => s.kind === 'wave')
      expect(wave, `no wave slot at ${now}`).toBeDefined()
      // 0:00 is only truthful at the instant a wave spawns.
      if (now % 30 !== 0) expect(wave!.text, `stale wave at ${now}`).not.toBe('0:00')
    }
  })

  it('never offers a cue a fact that has already happened', () => {
    const timeline = project(tomb, anchorSet(), 0)
    for (let now = 0; now <= timeline.validUntil; now += 1) {
      const ctx = buildContext(tomb, timeline, now)
      if (ctx.nextWave !== null) expect(ctx.nextWave.at).toBeGreaterThanOrEqual(now)
      if (ctx.tier.next !== null) expect(ctx.tier.next.at).toBeGreaterThanOrEqual(now)
    }
  })
})

describe('the objective phase belief', () => {
  it('reports the phase live between the spawn and the resolution band', () => {
    // Without this the app counts down to the objective *after* the one being fought,
    // at the moment it exists for, and the re-anchor button — the core interaction —
    // is not emphasised when the tap is wanted.
    expect(project(braxis, anchorSet(), 80).objectivePhase.kind).toBe('idle')
    const during = project(braxis, anchorSet(), 150).objectivePhase
    expect(during.kind).toBe('active')
    if (during.kind === 'active') {
      expect(during.cycle).toBe(1)
      expect(during.since).toBe(90)
      // Spawn 90 Exact, fight 70 ± 25: the phase can still be running at 185.
      expect(during.until).toBe(185)
    }
    // Past the resolution band with no anchor it is not live, but it is still the tap
    // the app is waiting for.
    expect(project(braxis, anchorSet(), 260).objectivePhase.kind).toBe('unreported')
  })

  it('is idle before anything has spawned, so there is nothing to tap', () => {
    // Reported from a real match: "objective ended" could be pressed one second into
    // the game, when the objective cannot have been there.
    for (let now = 0; now < 90; now += 1) {
      expect(project(braxis, anchorSet(), now).objectivePhase.kind, `at ${now}`).toBe('idle')
    }
  })

  it('is idle again the moment the tap lands, so it cannot be pressed twice', () => {
    // Reported from a real match: the objective could be reported ended repeatedly.
    const anchors = anchorSet(anchor('ObjectiveEnded', '1', 200))
    for (let now = 200; now < 320; now += 1) {
      expect(project(braxis, anchors, now).objectivePhase.kind, `at ${now}`).toBe('idle')
    }
    // And comes back when the next phase actually goes live.
    expect(project(braxis, anchors, 340).objectivePhase.kind).toBe('active')
  })

  it('renders the live state rather than a countdown to the following cycle', () => {
    const slot = view(project(braxis, anchorSet(), 150), braxis, 150).objective
    expect(slot.kind).toBe('live')
    // And the pending spawn moves to the rail rather than disappearing.
    expect(view(project(braxis, anchorSet(), 150), braxis, 150).rail[0]!.kind).toBe('objective')
  })

  it('stops claiming a live phase once the cycle is Unknown, but still wants the tap', () => {
    // An Unknown cycle cannot support a claim about the present. It falls through to
    // `unreported` rather than `idle`, because when timing is lost the tap is the only
    // way back and the design calls for the anchor button offered prominently.
    const anchors = anchorSet(anchor('ObjectiveEnded', '1', 300))
    for (let now = 1500; now < 2400; now += 20) {
      const t = project(braxis, anchors, now)
      expect(t.objectiveTimingLost).toBe(true)
      expect(t.objectivePhase.kind).toBe('unreported')
    }
  })

  it('is dropped with everything else map-derived under unknown provenance', () => {
    const map = { ...braxis, provenance: 'unknown' as const }
    expect(project(map, anchorSet(), 150).objectivePhase.kind).toBe('idle')
  })
})

describe('the phase belief and the clamp never contradict each other', () => {
  it('does not call a cycle live while the clamp says it cannot be sooner than now', () => {
    // Advancement and the clamp deliberately draw opposite conclusions from the same
    // silence. That is coherent while they live in different places, but a phase
    // readout built on the unclamped values puts both sentences on screen at once:
    // "no sooner than two minutes" above "it is happening now", about one cycle.
    for (let now = 0; now < 2400; now += 3) {
      const timeline = project(braxis, anchorSet(), now)
      const phase = timeline.objectivePhase
      if (phase.kind !== 'active') continue
      const clamped = view(timeline, braxis, now)
      const spawn = clamped.timeline.events.find((e) => e.role === 'spawn' && e.cycle === phase.cycle)
      if (spawn === undefined) continue
      const low = spawn.confidence.kind === 'Estimated' ? spawn.confidence.low : spawn.at
      expect(low, `cycle ${phase.cycle} called live at ${now} but clamped to ${low}`).toBeLessThanOrEqual(now)
    }
  })

  it('does not remove camps from a battlefield the countdown has not reached', () => {
    for (let now = 0; now < 2400; now += 3) {
      const timeline = project(braxis, anchorSet(), now)
      if (timeline.objectivePhase.kind === 'active') continue
      expect(timeline.camps.every((c) => !c.suppressed), `suppressed with no live phase at ${now}`).toBe(true)
    }
  })
})

describe('the footer numbers', () => {
  it('keeps the death timer and the level estimate consistent at every moment', () => {
    // Reported as looking buggy: "0:16 death" beside "~2 level". Those agree — the
    // published table gives 16 seconds at level 2 — so the fault is that neither is
    // labelled well enough to read. Asserted so a real inconsistency is not mistaken
    // for the same thing later.
    for (let now = 0; now <= 2400; now += 1) {
      const t = project(braxis, anchorSet(), now)
      expect(t.deathTimer.seconds, `at ${now}`).toBe(deathTimerSeconds(t.level.estimate))
    }
  })

  it('crosses each level exactly on the curve, never a moment early', () => {
    for (const entry of levelCurve) {
      expect(project(braxis, anchorSet(), entry.typicalSeconds).level.estimate).toBe(entry.level)
      if (entry.level > 1) {
        expect(project(braxis, anchorSet(), entry.typicalSeconds - 1).level.estimate).toBe(entry.level - 1)
      }
    }
  })
})

describe('the ObjectiveSpawned anchor', () => {
  // The chain advances past a spawn the instant it happens, exactly as it does for the
  // unanchored first cycle, so the live phase is carried by `elapsed`. These assert what
  // is observable rather than which index `pending` holds.

  it('pins the spawn exactly and leaves only the fight open', () => {
    // This is the anchor that lets fight duration and respawn offset be told apart,
    // which is what a map needs measured before it can be marked `verified`.
    const anchors = anchorSet(anchor('ObjectiveSpawned', '1', 97))
    const atSpawn = walkChain(braxis, anchors, 97)!
    expect(atSpawn.pending.cycle).toBe(1)
    expect(atSpawn.pending.at).toBe(97)
    expect(atSpawn.pending.confidence.kind).toBe('Exact')
    // The fight is still a fight: 70 ± 25.
    expect(atSpawn.pending.resolutionHigh - atSpawn.pending.resolutionLow).toBe(50)

    const phase = project(braxis, anchors, 120).objectivePhase
    expect(phase.kind).toBe('active')
    if (phase.kind === 'active') {
      expect(phase.since).toBe(97)
      expect(phase.until).toBe(97 + 70 + 25)
    }
  })

  it('yields to a later ObjectiveEnded, because that is the newer fact', () => {
    const anchors = anchorSet(
      anchor('ObjectiveSpawned', '1', 97),
      anchor('ObjectiveEnded', '1', 210),
    )
    const walk = walkChain(braxis, anchors, 215)!
    expect(walk.pending.cycle).toBe(2)
    expect(walk.pending.at).toBe(210 + 130)
  })

  it('wins over an older ObjectiveEnded, because it is the newer fact', () => {
    const anchors = anchorSet(
      anchor('ObjectiveEnded', '1', 210),
      anchor('ObjectiveSpawned', '2', 344),
    )
    const walk = walkChain(braxis, anchors, 344)!
    expect(walk.pending.cycle).toBe(2)
    expect(walk.pending.at).toBe(344)
    expect(walk.pending.confidence.kind).toBe('Exact')
  })

  it('narrows the next cycle to one fight plus one offset', () => {
    // From a known spawn the next spawn is uncertain by exactly one step, which is the
    // tightest the chain gets without a further tap.
    const walk = walkChain(braxis, anchorSet(anchor('ObjectiveSpawned', '1', 97)), 300)!
    expect(walk.pending.cycle).toBe(2)
    expect(walk.pending.n).toBe(1)
    expect(walk.pending.at).toBe(97 + 70 + 130)
    expect(walk.pending.spread).toBe(25)
  })

  it('degrades to silence when forgotten', () => {
    // Without it the chain is exactly what it was: the first spawn from map data.
    const without = walkChain(braxis, anchorSet(), 30)!
    expect(without.pending.at).toBe(90)
    expect(project(braxis, anchorSet(), 120).objectivePhase.kind).toBe('active')
  })

  it('shifts the whole chain when the real spawn was late', () => {
    // The point of recording it: the map says 1:30 and the objective actually appeared
    // at 1:37, so everything downstream moves by seven seconds rather than staying
    // quietly wrong.
    const onTime = walkChain(braxis, anchorSet(anchor('ObjectiveSpawned', '1', 90)), 300)!
    const late = walkChain(braxis, anchorSet(anchor('ObjectiveSpawned', '1', 97)), 300)!
    expect(late.pending.at - onTime.pending.at).toBe(7)
  })
})

describe('the resolution band', () => {
  it('is never zero-width, even when the spawn is exactly known', () => {
    // It closes the camp suppression window and bounds the live readout, so a
    // zero-width band claims a phase ends at an exact instant.
    for (const now of [0, 95, 200, 600, 1200]) {
      const t = project(braxis, anchorSet(anchor('ObjectiveSpawned', '1', 90)), now)
      const phase = t.objectivePhase
      if (phase.kind === 'active') expect(phase.until).toBeGreaterThan(phase.since)
    }
    const walk = walkChain(braxis, anchorSet(), 30)!
    expect(walk.pending.spread).toBe(0)
    expect(walk.pending.resolutionHigh).toBeGreaterThan(walk.pending.resolutionAt)
  })
})

describe('the TierReached anchor', () => {
  it('makes the current level exact, and the death timer with it', () => {
    // The one number the app shows that the player can also read off their own screen.
    // Unanchored it is a derived estimate; told, it is simply known.
    const anchors = anchorSet(anchor('TierReached', '10', 500))
    const t = project(braxis, anchors, 520)
    expect(t.level.estimate).toBe(10)
    expect(t.level.confidence.kind).toBe('Exact')
    expect(t.deathTimer.confidence.kind).toBe('Exact')
    expect(t.deathTimer.seconds).toBe(24)
  })

  it('re-phases the whole curve rather than accumulating', () => {
    // Level 10 sits at 7:19 on the derived curve. A team that reaches it at 9:00 is a
    // minute and a half off it, and every later tier moves with them.
    const late = anchorSet(anchor('TierReached', '10', 540))
    const shifted = project(braxis, late, 560).events.find((e) => e.id === 'tier:13')!
    const unshifted = project(braxis, anchorSet(), 560).events.find((e) => e.id === 'tier:13')!
    expect(Math.round(shifted.at - unshifted.at)).toBe(100)
  })

  it('never lets the team lose levels', () => {
    // An anchor is a floor as well as a phase: told level 13 at 5:00, the app does not
    // then report level 8 because the curve says so.
    const anchors = anchorSet(anchor('TierReached', '13', 300))
    expect(project(braxis, anchors, 310).level.estimate).toBe(13)
  })

  it('returns to estimating once a boundary has been crossed, but from the fix', () => {
    const anchors = anchorSet(anchor('TierReached', '10', 500))
    const later = project(braxis, anchors, 900)
    expect(later.level.confidence.kind).toBe('Estimated')
    expect(later.level.estimate).toBeGreaterThan(10)
    // And more tightly than an unanchored estimate at the same distance, because the
    // uncertainty is in levelling since the fix rather than since the match began.
    const anchoredWidth =
      later.level.confidence.kind === 'Estimated'
        ? later.level.confidence.high - later.level.confidence.low
        : 0
    const plain = project(braxis, anchorSet(), 900).level.confidence
    const plainWidth = plain.kind === 'Estimated' ? plain.high - plain.low : 0
    expect(anchoredWidth).toBeLessThan(plainWidth)
  })

  it('degrades to the derived curve when forgotten', () => {
    expect(project(braxis, anchorSet(), 520).level.estimate).toBe(
      project(braxis, anchorSet(), 520).level.estimate,
    )
    expect(project(braxis, anchorSet(), 520).level.confidence.kind).toBe('Estimated')
  })

  it('takes the newest observation when several were given', () => {
    const anchors = anchorSet(
      anchor('TierReached', '7', 280),
      anchor('TierReached', '10', 500),
    )
    expect(project(braxis, anchors, 505).level.estimate).toBe(10)
    expect(project(braxis, anchors, 505).level.confidence.kind).toBe('Exact')
  })
})

describe('the rail under starvation', () => {
  it('never fills with the same event four times over', () => {
    // The fixed slot allocation exists so that a map with four camps up still shows
    // upcoming events. The same degeneracy is reachable from the other direction — no
    // objective, no tiers left, every camp Stale — and then the rail was four identical
    // wave countdowns.
    for (let now = 0; now < 2400; now += 7) {
      const rail = view(project(braxis, anchorSet(), now), braxis, now).rail
      const waves = rail.filter((s) => s.kind === 'wave')
      expect(waves.length, `four waves at ${now}`).toBeLessThanOrEqual(2)
      expect(new Set(rail.map((s) => s.key)).size, `duplicate slots at ${now}`).toBe(rail.length)
    }
  })

  it('prefers a Stale camp chip over a second wave, because the chip corrects it', () => {
    // Deep into an unanchored match on a suppression map every camp is Stale, so nothing
    // satisfies `isClaimable` and the slots fall through.
    const now = 1200
    const rail = view(project(braxis, anchorSet(), now), braxis, now).rail
    expect(rail.some((s) => s.camp?.stale === true)).toBe(true)
  })
})
