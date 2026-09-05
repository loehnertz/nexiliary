import { describe, expect, it } from 'vitest'
import { deathTimerSeconds, levelCurve, project, validUntilFallbackSeconds } from '../src/index.js'
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
    // projection stays valid until the end of the block already emitted. What does
    // change is a camp's `standing`, so the first camp spawn at 2:00 wins here.
    expect(project(tomb, anchorSet(), 10).validUntil).toBe(120)
    // Once that camp is up, its decay boundary at 2:00 + 45 is the next thing to move.
    expect(project(tomb, anchorSet(), 125).validUntil).toBe(165)
    // Then its stale boundary at 2:00 + 120.
    expect(project(tomb, anchorSet(), 170).validUntil).toBe(240)
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
