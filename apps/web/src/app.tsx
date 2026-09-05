import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  anchorKey,
  buildContext,
  campSubject,
  cues,
  evaluateCues,
  newCueState,
  nextCampOccurrence,
  objectiveEndedKeyFor,
  mmss,
  offsetFor,
  view,
} from '@nexiliary/engine'
import type { Anchor, CueState, Prompt, PromptSettings } from '@nexiliary/engine'
import { battlegrounds, cueText, mapById } from '@nexiliary/maps'
import {
  gameTimeSeconds,
  initialMatchState,
  matchReducer,
  undoWindowMillis,
} from './match/reducer.js'
import { useWallClock } from './hooks/use-now.js'
import { useTimeline } from './hooks/use-timeline.js'
import {
  clearMatch,
  fromAnchorList,
  loadRecentMaps,
  isFreshEnoughToAutoResume,
  loadResumableMatch,
  loadSettings,
  noteMapPlayed,
  saveMatch,
  saveSettings,
  toAnchorList,
} from './services/storage.js'
import type { StoredMatch, StoredSettings } from './services/storage.js'
import { initSpeech, speak, stopSpeech, unlockSpeech } from './services/speech.js'
import { installWakeLockRecovery, releaseWakeLock, requestWakeLock } from './services/wake-lock.js'
import { Frame } from './components/chrome.js'
import { Footer, Header, ObjectivePanel, PromptBar, Rail, Rule } from './components/live-panel.js'
import { ClockAdjustSheet, OverflowSheet } from './components/sheets.js'
import { Setup } from './components/setup.js'
import { offersFor } from './controls/registry.js'
import { buildMatchLog } from './services/match-log.js'

type Sheet = 'none' | 'clock' | 'overflow'

/**
 * How long a fired prompt stays on screen. Long enough to read at a glance mid-fight,
 * short enough that the panel is not carrying stale advice into the next decision.
 */
const promptDisplaySeconds = 8

export function App() {
  const [state, dispatch] = useReducer(matchReducer, initialMatchState)
  const [settings, setSettings] = useState<StoredSettings>(loadSettings)
  const [recentMaps, setRecentMaps] = useState<readonly string[]>(loadRecentMaps)
  const [sheet, setSheet] = useState<Sheet>('none')
  const [resumable, setResumable] = useState<StoredMatch | null>(null)

  const live = state.status === 'live'
  const wallClock = useWallClock(250, live)
  const now = gameTimeSeconds(state, wallClock)
  const map = useMemo(() => mapById(state.mapId), [state.mapId])
  const timeline = useTimeline(map, state.anchors, now)

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  // Persisting the live match is a few lines and contradicts nothing. Phones evict a
  // backgrounded tab freely, and a locked screen is the normal case for this app.
  //
  // Saving only on anchor changes was not enough: a match can run for minutes without a
  // tap, and that is exactly when it gets killed, so the stored save went stale and the
  // match fell outside the auto-resume window. It is written on every change, on a slow
  // heartbeat, and — the one that matters — the moment the page is hidden, which is the
  // last code that runs before a discard.
  const persist = useCallback(() => {
    if (!live) return
    saveMatch({
      matchId: state.matchId,
      mapId: state.mapId,
      anchors: toAnchorList(state.anchors),
      userAdjustSeconds: state.userAdjustSeconds,
      savedAtWallClock: Date.now(),
    })
  }, [live, state.matchId, state.mapId, state.anchors, state.userAdjustSeconds])

  useEffect(() => {
    persist()
    if (!live) return
    const heartbeat = window.setInterval(persist, 15_000)
    const onHide = () => {
      if (document.visibilityState === 'hidden') persist()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', persist)
    return () => {
      window.clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', persist)
    }
  }, [live, persist])

  const writeAnchorAt = useCallback(
    (type: string, subject: string, key?: string) => {
      const anchor: Anchor = {
        type,
        subject,
        gameTimeSeconds: now,
        // Session epoch, not device epoch: last-write-wins compares this across
        // devices, so a device-epoch value would resolve conflicts by whose phone is
        // fastest.
        wallClock: Date.now() + state.peerSkewMillis,
        source: 'local',
        schema: 1,
      }
      dispatch({ type: 'ANCHOR_SET', key: key ?? anchorKey(type, subject), anchor })
    },
    [now, state.peerSkewMillis],
  )

  const onObjectiveEnded = useCallback(() => {
    // A near-simultaneous second tap overwrites rather than opening a cycle, judged
    // against the map's own minimum respawn offset.
    const coalesce =
      map.objective.kind === 'timed' ? offsetFor(map.objective.respawn, 1, now).min : 60
    const key = objectiveEndedKeyFor(state.anchors, now, coalesce)
    const subject = key.slice('ObjectiveEnded:'.length)
    writeAnchorAt('ObjectiveEnded', subject, key)
  }, [map, now, state.anchors, writeAnchorAt])

  const onObjectiveSpawned = useCallback(
    (cycle: string) => writeAnchorAt('ObjectiveSpawned', cycle),
    [writeAnchorAt],
  )

  const onCampTaken = useCallback(
    (campId: string) => {
      writeAnchorAt('CampTaken', campSubject(campId, nextCampOccurrence(state.anchors, 'CampTaken', campId)))
    },
    [state.anchors, writeAnchorAt],
  )

  const onCampUp = useCallback(
    (campId: string) => {
      writeAnchorAt('CampUp', campSubject(campId, nextCampOccurrence(state.anchors, 'CampUp', campId)))
    },
    [state.anchors, writeAnchorAt],
  )

  const startMatch = useCallback((mapId: string) => {
    // The start tap doubles as the audio unlock, because iOS silently drops utterances
    // not triggered by a user gesture.
    unlockSpeech()
    requestWakeLock()
    setRecentMaps(noteMapPlayed(mapId))
    setResumable(null)
    dispatch({ type: 'MATCH_STARTED', matchId: `m-${Date.now()}`, mapId, wallClock: Date.now() })
  }, [])

  const resumeMatch = useCallback((stored: StoredMatch) => {
    unlockSpeech()
    requestWakeLock()
    setResumable(null)
    dispatch({
      type: 'MATCH_RESUMED',
      matchId: stored.matchId,
      mapId: stored.mapId,
      anchors: fromAnchorList(stored.anchors),
      userAdjustSeconds: stored.userAdjustSeconds,
    })
  }, [])

  useEffect(() => {
    initSpeech()
    const stored = loadResumableMatch(Date.now())
    if (stored !== null && isFreshEnoughToAutoResume(stored, Date.now())) {
      // The browser discarded the tab, it is not the player starting a session. Going to
      // the setup screen here loses the match every time the phone's screen comes back.
      resumeMatch(stored)
    } else {
      setResumable(stored)
    }
    return installWakeLockRecovery()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const endMatch = useCallback(() => {
    releaseWakeLock()
    stopSpeech()
    clearMatch()
    setSheet('none')
    dispatch({ type: 'MATCH_ENDED' })
  }, [])

  if (!live) {
    const stored = resumable
    return (
      <Setup
        battlegrounds={battlegrounds}
        recentMaps={recentMaps}
        onStart={startMatch}
        resumable={
          stored === null
            ? null
            : {
                mapName: mapById(stored.mapId).name,
                ageMinutes: Math.max(1, Math.round((Date.now() - stored.savedAtWallClock) / 60000)),
              }
        }
        onResume={() => stored !== null && resumeMatch(stored)}
        onDiscardResume={() => {
          clearMatch()
          setResumable(null)
        }}
      />
    )
  }

  const liveView = view(timeline, map, now)
  const primaryOffers = offersFor('primary', buildContext(map, timeline, now))
  const primary = primaryOffers.find((o) => o.key === 'objective-ended')
  const spawnOffer = primaryOffers.find((o) => o.key === 'objective-spawned')
  const undoOffered =
    state.lastWrite !== null && Date.now() - state.lastWrite.atWallClock < undoWindowMillis
  const lastWriteAt =
    state.lastWrite === null ? null : (state.anchors.get(state.lastWrite.key)?.gameTimeSeconds ?? null)

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3 p-3 sm:max-w-[620px]">
      <Frame>
        <Header
          mapName={liveView.mapName}
          clock={liveView.clock}
          onAdjustClock={() => setSheet('clock')}
          onOverflow={() => setSheet('overflow')}
        />
        <Rule />
        <main className="px-4 pt-3 pb-4">
          <div className="live-grid">
            <div className="area-countdown">
              <ObjectivePanel slot={liveView.objective} />
            </div>
            <div className="area-rail">
              {settings.showRail && (
                <Rail
                  rail={liveView.rail}
                  onCampTaken={onCampTaken}
                  onCampUnknown={() => setSheet('overflow')}
                />
              )}
            </div>
            <div className="area-prompt">
              <CueRunner
                map={map}
                timeline={timeline}
                now={now}
                matchId={state.matchId}
                settings={settings}
              />
            </div>
            <div className="area-action">
              {primary !== undefined && (
                <button
                  type="button"
                  className={`btn-slant mt-4 min-h-14 w-full py-4 text-sm ${primary.emphasis === 'urgent' ? 'btn-urgent' : 'btn-primary'}`}
                  onClick={onObjectiveEnded}
                >
                  {primary.label}
                </button>
              )}
              {spawnOffer !== undefined && (
                <button
                  type="button"
                  className="btn-slant btn-quiet mt-4 min-h-14 w-full py-4 text-sm"
                  onClick={() => onObjectiveSpawned(spawnOffer.subject ?? '1')}
                >
                  {spawnOffer.label}
                </button>
              )}
              {undoOffered && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="label-tight">
                    recorded {lastWriteAt === null ? '' : mmss(lastWriteAt)}
                  </span>
                  <button
                    type="button"
                    className="undo-glyph"
                    onClick={() => dispatch({ type: 'ANCHOR_REVERTED' })}
                    aria-label="Undo that tap"
                    title="Undo that tap"
                  >
                    &#8630;
                  </button>
                </div>
              )}
            </div>
          </div>
          <Footer view={liveView} />
        </main>
      </Frame>

      {sheet === 'clock' && (
        <ClockAdjustSheet
          userAdjustSeconds={state.userAdjustSeconds}
          onChange={(seconds) => dispatch({ type: 'USER_ADJUST_SET', seconds })}
          onClose={() => setSheet('none')}
        />
      )}
      {sheet === 'overflow' && (
        <OverflowSheet
          view={liveView}
          settings={settings}
          onSettings={setSettings}
          matchLog={buildMatchLog(map, [...state.anchors.values()], now)}
          onCampTaken={onCampTaken}
          onCampUp={onCampUp}
          onEndMatch={endMatch}
          onClose={() => setSheet('none')}
        />
      )}
    </div>
  )
}

/**
 * Cues are evaluated at most once a second, not once a frame. `matchStartWallClock`
 * appears in the reset condition because `CueState` is discarded on MATCH_ENDED and
 * recreated with a new `matchId`: without that, keys from match one suppress identical
 * keys in match two and the app goes silent on the second game of the evening.
 */
function CueRunner({
  map,
  timeline,
  now,
  matchId,
  settings,
}: {
  map: ReturnType<typeof mapById>
  timeline: ReturnType<typeof useTimeline>
  now: number
  matchId: string
  settings: StoredSettings
}) {
  // What fired, and how long to keep showing it.
  //
  // `evaluateCues` reports what fired *this second*, which is right for speech and wrong
  // for the screen: once a key is in `fired` it is correctly dropped from the next
  // evaluation, so a prompt was visible for exactly one second and then vanished.
  const [shown, setShown] = useState<{ prompts: readonly Prompt[]; untilSecond: number } | null>(null)
  const cueState = useRef<CueState>(newCueState(matchId))
  const lastSpokenKey = useRef<string | null>(null)
  const lastEvaluated = useRef<number | null>(null)
  const second = Math.floor(now)

  if (cueState.current.matchId !== matchId) {
    cueState.current = newCueState(matchId)
    lastSpokenKey.current = null
    lastEvaluated.current = null
  }

  useEffect(() => {
    // Exactly once per second, whatever else re-runs this effect.
    //
    // `evaluateCues` is not idempotent — it records what fired, which is the point —
    // so a second call within the same second finds every key already in `fired` and
    // returns nothing, blanking a prompt that is mid-display. StrictMode does that on
    // mount, and in production so does changing a setting while a prompt is up.
    // Verbosity changes therefore take effect on the next tick rather than instantly,
    // which is under a second and not worth the whole class of bug.
    if (lastEvaluated.current === second) return
    lastEvaluated.current = second

    const promptSettings: PromptSettings = {
      maxTier: settings.maxTier,
      speechEnabled: settings.speechEnabled,
      ...(settings.voiceId !== undefined ? { voiceId: settings.voiceId } : {}),
    }
    const ctx = buildContext(map, timeline, second)
    const result = evaluateCues(cues, cueText, promptSettings, ctx, cueState.current)
    cueState.current = result.state
    if (result.active.length > 0) {
      setShown({ prompts: result.active, untilSecond: second + promptDisplaySeconds })
    } else {
      setShown((current) => (current !== null && second > current.untilSecond ? null : current))
    }
    if (result.speak !== null && result.speak.key !== lastSpokenKey.current) {
      lastSpokenKey.current = result.speak.key
      speak(result.speak.spoken, settings.voiceId)
    }
    // `timeline` is intentionally read rather than watched: it only changes when the
    // projection expires, and the second tick is what paces evaluation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [second, map, settings.maxTier, settings.speechEnabled, settings.voiceId])

  return <PromptBar prompts={shown?.prompts ?? []} />
}
