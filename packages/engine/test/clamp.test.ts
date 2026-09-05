import { describe, expect, it } from 'vitest'
import { applyPresentClamp, clampEvent, project, view, walkChain } from '../src/index.js'
import type { TimedEvent } from '../src/index.js'
import { anchor, anchorSet, braxis } from './fixtures.js'

function estimatedBand(e: TimedEvent): { low: number; high: number } {
  if (e.confidence.kind !== 'Estimated') throw new Error(`expected Estimated, got ${e.confidence.kind}`)
  return { low: e.confidence.low, high: e.confidence.high }
}

describe('the present clamp', () => {
  const anchors = anchorSet(anchor('ObjectiveEnded', '1', 300))

  it('translates the interval rather than compressing it', () => {
    // The worked example: anchor at 5:00, first unanchored cycle at 630 with band
    // 600-660, evaluated at now = 640.
    const now = 640
    const walk = walkChain(braxis, anchors, now)!
    expect(walk.pending.at).toBe(630)
    expect(walk.pending.spread).toBe(25)

    const timeline = applyPresentClamp(project(braxis, anchors, now), now)
    const spawn = timeline.events.find((e) => e.role === 'spawn' && e.cycle === 3)!
    const { low, high } = estimatedBand(spawn)

    // Ordered, never inverted. A one-sided clamp gives low 770 against high 660, and
    // because the width is negative it never exceeds maxUsefulBand, so the event stays
    // amber and confident-looking: the safety net defeated by its own sign.
    expect(low).toBeLessThanOrEqual(high)
    expect(low).toBeLessThanOrEqual(spawn.at)
    expect(spawn.at).toBeLessThanOrEqual(high)

    // Width preserved. A width assertion alone passes while the band collapses to
    // zero, which is how the compressing version would have shipped.
    expect(high - low).toBeGreaterThanOrEqual(2 * walk.pending.spread)
    expect(low).toBe(now + 130)
  })

  it('never narrows the band on a scalar-offset map', () => {
    for (let now = 430; now < 1400; now += 7) {
      const walk = walkChain(braxis, anchors, now)!
      if (walk.pending.confidence.kind !== 'Estimated') continue
      const timeline = applyPresentClamp(project(braxis, anchors, now), now)
      for (const e of timeline.events) {
        if (e.role !== 'spawn' || e.confidence.kind !== 'Estimated') continue
        const { low, high } = estimatedBand(e)
        expect(high - low).toBeGreaterThan(0)
        expect(low).toBeLessThanOrEqual(e.at)
        expect(e.at).toBeLessThanOrEqual(high)
      }
      expect(2 * walk.pending.spread).toBeGreaterThan(0)
    }
  })

  it('leaves confidence alone, including once it has become Unknown', () => {
    const now = 1800
    const raw = project(braxis, anchors, now)
    const clamped = applyPresentClamp(raw, now)
    for (let i = 0; i < raw.events.length; i += 1) {
      expect(clamped.events[i]!.confidence.kind).toBe(raw.events[i]!.confidence.kind)
    }
  })

  it('does not clamp the cycle immediately after an anchor', () => {
    // Its predecessor's resolution was observed, so "no sooner than now plus the
    // offset" is simply false there. Clamping it would push an Exact spawn forward.
    const now = 400
    const timeline = applyPresentClamp(project(braxis, anchors, now), now)
    const spawn = timeline.events.find((e) => e.role === 'spawn' && e.cycle === 2)!
    expect(spawn.at).toBe(430)
    expect(spawn.offsetMin).toBeUndefined()
  })

  it('leaves an event with no offsets untouched', () => {
    const e: TimedEvent = { id: 'wave:1', kind: 'wave', label: 'Wave', at: 30, confidence: { kind: 'Exact' } }
    expect(clampEvent(e, 25)).toBe(e)
  })

  it('is absent from project, so the chain still advances', () => {
    // Advancement and the clamp read the same silence and draw opposite conclusions.
    // Evaluated in one place they cancel: if the clamp raises `high` to now+offsetMax
    // before advancement is tested, `now > high` is never true and the chain freezes.
    const early = project(braxis, anchors, 900)
    const late = project(braxis, anchors, 950)
    const spawnAt = (t: typeof early) => t.events.find((e) => e.role === 'spawn')!.at

    // Projected times do not move as the clock advances. Only the clamp moves.
    expect(spawnAt(early)).toBe(spawnAt(late))
    expect(estimatedBand(applyPresentClamp(early, 900).events.find((e) => e.role === 'spawn')!).low)
      .toBeLessThan(
        estimatedBand(applyPresentClamp(late, 950).events.find((e) => e.role === 'spawn')!).low,
      )

    // And the chain keeps advancing under a binding clamp rather than sitting on a
    // confident Exact objective at now + offset forever.
    const cycles = [900, 1400, 1900].map((now) => project(braxis, anchors, now).events.find((e) => e.role === 'spawn')!.cycle!)
    expect(cycles[1]!).toBeGreaterThan(cycles[0]!)
    expect(cycles[2]!).toBeGreaterThan(cycles[1]!)
  })
})

describe('view', () => {
  it('renders the timing-lost state rather than a blank countdown', () => {
    const timeline = project(braxis, anchorSet(anchor('ObjectiveEnded', '1', 300)), 1800)
    const v = view(timeline, braxis, 1800)
    expect(v.objective.kind).toBe('timingLost')
  })

  it('renders the no-objective state, not the unknown-map fallback', async () => {
    const { tomb, unknownMap } = await import('./fixtures.js')
    expect(view(project(tomb, anchorSet(), 300), tomb, 300).objective.kind).toBe('noObjective')
    expect(view(project(unknownMap, anchorSet(), 300), unknownMap, 300).objective.kind).toBe('noObjective')
  })

  it('never fills the rail with waves alone', () => {
    const v = view(project(braxis, anchorSet(), 200), braxis, 200)
    expect(v.rail).toHaveLength(4)
    expect(v.rail.filter((s) => s.kind === 'wave').length).toBeLessThanOrEqual(2)
  })
})
