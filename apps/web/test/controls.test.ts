import { describe, expect, it } from 'vitest'
import { buildContext, project } from '@nexiliary/engine'
import { cursedHollow, gardenOfTerror } from '@nexiliary/maps'
import { offersFor } from '../src/controls/registry.js'

function endedOffers(map: Parameters<typeof project>[0], now: number) {
  const ctx = buildContext(map, project(map, new Map(), now), now)
  return offersFor('primary', ctx)
    .filter((o) => o.key.startsWith('objective-ended'))
    .map((o) => o.label)
}

describe('the objective-ended button', () => {
  it('names the resolution that can actually have happened yet', () => {
    // Garden of Terror's first phase runs from 2:30. Seeds keep spawning until a team has
    // three, so on the first cycle no Terror has ever existed — a button asking the player
    // to confirm one died is one they can only ignore, and ignoring it is what leaves the
    // map with no anchor at all.
    expect(endedOffers(gardenOfTerror, 200)).toEqual(['Seeds gone'])
  })

  it('offers both resolutions once the second becomes reachable', () => {
    // Terrors need three seeds, so the third resolution is the earliest that can produce
    // them, and that is the one predicting the fourth spawn.
    const late = endedOffers(gardenOfTerror, 900)
    expect(late).toContain('Seeds gone')
    expect(late).toContain('Terror died')
  })

  it('still names the single resolution on a map whose branches agree', () => {
    // Cursed Hollow was never wrong, because its map-level label happened to match its
    // first outcome. This pins that it stays right for the right reason now.
    expect(endedOffers(cursedHollow, 220)).toEqual(['Tribute taken'])
  })
})
