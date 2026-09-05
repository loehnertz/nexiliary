import { describe, expect, it } from 'vitest'
import { clampBandSeconds, project, view } from '../src/index.js'
import type { Confidence, Timeline } from '../src/index.js'
import { anchor, anchorSet, braxis, tomb, withProvenance } from './fixtures.js'

const spawn = (t: Timeline) => t.events.find((e) => e.role === 'spawn')!
const wave = (t: Timeline) => t.events.find((e) => e.kind === 'wave')!
const tier = (t: Timeline) => t.events.find((e) => e.kind === 'tier')!
const width = (c: Confidence) => (c.kind === 'Estimated' ? c.high - c.low : 0)

describe('the provenance clamp', () => {
  it('leaves a verified map alone', () => {
    const t = project(braxis, anchorSet(), 30)
    expect(spawn(t).confidence.kind).toBe('Exact')
  })

  it('turns a map-derived Exact into Estimated on a published map', () => {
    const t = project(withProvenance(braxis, 'published'), anchorSet(), 30)
    const s = spawn(t)
    expect(s.confidence).toEqual({ kind: 'Estimated', low: 90 - clampBandSeconds, high: 90 + clampBandSeconds })
  })

  it('treats archive exactly as published', () => {
    const a = project(withProvenance(braxis, 'archive'), anchorSet(), 30)
    const p = project(withProvenance(braxis, 'published'), anchorSet(), 30)
    expect(spawn(a).confidence).toEqual(spawn(p).confidence)
  })

  it('widens an already-Estimated band rather than replacing it', () => {
    // The two uncertainties are independent: the map constant being unverified does
    // not remove the behavioural spread.
    const anchors = anchorSet(anchor('ObjectiveEnded', '1', 300))
    const verified = project(braxis, anchors, 700)
    const published = project(withProvenance(braxis, 'published'), anchors, 700)
    expect(width(spawn(published).confidence)).toBe(width(spawn(verified).confidence) + 2 * clampBandSeconds)
  })

  it('clamps camp respawns as well as objectives', () => {
    const anchors = anchorSet(anchor('CampTaken', 'siege-top:1', 300))
    const t = project(withProvenance(tomb, 'published'), anchors, 400)
    const camp = t.camps.find((c) => c.id === 'siege-top')!
    expect(camp.nextUp!.confidence.kind).toBe('Estimated')
  })

  it('exempts waves, tiers, the death timer and the level at every level', () => {
    // A wrong map file cannot make a game-wide rule wrong. Read literally, an
    // unexempted clamp would downgrade waves, which is nonsense.
    for (const p of ['verified', 'archive', 'published', 'unknown'] as const) {
      const t = project(withProvenance(braxis, p), anchorSet(), 200)
      expect(wave(t).confidence.kind).toBe('Exact')
      expect(tier(t).confidence.kind).toBe('Estimated')
      expect(t.deathTimer.confidence.kind).not.toBe('Unknown')
      expect(t.level.confidence.kind).toBe('Estimated')
    }
  })

  it('drops map-derived events entirely under unknown provenance', () => {
    const t = project(withProvenance(braxis, 'unknown'), anchorSet(), 200)
    expect(t.events.some((e) => e.kind === 'objective')).toBe(false)
    expect(t.events.some((e) => e.kind === 'camp')).toBe(false)
    expect(t.events.some((e) => e.kind === 'wave')).toBe(true)
    expect(t.events.some((e) => e.kind === 'tier')).toBe(true)
  })

  it('clamps Belief too, so a pre-first-spawn Known(false) is not a confident negative', () => {
    const t = project(withProvenance(tomb, 'unknown'), anchorSet(), 60)
    for (const camp of t.camps) {
      expect(camp.standing).toEqual({ kind: 'Stale' })
      expect(camp.nextUp).toBeUndefined()
    }
  })

  it('collapses rail slots 1, 3 and 4 on an unknown map', () => {
    const map = withProvenance(braxis, 'unknown')
    const v = view(project(map, anchorSet(), 200), map, 200)
    expect(v.rail.some((s) => s.kind === 'camp')).toBe(false)
    expect(v.rail.some((s) => s.kind === 'wave')).toBe(true)
    expect(v.rail.some((s) => s.kind === 'tier')).toBe(true)
  })
})
