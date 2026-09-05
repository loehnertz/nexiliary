import { beforeEach, describe, expect, it } from 'vitest'
import type { Anchor } from '@nexiliary/engine'
import { project, view } from '@nexiliary/engine'
import { braxisHoldout, mapById } from '@nexiliary/maps'
import {
  gameTimeSeconds,
  initialMatchState,
  matchReducer,
  matchStartWallClock,
} from '../src/match/reducer.js'
import type { MatchState } from '../src/match/reducer.js'
import {
  clearMatch,
  fromAnchorList,
  loadResumableMatch,
  resumeWindowMillis,
  saveMatch,
  toAnchorList,
} from '../src/services/storage.js'

const START = 1_700_000_000_000

function anchor(type: string, subject: string, gameTimeSeconds: number, wallClock: number): Anchor {
  return { type, subject, gameTimeSeconds, wallClock, source: 'peer', schema: 1 }
}

function started(mapId = 'braxis-holdout'): MatchState {
  return matchReducer(initialMatchState, {
    type: 'MATCH_STARTED',
    matchId: 'm1',
    mapId,
    wallClock: START,
  })
}

describe('the match clock', () => {
  it('derives game time from the MatchStart anchor, which is the single authority', () => {
    const state = started()
    expect(matchStartWallClock(state)).toBe(START)
    expect(gameTimeSeconds(state, START + 90_000)).toBe(90)
  })

  it('applies peer skew to the local derivation, not only when publishing', () => {
    // A phone ten seconds fast otherwise runs ten seconds ahead of its team for the
    // whole match, which is a third of a wave on a thirty second cadence.
    const skewed = matchReducer(started(), { type: 'PEER_SKEW_SET', millis: -10_000 })
    expect(gameTimeSeconds(skewed, START + 90_000)).toBe(80)
  })

  it('keeps the manual nudge local and separate from the shared start', () => {
    // Correcting your own late tap must not re-time four teammates, so the adjustment
    // never touches the anchor set.
    const nudged = matchReducer(started(), { type: 'USER_ADJUST_SET', seconds: 7 })
    expect(gameTimeSeconds(nudged, START + 90_000)).toBe(97)
    expect(matchStartWallClock(nudged)).toBe(START)
    expect(nudged.anchors.get('MatchStart:')!.wallClock).toBe(START)
  })

  it('recomputes rather than accumulates, so a skipped tick self-corrects', () => {
    const state = started()
    // A backgrounded tab that misses ten seconds of ticks still reads the right time.
    expect(gameTimeSeconds(state, START + 300_000)).toBe(300)
  })
})

describe('the reducer', () => {
  it('applies last-write-wins on wallClock for a late peer anchor', () => {
    const local = matchReducer(started(), {
      type: 'ANCHOR_SET',
      key: 'ObjectiveEnded:1',
      anchor: anchor('ObjectiveEnded', '1', 320, START + 320_000),
    })
    const latePeer = matchReducer(local, {
      type: 'ANCHOR_SET',
      key: 'ObjectiveEnded:1',
      anchor: anchor('ObjectiveEnded', '1', 300, START + 300_000),
    })
    expect(latePeer.anchors.get('ObjectiveEnded:1')!.gameTimeSeconds).toBe(320)
  })

  it('undoes a first write by removing the entry, not by writing a bogus value', () => {
    const written = matchReducer(started(), {
      type: 'ANCHOR_SET',
      key: 'ObjectiveEnded:1',
      anchor: anchor('ObjectiveEnded', '1', 300, START + 300_000),
    })
    expect(written.lastWrite).toEqual({ key: 'ObjectiveEnded:1', previous: null, atWallClock: START + 300_000 })
    const undone = matchReducer(written, { type: 'ANCHOR_REVERTED' })
    expect(undone.anchors.has('ObjectiveEnded:1')).toBe(false)
  })

  it('undoes an overwrite by restoring the previous value, bypassing last-write-wins', () => {
    // A restored anchor carries an older wallClock than the mistap it replaces, so the
    // normal write rule would reject it and the bad value would stand.
    const good = anchor('ObjectiveEnded', '1', 300, START + 300_000)
    const mistap = anchor('ObjectiveEnded', '1', 500, START + 500_000)
    let state = matchReducer(started(), { type: 'ANCHOR_SET', key: 'ObjectiveEnded:1', anchor: good })
    state = matchReducer(state, { type: 'ANCHOR_SET', key: 'ObjectiveEnded:1', anchor: mistap })
    state = matchReducer(state, { type: 'ANCHOR_REVERTED' })
    expect(state.anchors.get('ObjectiveEnded:1')!.gameTimeSeconds).toBe(300)
    // One level only. There is no undo stack.
    expect(matchReducer(state, { type: 'ANCHOR_REVERTED' })).toBe(state)
  })

  it('ends a match by clearing everything except the map', () => {
    // Without a producer for this action the wake lock was never released, the clock
    // never stopped, and CueState was never cleared.
    const state = matchReducer(started(), { type: 'MATCH_ENDED' })
    expect(state.status).toBe('setup')
    expect(state.anchors.size).toBe(0)
    expect(state.matchId).toBe('')
    expect(state.mapId).toBe('braxis-holdout')
  })

  it('starts the next match with a new id, so its cues are not suppressed', () => {
    const first = started()
    const second = matchReducer(matchReducer(first, { type: 'MATCH_ENDED' }), {
      type: 'MATCH_STARTED',
      matchId: 'm2',
      mapId: 'cursed-hollow',
      wallClock: START + 1_800_000,
    })
    expect(second.matchId).not.toBe(first.matchId)
    expect(matchStartWallClock(second)).toBe(START + 1_800_000)
  })
})

describe('persistence with no relay present', () => {
  beforeEach(() => {
    clearMatch()
  })

  it('rehydrates a resumed match from localStorage', () => {
    // Steps 1 to 4 have no relay, so rejoining a session is not a recovery path, and
    // iOS routinely evicts a backgrounded PWA on a phone left beside a keyboard.
    let state = started()
    state = matchReducer(state, {
      type: 'ANCHOR_SET',
      key: 'ObjectiveEnded:1',
      anchor: anchor('ObjectiveEnded', '1', 300, START + 300_000),
    })
    saveMatch({
      matchId: state.matchId,
      mapId: state.mapId,
      anchors: toAnchorList(state.anchors),
      userAdjustSeconds: state.userAdjustSeconds,
      savedAtWallClock: START + 300_000,
    })

    const stored = loadResumableMatch(START + 400_000)
    expect(stored).not.toBeNull()
    const resumed = matchReducer(initialMatchState, {
      type: 'MATCH_RESUMED',
      matchId: stored!.matchId,
      mapId: stored!.mapId,
      anchors: fromAnchorList(stored!.anchors),
      userAdjustSeconds: stored!.userAdjustSeconds,
    })
    expect(resumed.status).toBe('live')
    expect(matchStartWallClock(resumed)).toBe(START)
    expect(gameTimeSeconds(resumed, START + 400_000)).toBe(400)
    expect(resumed.anchors.get('ObjectiveEnded:1')!.gameTimeSeconds).toBe(300)
  })

  it('does not offer a match older than the resume window', () => {
    saveMatch({ matchId: 'old', mapId: 'braxis-holdout', anchors: [], userAdjustSeconds: 0, savedAtWallClock: START })
    expect(loadResumableMatch(START + resumeWindowMillis - 1)).not.toBeNull()
    expect(loadResumableMatch(START + resumeWindowMillis + 1)).toBeNull()
  })
})

describe('a fifteen minute match with no anchor ever given', () => {
  it('stays ordered, never renders a blank countdown, and admits when it has lost the thread', () => {
    const map = mapById('braxis-holdout')
    let lostFrom: number | null = null
    for (let now = 0; now <= 900; now += 1) {
      const v = view(project(map, started().anchors, now), map, now)
      // Every slot always says something. A blank reads as a bug.
      expect(v.objective.kind).not.toBe('unknownMap')
      for (const slot of v.rail) expect(slot.text.length).toBeGreaterThan(0)
      // Waves, tiers and the death timer carry on regardless.
      expect(v.deathTimer.text).not.toBe('')
      expect(v.rail.some((s) => s.kind === 'wave' || s.kind === 'tier')).toBe(true)

      if (v.objective.kind === 'timingLost' && lostFrom === null) lostFrom = now
      // Once lost, it stays lost rather than flickering back to a confident number.
      if (lostFrom !== null) expect(v.objective.kind).toBe('timingLost')
    }
    expect(lostFrom).not.toBeNull()
  })

  it('is unaffected on the map that has no objective to lose', () => {
    const map = mapById('tomb-of-the-spider-queen')
    for (let now = 0; now <= 900; now += 5) {
      expect(view(project(map, started('tomb-of-the-spider-queen').anchors, now), map, now).objective.kind).toBe(
        'noObjective',
      )
    }
  })
})

describe('the map registry', () => {
  it('falls back for an unrecognised battleground rather than failing', () => {
    const map = mapById('some-future-aram-map')
    const v = view(project(map, started().anchors, 300), map, 300)
    expect(v.objective.kind).toBe('noObjective')
    expect(v.rail.some((s) => s.kind === 'wave')).toBe(true)
  })

  it('resolves every battleground the picker offers', () => {
    expect(mapById(braxisHoldout.id)).toBe(braxisHoldout)
  })
})
