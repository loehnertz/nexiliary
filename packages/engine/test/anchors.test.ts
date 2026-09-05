import { describe, expect, it } from 'vitest'
import {
  anchorKey,
  clearAnchor,
  campSubject,
  nextCampOccurrence,
  nextObjectiveCycle,
  objectiveEndedKeyFor,
  project,
  restoreAnchor,
  walkChain,
  writeAnchor,
} from '../src/index.js'
import type { AnchorSet } from '../src/index.js'
import { anchor, anchorSet, braxis } from './fixtures.js'

describe('anchor overwrite semantics', () => {
  it('replaces the entry for a key rather than appending', () => {
    let set: AnchorSet = anchorSet()
    set = writeAnchor(set, 'ObjectiveEnded:1', anchor('ObjectiveEnded', '1', 300, 1000))
    set = writeAnchor(set, 'ObjectiveEnded:1', anchor('ObjectiveEnded', '1', 320, 2000))
    expect(set.size).toBe(1)
    expect(set.get('ObjectiveEnded:1')!.gameTimeSeconds).toBe(320)
  })

  it('applies last-write-wins on wallClock, so a late peer anchor loses', () => {
    let set: AnchorSet = anchorSet()
    set = writeAnchor(set, 'ObjectiveEnded:1', anchor('ObjectiveEnded', '1', 320, 2000, 'local'))
    // Delivered later, but written earlier. It must not win.
    set = writeAnchor(set, 'ObjectiveEnded:1', anchor('ObjectiveEnded', '1', 300, 1000, 'peer'))
    expect(set.get('ObjectiveEnded:1')!.gameTimeSeconds).toBe(320)
    expect(set.get('ObjectiveEnded:1')!.source).toBe('local')
  })

  it('removes an entry on clear, the third legal operation on the set', () => {
    let set: AnchorSet = anchorSet(anchor('ObjectiveEnded', '1', 300))
    set = clearAnchor(set, 'ObjectiveEnded:1')
    expect(set.size).toBe(0)
  })

  it('lets revert bypass last-write-wins, since a restore is older than the mistap', () => {
    const good = anchor('ObjectiveEnded', '1', 300, 1000)
    const mistap = anchor('ObjectiveEnded', '1', 500, 9000)
    let set: AnchorSet = anchorSet(good)
    set = writeAnchor(set, 'ObjectiveEnded:1', mistap)
    expect(set.get('ObjectiveEnded:1')!.gameTimeSeconds).toBe(500)
    // A plain write would be rejected on wallClock and peers would keep the bad value.
    expect(writeAnchor(set, 'ObjectiveEnded:1', good).get('ObjectiveEnded:1')!.gameTimeSeconds).toBe(500)
    expect(restoreAnchor(set, 'ObjectiveEnded:1', good).get('ObjectiveEnded:1')!.gameTimeSeconds).toBe(300)
    expect(restoreAnchor(set, 'ObjectiveEnded:1', null).size).toBe(0)
  })
})

describe('cycle identity', () => {
  it('derives the index from the anchor count, not from the projection', () => {
    // The projection's belief comes from the same widening bands, so when bands
    // overlap it does not know which cycle is in progress either. Counting entries is
    // monotone and converges across peers.
    const one = anchorSet(anchor('ObjectiveEnded', '1', 300))
    expect(nextObjectiveCycle(one)).toBe(2)
    const two = anchorSet(anchor('ObjectiveEnded', '1', 300), anchor('ObjectiveEnded', '2', 600))
    expect(two.size).toBe(2)
    expect(nextObjectiveCycle(two)).toBe(3)
  })

  it('agrees between two clients with different projections but the same anchor set', () => {
    const set = anchorSet(anchor('ObjectiveEnded', '1', 300), anchor('ObjectiveEnded', '2', 600))
    // Two clients at wildly different clock positions.
    expect(walkChain(braxis, set, 610)!.pending.cycle).toBe(3)
    expect(nextObjectiveCycle(set)).toBe(3)
    expect(walkChain(braxis, set, 2000)!.pending.cycle).toBeGreaterThan(3)
    // Whatever either client's chain believes, the key they would write is the same.
    expect(objectiveEndedKeyFor(set, 900, 130)).toBe('ObjectiveEnded:3')
  })

  it('overwrites rather than opening a cycle on a near-simultaneous second tap', () => {
    // Two teammates tapping the same objective a couple of seconds apart, with the
    // second computing its index against a set that already contains the first, would
    // otherwise write two entries for one occurrence and inflate every later cycle.
    const set = anchorSet(anchor('ObjectiveEnded', '1', 300))
    expect(objectiveEndedKeyFor(set, 303, 130)).toBe('ObjectiveEnded:1')
    expect(objectiveEndedKeyFor(set, 300 + 130, 130)).toBe('ObjectiveEnded:2')
    expect(objectiveEndedKeyFor(set, 600, 130)).toBe('ObjectiveEnded:2')
  })

  it('leaves the count one short after a missed tap, without moving any timing', () => {
    // The chain walks from the anchor's time rather than its index.
    const missed = anchorSet(anchor('ObjectiveEnded', '1', 600))
    const complete = anchorSet(anchor('ObjectiveEnded', '1', 300), anchor('ObjectiveEnded', '2', 600))
    expect(walkChain(braxis, missed, 610)!.pending.at).toBe(walkChain(braxis, complete, 610)!.pending.at)
    // Only the index differs, which is what `possibleFromCycle` gating reads.
    expect(walkChain(braxis, missed, 610)!.pending.cycle).toBe(2)
    expect(walkChain(braxis, complete, 610)!.pending.cycle).toBe(3)
  })

  it('numbers camp occurrences from the anchor set', () => {
    let set: AnchorSet = anchorSet()
    expect(nextCampOccurrence(set, 'CampTaken', 'siege-top')).toBe(1)
    set = writeAnchor(
      set,
      anchorKey('CampTaken', campSubject('siege-top', 1)),
      anchor('CampTaken', 'siege-top:1', 200),
    )
    expect(nextCampOccurrence(set, 'CampTaken', 'siege-top')).toBe(2)
    expect(nextCampOccurrence(set, 'CampTaken', 'bruiser')).toBe(1)
  })
})

describe('unrecognised anchor types', () => {
  it('stores and ignores them rather than forcing them through', () => {
    const set = anchorSet(anchor('SomethingNewer', 'x:1', 200))
    expect(() => project(braxis, set, 300)).not.toThrow()
    expect(project(braxis, set, 300).events.length).toBeGreaterThan(0)
  })
})
