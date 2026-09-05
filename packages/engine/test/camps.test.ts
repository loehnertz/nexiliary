import { describe, expect, it } from 'vitest'
import { isAvailable, isClaimable, project, suppressionState, view, walkChain } from '../src/index.js'
import type { CampState } from '../src/index.js'
import { anchor, anchorSet, braxis, tomb } from './fixtures.js'

const campOf = (states: readonly CampState[], id: string) => states.find((c) => c.id === id)!

describe('belief predicates', () => {
  it('rejects Known(false), which an "at least Likely" ordering would admit', () => {
    // Known(false) is the strongest belief in the lattice. Ordered by strength,
    // stall-camp would select a camp it knows is not there.
    expect(isAvailable({ kind: 'Known', value: false })).toBe(false)
    expect(isAvailable({ kind: 'Known', value: true })).toBe(true)
    expect(isAvailable({ kind: 'Likely', value: true, since: 0 })).toBe(true)
    expect(isAvailable({ kind: 'Likely', value: false, since: 0 })).toBe(false)
    expect(isAvailable({ kind: 'Stale' })).toBe(false)

    expect(isClaimable({ kind: 'Known', value: false })).toBe(true)
    expect(isClaimable({ kind: 'Stale' })).toBe(false)
  })
})

describe('camp availability', () => {
  it('is Known(false) with an exact countdown before first spawn', () => {
    const t = project(tomb, anchorSet(), 60)
    const camp = campOf(t.camps, 'siege-top')
    expect(camp.standing).toEqual({ kind: 'Known', value: false })
    expect(camp.nextUp?.at).toBe(120)
    expect(camp.nextUp?.confidence.kind).toBe('Exact')
  })

  it('decays from availableSince in the unanchored derivation', () => {
    const at = (now: number) => campOf(project(tomb, anchorSet(), now).camps, 'siege-top').standing.kind
    expect(at(130)).toBe('Known')
    expect(at(120 + 50)).toBe('Likely')
    expect(at(120 + 130)).toBe('Stale')
  })

  it('decays from availableSince in the anchored derivation too', () => {
    // Scoping decay to the no-anchor branch made one tap mark a camp Known forever,
    // reintroducing the exact bug the model exists to prevent.
    const anchors = anchorSet(anchor('CampTaken', 'siege-top:1', 300))
    const at = (now: number) => campOf(project(tomb, anchors, now).camps, 'siege-top')
    expect(at(400).standing).toEqual({ kind: 'Known', value: false })
    expect(at(400).nextUp?.at).toBe(480)
    expect(at(490).standing.kind).toBe('Known')
    expect(at(480 + 50).standing.kind).toBe('Likely')
    expect(at(480 + 130).standing.kind).toBe('Stale')
  })

  it('restores a Stale camp from a CampUp anchor', () => {
    const stale = campOf(project(tomb, anchorSet(), 400).camps, 'siege-top')
    expect(stale.standing.kind).toBe('Stale')

    const restored = campOf(
      project(tomb, anchorSet(anchor('CampUp', 'siege-top:1', 395)), 400).camps,
      'siege-top',
    )
    expect(restored.standing).toEqual({ kind: 'Known', value: true })
  })

  it('keeps a boss out of Stale for a whole match, via per-camp thresholds', () => {
    // One pair of global constants would make boss availability Stale in essentially
    // every match, silently killing the boss timer that features.md lists as v1. A
    // boss spawning around 5:00 in a twenty-minute match needs staleSeconds >= 900.
    for (let now = 300; now < 1200; now += 30) {
      expect(campOf(project(tomb, anchorSet(), now).camps, 'boss').standing.kind).not.toBe('Stale')
    }
    // The same clock does take an ordinary siege camp all the way to Stale.
    expect(campOf(project(tomb, anchorSet(), 1200).camps, 'siege-top').standing.kind).toBe('Stale')
  })
})

describe('camps suppressed during an objective phase', () => {
  const spawnAt = 90
  // The spawn is Exact, but the fight is not: the resolution band is the spawn's spread
  // combined with the fight's, which on the first cycle is the fight spread alone.
  const resolutionHigh = spawnAt + 70 + 25

  it('runs from the spawn, not from the resolution band', () => {
    // Camps vanish when the objective becomes active. A window opening at the band's
    // start would advise starting a camp through the time the objective is live.
    const before = suppressionState(braxis, walkChain(braxis, anchorSet(), 80), 80)
    expect(before.kind).not.toBe('active')
    const during = suppressionState(braxis, walkChain(braxis, anchorSet(), spawnAt + 5), spawnAt + 5)
    expect(during.kind).toBe('active')
    const end = suppressionState(braxis, walkChain(braxis, anchorSet(), resolutionHigh - 1), resolutionHigh - 1)
    expect(end.kind).toBe('active')
  })

  it('reads no camp as standing while a phase is believed active', () => {
    const t = project(braxis, anchorSet(), spawnAt + 30)
    for (const camp of t.camps) {
      expect(camp.standing).toEqual({ kind: 'Known', value: false })
      expect(isAvailable(camp.standing)).toBe(false)
    }
  })

  it('expires to Stale rather than pinning camps to Known(false)', () => {
    // The obvious reading, active until an anchor arrives, means one missed tap pins
    // every camp on the map to Known(false) for the rest of the match: a wrong claim
    // produced by forgetting, and one with no correction affordance.
    const now = resolutionHigh + 30
    const state = suppressionState(braxis, walkChain(braxis, anchorSet(), now), now)
    expect(state).toEqual({ kind: 'lifted', at: resolutionHigh, confirmed: false })

    const spawned = project(braxis, anchorSet(), now).camps.filter((c) => c.nextUp === undefined)
    expect(spawned.map((c) => c.id)).toEqual(['siege-top', 'bruiser'])
    for (const camp of spawned) expect(camp.standing.kind).toBe('Stale')

    // Stale stops the app claiming anything, but the chip that could correct it stays
    // in the view: an earlier version made Stale mean no chip, which deadlocked camp
    // coaching for the rest of the match after one missed tap.
    // The rail's slots 3 and 4 take claimable camps only, so a Stale chip lives in the
    // overflow camp list rather than on the rail.
    const v = view(project(braxis, anchorSet(), now), braxis, now)
    expect(v.overflowCamps.some((s) => s.camp?.stale === true)).toBe(true)
  })

  it('resets availableSince when suppression lifts, so camps do not emerge already Stale', () => {
    // A phase lasts well over two minutes against a 120 second threshold, so carrying
    // the pre-suppression value forward would kill camp coaching from the first
    // objective onward.
    const anchors = anchorSet(anchor('ObjectiveEnded', '1', 170))
    const spawned = project(braxis, anchors, 175).camps.filter((c) => c.nextUp === undefined)
    expect(spawned.map((c) => c.id)).toEqual(['siege-top', 'bruiser'])
    for (const camp of spawned) {
      expect(camp.availableSince).toBe(170)
      expect(camp.standing).toEqual({ kind: 'Known', value: true })
    }
  })
})
