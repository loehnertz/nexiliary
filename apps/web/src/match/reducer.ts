import type { Anchor, AnchorSet, Millis, Seconds } from '@nexiliary/engine'
import { clearAnchor, restoreAnchor, writeAnchor } from '@nexiliary/engine'

export interface LastWrite {
  readonly key: string
  /** null when the key had no previous value, so undo is a deletion. */
  readonly previous: Anchor | null
  readonly atWallClock: Millis
}

export interface MatchState {
  readonly status: 'setup' | 'live'
  readonly matchId: string
  readonly mapId: string
  readonly anchors: AnchorSet
  /**
   * The manual nudge. Local, and never published: correcting your own late tap must
   * not re-time four teammates.
   */
  readonly userAdjustSeconds: Seconds
  /**
   * The device clock difference negotiated with the relay. Applied to the local
   * derivation and not only when publishing, or a phone ten seconds fast runs ten
   * seconds ahead of its team for the whole match, which is a third of a wave.
   */
  readonly peerSkewMillis: Millis
  readonly lastWrite: LastWrite | null
}

export type MatchAction =
  | { type: 'MATCH_STARTED'; matchId: string; mapId: string; wallClock: Millis }
  | { type: 'MATCH_RESUMED'; matchId: string; mapId: string; anchors: AnchorSet; userAdjustSeconds: Seconds }
  | { type: 'ANCHOR_SET'; key: string; anchor: Anchor }
  | { type: 'ANCHOR_CLEARED'; key: string }
  | { type: 'ANCHORS_REPLACED'; anchors: AnchorSet }
  | { type: 'ANCHOR_REVERTED' }
  | { type: 'USER_ADJUST_SET'; seconds: Seconds }
  | { type: 'PEER_SKEW_SET'; millis: Millis }
  | { type: 'MATCH_ENDED' }

export const initialMatchState: MatchState = {
  status: 'setup',
  matchId: '',
  mapId: '',
  anchors: new Map(),
  userAdjustSeconds: 0,
  peerSkewMillis: 0,
  lastWrite: null,
}

/** The window in which undo is offered. A mistapped objective is noticed when the
 * countdown looks wrong half a minute later, not within a transient. */
export const undoWindowMillis = 60_000

export function matchReducer(state: MatchState, action: MatchAction): MatchState {
  switch (action.type) {
    case 'MATCH_STARTED': {
      // The MatchStart anchor is the session's start time and the single authority for
      // when the match began. Three write paths for one fact caused real ambiguity.
      const anchor: Anchor = {
        type: 'MatchStart',
        subject: '',
        gameTimeSeconds: 0,
        wallClock: action.wallClock,
        source: 'local',
        schema: 1,
      }
      return {
        ...initialMatchState,
        status: 'live',
        matchId: action.matchId,
        mapId: action.mapId,
        anchors: new Map([['MatchStart:', anchor]]),
      }
    }

    case 'MATCH_RESUMED':
      return {
        ...initialMatchState,
        status: 'live',
        matchId: action.matchId,
        mapId: action.mapId,
        anchors: action.anchors,
        userAdjustSeconds: action.userAdjustSeconds,
      }

    case 'ANCHOR_SET': {
      // Last-write-wins on wallClock, the same rule the relay uses, so a late-delivered
      // peer anchor cannot overwrite a newer local one.
      const previous = state.anchors.get(action.key) ?? null
      const anchors = writeAnchor(state.anchors, action.key, action.anchor)
      if (anchors === state.anchors) return state
      return {
        ...state,
        anchors,
        lastWrite: { key: action.key, previous, atWallClock: action.anchor.wallClock },
      }
    }

    case 'ANCHOR_CLEARED':
      return { ...state, anchors: clearAnchor(state.anchors, action.key), lastWrite: null }

    case 'ANCHORS_REPLACED':
      // `state` from the relay is applied as replace, which is why a session is seeded
      // with the creating client's anchors rather than starting empty.
      return { ...state, anchors: action.anchors, lastWrite: null }

    case 'ANCHOR_REVERTED': {
      if (state.lastWrite === null) return state
      // Reverting bypasses last-write-wins: a restored anchor carries an older
      // wallClock than the mistap it replaces, so the normal rule would reject it.
      return {
        ...state,
        anchors: restoreAnchor(state.anchors, state.lastWrite.key, state.lastWrite.previous),
        lastWrite: null,
      }
    }

    case 'USER_ADJUST_SET':
      return { ...state, userAdjustSeconds: action.seconds }

    case 'PEER_SKEW_SET':
      return { ...state, peerSkewMillis: action.millis }

    case 'MATCH_ENDED':
      // Keeps the session open and returns to setup. Without a producer for this action
      // the wake lock was never released, the clock never stopped, and CueState was
      // never cleared.
      return { ...initialMatchState, mapId: state.mapId }
  }
}

/** Derived from the anchor set, never stored separately. */
export function matchStartWallClock(state: MatchState): Millis | null {
  return state.anchors.get('MatchStart:')?.wallClock ?? null
}

/**
 * Recomputed from the wall clock rather than incremented, so a throttled or skipped
 * tick self-corrects instead of falling permanently behind. A phone beside a keyboard
 * is exactly the backgrounded-tab case browsers throttle hardest.
 */
export function gameTimeSeconds(state: MatchState, nowMillis: Millis): Seconds {
  const start = matchStartWallClock(state)
  if (start === null) return 0
  return (nowMillis + state.peerSkewMillis - start) / 1000 + state.userAdjustSeconds
}
