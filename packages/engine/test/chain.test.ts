import { describe, expect, it } from 'vitest'
import {
  maxUsefulBand,
  minStepSpread,
  offsetFor,
  project,
  reachableOutcomes,
  spread,
  stepSpread,
  walkChain,
} from '../src/index.js'
import { alterac, anchor, anchorSet, blackheart, braxis, cursed, deterministic, tomb } from './fixtures.js'

const band = (c: { kind: string; low?: number; high?: number }) =>
  c.kind === 'Estimated' ? (c.high ?? 0) - (c.low ?? 0) : 0

describe('band growth', () => {
  it('grows sub-linearly across unanchored cycles', () => {
    const step = 25
    const widths = [1, 2, 3, 4].map((n) => 2 * spread(n, step))
    // The published worked example for stepSpread 25 and r = 0.3.
    expect(widths.map(Math.round)).toEqual([50, 81, 110, 138])

    // A regression to linear accumulation is the most likely wrong implementation and
    // silently costs several usable cycles.
    for (let n = 2; n <= 6; n += 1) {
      expect(spread(n, step)).toBeLessThan(spread(1, step) * n)
    }
  })

  it('accumulates both the fight spread and the offset half-width', () => {
    // A map with a wide offset range and a narrow fight spread must not produce the
    // same band as the reverse, and neither may equal the fight spread alone.
    const wideOffset = stepSpread(5, 30)
    const wideFight = stepSpread(30, 5)
    expect(wideOffset).toBeCloseTo(wideFight, 6)
    expect(wideOffset).toBeGreaterThan(stepSpread(5, 0))
    expect(stepSpread(30, 30)).toBeGreaterThan(stepSpread(30, 0))
  })

  it('widens a deterministic phase with a scalar offset, via minStepSpread', () => {
    // spreadSeconds 0 and offsetHalfWidth 0 would otherwise report Exact at cycle 20.
    expect(stepSpread(0, 0)).toBe(minStepSpread)
    const walk = walkChain(deterministic, anchorSet(), 2000)!
    expect(walk.pending.spread).toBeGreaterThanOrEqual(minStepSpread)
    expect(walk.pending.confidence.kind).toBe('Estimated')
  })
})

describe('the objective chain', () => {
  it('starts Exact at the first spawn with no anchor', () => {
    const walk = walkChain(braxis, anchorSet(), 30)!
    expect(walk.pending.cycle).toBe(1)
    expect(walk.pending.at).toBe(90)
    expect(walk.pending.confidence.kind).toBe('Exact')
    expect(walk.pending.offset).toBeNull()
  })

  it('collapses to Exact after an anchor only on a scalar-offset map', () => {
    const braxisWalk = walkChain(braxis, anchorSet(anchor('ObjectiveEnded', '1', 300)), 310)!
    expect(braxisWalk.pending.at).toBe(430)
    expect(braxisWalk.pending.confidence.kind).toBe('Exact')

    const alteracWalk = walkChain(alterac, anchorSet(anchor('ObjectiveEnded', '1', 360)), 370)!
    expect(alteracWalk.pending.confidence.kind).toBe('Estimated')
    // 110-150 shortened by 2s per game minute, both ends equally: the width is the
    // offset width and nothing else, because no fight is being predicted.
    expect(band(alteracWalk.pending.confidence)).toBe(40)
  })

  it('advances on unclamped values while the clamp would be binding', () => {
    const anchors = anchorSet(anchor('ObjectiveEnded', '1', 300))
    // 430 Exact; then cycle 2 at 430 + 70 + 130 = 630 with spread(1) = 25.
    const before = walkChain(braxis, anchors, 429)!
    expect(before.pending.cycle).toBe(2)
    expect(before.pending.n).toBe(0)

    const after = walkChain(braxis, anchors, 640)!
    // now = 640 is past the unclamped high of 655? No: 630 + 25 = 655, so still cycle 3.
    expect(after.pending.cycle).toBe(3)
    expect(after.pending.n).toBe(1)
    expect(after.pending.at).toBe(630)

    // The clamp would put low at 640 + 130 = 770. Advancement must not see that: the
    // chain has to keep advancing, and n has to keep growing.
    const later = walkChain(braxis, anchors, 1200)!
    expect(later.pending.n).toBeGreaterThan(after.pending.n)
    expect(later.pending.spread).toBeGreaterThan(after.pending.spread)
  })

  it('reaches Unknown past maxUsefulBand and stays there', () => {
    const anchors = anchorSet(anchor('ObjectiveEnded', '1', 300))
    let lostAt = 0
    for (let now = 400; now < 2400; now += 5) {
      const walk = walkChain(braxis, anchors, now)!
      if (walk.pending.confidence.kind === 'Unknown') {
        lostAt = now
        break
      }
      expect(2 * walk.pending.spread).toBeLessThanOrEqual(maxUsefulBand)
    }
    expect(lostAt).toBeGreaterThan(0)
    for (let now = lostAt; now < 3000; now += 60) {
      const walk = walkChain(braxis, anchors, now)!
      expect(walk.pending.confidence.kind).toBe('Unknown')
      expect(walk.following.confidence.kind).toBe('Unknown')
    }
  })

  it('surfaces timing loss as a distinguishable state rather than a null', () => {
    const anchors = anchorSet(anchor('ObjectiveEnded', '1', 300))
    const timeline = project(braxis, anchors, 1800)
    expect(timeline.objectiveTimingLost).toBe(true)
    const spawn = timeline.events.find((e) => e.role === 'spawn')
    expect(spawn).toBeDefined()
    expect(spawn!.confidence.kind).toBe('Unknown')
  })

  it('degrades within the expected number of cycles per map', () => {
    // Not a specification: a check that the implementation sits on the documented
    // curve rather than accumulating linearly.
    const cyclesUntilLost = (map: typeof braxis, anchorAt: number) => {
      const anchors = anchorSet(anchor('ObjectiveEnded', '1', anchorAt))
      for (let now = anchorAt; now < 5000; now += 2) {
        const walk = walkChain(map, anchors, now)!
        if (walk.pending.confidence.kind === 'Unknown') return walk.pending.n
      }
      return -1
    }
    expect(cyclesUntilLost(braxis, 300)).toBe(4)
    expect(cyclesUntilLost(alterac, 300)).toBe(3)
    expect(cyclesUntilLost(cursed, 300)).toBeLessThanOrEqual(3)
  })
})

describe('respawn rule variants', () => {
  it('keeps an unreachable branch out of the union, at both boundaries', () => {
    if (cursed.objective.kind !== 'timed') throw new Error('fixture')
    const rule = cursed.objective.respawn
    // A curse needs three tributes, so the earliest cycle that can resolve as one is the
    // third — which predicts the fourth spawn. Both boundaries, since an off-by-one here
    // is exactly what the design warns about and exactly what it shipped.
    expect(offsetFor(rule, 3, 0)).toEqual({ min: 50, max: 90 })
    expect(offsetFor(rule, 4, 0)).toEqual({ min: 50, max: 160 })
  })

  it('shortens a scaled offset late in a match without changing its width', () => {
    if (alterac.objective.kind !== 'timed') throw new Error('fixture')
    const rule = alterac.objective.respawn
    expect(offsetFor(rule, 2, 0)).toEqual({ min: 110, max: 150 })
    expect(offsetFor(rule, 2, 600)).toEqual({ min: 90, max: 130 })
    // Floored at minOffsetSeconds, and the floor moves both ends together so the
    // half-width survives: without it the offset reaches zero at 55 minutes.
    const late = offsetFor(rule, 2, 3600)
    expect(late.min).toBe(60)
    expect(late.max - late.min).toBe(40)
  })

  it('re-anchors Blackheart\'s Bay from the last chest, not from a clock', () => {
    // `architecture.md` models this as a fixed interval. The wiki says twice that chests
    // spawn three minutes after the final chest of the previous event is captured, which
    // is the same shape as every other map — and left `fixedInterval` with no users.
    const none = walkChain(blackheart, anchorSet(), 30)!
    expect(none.pending.at).toBe(90)

    const rephased = walkChain(blackheart, anchorSet(anchor('ObjectiveEnded', '1', 400)), 410)!
    expect(rephased.pending.at).toBe(400 + 180)
    expect(rephased.pending.confidence.kind).toBe('Exact')
  })

  it('supports a map with no timed objective', () => {
    expect(walkChain(tomb, anchorSet(), 300)).toBeNull()
    const timeline = project(tomb, anchorSet(), 300)
    expect(timeline.events.some((e) => e.kind === 'objective')).toBe(false)
    expect(timeline.events.some((e) => e.kind === 'wave')).toBe(true)
  })
})

describe('a reported outcome collapses the union', () => {
  const rule = () => {
    if (cursed.objective.kind !== 'timed') throw new Error('fixture')
    return cursed.objective.respawn
  }

  it('uses only the named branch instead of spanning both', () => {
    // Cursed Hollow is the worst-degrading map in the pool precisely because it has to
    // span 0:50 to 2:40 when nobody says which happened.
    expect(offsetFor(rule(), 4, 0)).toEqual({ min: 50, max: 160 })
    expect(offsetFor(rule(), 4, 0, 'tribute')).toEqual({ min: 50, max: 90 })
    expect(offsetFor(rule(), 4, 0, 'curse')).toEqual({ min: 120, max: 160 })
  })

  it('beats possibleFromCycle, because there is nothing left to infer', () => {
    // The gate exists to work out what *could* have happened. Someone has said.
    expect(offsetFor(rule(), 2, 0)).toEqual({ min: 50, max: 90 })
    expect(offsetFor(rule(), 2, 0, 'curse')).toEqual({ min: 120, max: 160 })
  })

  it('ignores an outcome the map does not have, rather than inventing one', () => {
    expect(offsetFor(rule(), 4, 0, 'nonsense')).toEqual({ min: 50, max: 160 })
  })

  it('collapses the chain when the anchor carries it', () => {
    // Three cycles in, so both branches are reachable and the union is genuinely wide.
    const ended = [anchor('ObjectiveEnded', '1', 100), anchor('ObjectiveEnded', '2', 200)]
    const union = anchorSet(...ended, anchor('ObjectiveEnded', '3', 300))
    const named = anchorSet(...ended, { ...anchor('ObjectiveEnded', '3', 300), outcome: 'tribute' })
    const bandOf = (a: typeof union) => {
      const c = walkChain(cursed, a, 310)!.pending.confidence
      return c.kind === 'Estimated' ? c.high - c.low : 0
    }
    expect(bandOf(named)).toBeLessThan(bandOf(union))
    expect(walkChain(cursed, named, 310)!.pending.at).toBe(300 + 70)
  })

  it('offers both resolutions only once the second is reachable', () => {
    // A curse needs three tributes, so the earliest cycle that can resolve as one is the
    // third — which predicts the fourth spawn.
    expect(reachableOutcomes(rule(), 3).map((o) => o.name)).toEqual(['tribute'])
    expect(reachableOutcomes(rule(), 4).map((o) => o.name).sort()).toEqual(['curse', 'tribute'])
  })
})
