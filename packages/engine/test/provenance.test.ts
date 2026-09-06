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

  it('offers no camp controls on an unknown map', () => {
    // A chip there would write an anchor read back through respawn figures the clamp has
    // already declared worthless.
    const map = withProvenance(braxis, 'unknown')
    const v = view(project(map, anchorSet(), 200), map, 200)
    expect(v.camps).toEqual([])
    // A timed map with no data is the unknown-map state, distinct from a map that has
    // no objective at all.
    expect(v.objective.kind).toBe('unknownMap')
  })
})

describe('nothing map-derived escapes the clamp', () => {
  it('renders nothing as Exact on a published map except the game-wide floor', () => {
    // The phase belief leaked past the clamp once, so this is a sweep rather than a
    // named case: across a whole match, on every path the view can take, the only green
    // thing on an unverified map is a minion wave.
    const map = withProvenance(braxis, 'published')
    for (let now = 0; now < 1800; now += 3) {
      const t = project(map, anchorSet(), now)
      expect(t.objectivePhase.kind === 'active' ? t.objectivePhase.confidence.kind : 'Estimated')
        .not.toBe('Exact')
      for (const event of t.events) {
        if (event.kind === 'wave') continue
        expect(event.confidence.kind, `${event.id} at ${now}`).not.toBe('Exact')
      }
      for (const camp of t.camps) {
        if (camp.nextUp === undefined) continue
        expect(camp.nextUp.confidence.kind, `${camp.id} at ${now}`).not.toBe('Exact')
      }

      const v = view(t, map, now)
      if (v.objective.kind === 'live') expect(v.objective.tone).not.toBe('exact')
      if (v.objective.kind === 'countdown') expect(v.objective.countdown.tone).not.toBe('exact')
      if (v.following !== null) expect(v.following.tone, `following at ${now}`).not.toBe('exact')
      for (const chip of v.camps) {
        // `UP` is a Belief, not a map-derived time, so it keeps its own colour.
        if (chip.state === 'up') continue
        expect(chip.tone, `camp ${chip.id} at ${now}`).not.toBe('exact')
      }
    }
  })

  it('does render Exact once a map has been hand-timed and verified', () => {
    // The other half: the clamp must not be the reason nothing is ever exact.
    const t = project(braxis, anchorSet(), 60)
    expect(t.objectivePhase.kind).toBe('idle')
    expect(view(t, braxis, 60).objective.kind).toBe('countdown')
    const live = project(braxis, anchorSet(), 120)
    expect(live.objectivePhase.kind === 'active' && live.objectivePhase.confidence.kind).toBe('Exact')
  })
})
