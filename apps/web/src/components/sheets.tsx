import { useEffect, useState } from 'react'
import type { StoredSettings } from '../services/storage.js'
import { Frame, Rule } from './chrome.js'
import { isSpeechAvailable, listVoices } from '../services/speech.js'
import { onWakeLockStatus, wakeLockStatus } from '../services/wake-lock.js'
import type { WakeLockStatus } from '../services/wake-lock.js'

/**
 * Whether the screen is actually being kept awake, rather than whether it was asked to
 * be. A phone that sleeps mid-match looks like the app crashing, and the two reasons it
 * happens — no secure context, or refused playback — are both invisible otherwise.
 */
function useWakeLockStatus(): WakeLockStatus {
  const [status, setStatus] = useState(wakeLockStatus)
  useEffect(() => onWakeLockStatus(setStatus), [])
  return status
}

const wakeLockCopy: Record<WakeLockStatus, string> = {
  off: 'Not held. It is requested when a match starts, and released when it ends.',
  locked: 'Held. The screen stays on for the match.',
  insecure:
    'Not held. Screen Wake Lock needs a secure context and this page was opened over plain http, ' +
    'so the API is not there at all — the screen will sleep mid-match and take the speech with it. ' +
    'Use the deployed https address.',
  unavailable: 'Not held: the browser refused. The screen will sleep, and speech stops with it.',
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet" onClick={onClose} role="presentation">
      <Frame className="w-full max-w-[420px]">
        <div onClick={(e) => e.stopPropagation()} role="presentation">
          <header className="flex items-center justify-between px-4 pt-3 pb-2">
            <span className="label">{title}</span>
            <button type="button" onClick={onClose} className="label-tight min-h-11 cursor-pointer px-2">
              close
            </button>
          </header>
          <Rule />
          <div className="max-h-[70vh] overflow-y-auto px-4 py-4">{children}</div>
        </div>
      </Frame>
    </div>
  )
}

export function ClockAdjustSheet({
  userAdjustSeconds,
  onChange,
  onClose,
}: {
  userAdjustSeconds: number
  onChange: (seconds: number) => void
  onClose: () => void
}) {
  return (
    <Sheet title="Adjust clock" onClose={onClose}>
      <p className="mb-4 text-sm leading-snug text-[var(--color-ink-dim)]">
        Nudges your own clock only. Correcting a late tap must not re-time your team, so this
        is never published to a session.
      </p>
      <div className="flex items-center justify-between gap-2">
        {[-10, -5, -1, +1, +5, +10].map((delta) => (
          <button
            key={delta}
            type="button"
            className="btn-slant btn-quiet min-h-11 flex-1 py-2 text-xs"
            onClick={() => onChange(userAdjustSeconds + delta)}
          >
            {delta > 0 ? `+${delta}` : delta}
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-sm text-[var(--color-ink-dim)]">
        offset <b className="numerals text-[var(--color-ink)]">{userAdjustSeconds > 0 ? '+' : ''}{userAdjustSeconds}s</b>
      </p>
      <button
        type="button"
        className="btn-slant btn-quiet mt-4 min-h-11 w-full py-2.5 text-xs"
        onClick={() => onChange(0)}
      >
        Reset offset
      </button>
    </Sheet>
  )
}

export function OverflowSheet({
  settings,
  matchLog,
  onSettings,
  onEndMatch,
  onClose,
}: {
  settings: StoredSettings
  matchLog: string
  onSettings: (next: StoredSettings) => void
  onEndMatch: () => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'guide' | 'log' | 'settings'>('guide')
  const titles = { guide: 'What am I looking at', log: 'Match log', settings: 'Settings' }
  const title = titles[tab]
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="mb-4 flex gap-2">
        {(['guide', 'log', 'settings'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`btn-slant min-h-11 flex-1 py-2 text-xs ${tab === t ? 'btn-primary' : 'btn-quiet'}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'guide' && <Legend />}
      {tab === 'log' && <MatchLog text={matchLog} />}
      {tab === 'settings' && <SettingsPanel settings={settings} onSettings={onSettings} />}

      <button
        type="button"
        className="btn-slant btn-quiet mt-6 min-h-11 w-full py-3 text-xs"
        onClick={onEndMatch}
      >
        End match
      </button>
    </Sheet>
  )
}

/**
 * What actually happened, against what the map file predicted. The reason to read it is
 * that a map cannot be promoted to `verified` — which is what unlocks every exact number
 * in the app — until its fight and offset columns have been seen a few times.
 */
function MatchLog({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <p className="mb-3 text-sm leading-snug text-[var(--color-ink-dim)]">
        Tap <b className="text-[var(--color-ink)]">objective up</b> when it appears and{' '}
        <b className="text-[var(--color-ink)]">objective ended</b> when it resolves, and this fills
        in. One column is the fight, the other is the respawn offset — the two numbers every map
        file currently guesses.
      </p>
      <pre className="overflow-x-auto rounded-[3px] bg-[rgb(10_7_20_/_0.7)] p-3 text-[0.68rem] leading-relaxed whitespace-pre text-[var(--color-ink-dim)]">
        {text}
      </pre>
      <button
        type="button"
        className="btn-slant btn-quiet mt-3 min-h-11 w-full py-2.5 text-xs"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(text)
            .then(() => setCopied(true))
            .catch(() => setCopied(false))
        }}
      >
        {copied ? 'Copied' : 'Copy match log'}
      </button>
    </div>
  )
}

/**
 * The readout is dense and most of it is unlabelled by design — the game's own idiom is
 * bare numerals. That works when you already know what they are. This is where you find
 * out, once.
 */
function Legend() {
  return (
    <div className="flex flex-col gap-4 text-sm leading-snug text-[var(--color-ink-dim)]">
      <Entry term="The big number">
        When the next objective spawns. <b className="tone-exact">Green</b> means exact,{' '}
        <b className="tone-estimated">amber</b> means a range the app is not certain within, and{' '}
        <b className="tone-unknown">grey</b> means it has lost the thread and will say so rather than
        guess. <b>LIVE</b> means the objective is believed to be running right now.
      </Entry>

      <Entry term="Camps">
        Every camp on the battleground, reading west to east like the map. Green means it is there.
        A countdown means it is coming back. <b>?</b> means the app has stopped claiming, which is
        what happens when nobody has said anything about it for a while.
        <br />
        <b className="text-[var(--color-ink)]">Taken</b> starts an exact respawn countdown.{' '}
        <b className="text-[var(--color-ink)]">It's up</b> corrects the app when it has the camp
        wrong. This is the tap that happens most, so it is on the main screen rather than behind a
        menu.
      </Entry>

      <Entry term="Next beacons">
        When the objective after the one being counted down arrives, so a camp can be started for
        it rather than for the one already in progress.
      </Entry>

      <Entry term="If you die now">
        How long you would spend dead at the current team level. Fifteen seconds early, sixty-five
        after level 20. It is the number that decides whether a camp or a chase is worth the risk,
        and it is amber because it is read off an estimated level.
      </Entry>

      <Entry term="What is not here">
        Team level, the talent tier row, and the wave countdown. The first two are on your own
        screen already, and a derived number that can visibly disagree with one you can read costs
        trust in the numbers you cannot check. The wave is a fixed thirty-second cadence you can
        keep in your head, and the spoken reminder covers it if you turn it on. Camp state is the
        thing you genuinely cannot track, so it got the space.
      </Entry>

      <Entry term="Objective ended">
        The one tap that matters. It appears while an objective is running or has run unreported,
        and disappears once you have tapped it, so it cannot record the same objective twice. Four
        to six taps a match keeps the objective timing accurate; none at all and it goes quiet about
        objectives after a few cycles.
      </Entry>
    </div>
  )
}

function Entry({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1">{term}</div>
      <p className="m-0">{children}</p>
    </div>
  )
}

export function SettingsPanel({
  settings,
  onSettings,
}: {
  settings: StoredSettings
  onSettings: (next: StoredSettings) => void
}) {
  const voices = isSpeechAvailable() ? listVoices() : []
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="label mb-2">Spoken prompts</div>
        <div className="flex gap-2">
          {(['essential', 'standard', 'verbose'] as const).map((tier) => (
            <button
              key={tier}
              type="button"
              className={`btn-slant min-h-11 flex-1 py-2 text-[0.65rem] ${settings.maxTier === tier ? 'btn-primary' : 'btn-quiet'}`}
              onClick={() => onSettings({ ...settings, maxTier: tier })}
            >
              {tier}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-snug text-[var(--color-ink-faint)]">
          Objectives and talent tiers speak on <b>essential</b>. Camps join on <b>standard</b>. Wave
          spawns join on <b>verbose</b>, which talks every thirty seconds.
        </p>
      </div>

      <label className="flex min-h-11 items-center justify-between gap-3">
        <span className="label">Speech</span>
        <input
          type="checkbox"
          checked={settings.speechEnabled}
          onChange={(e) => onSettings({ ...settings, speechEnabled: e.target.checked })}
          className="h-6 w-6 accent-[var(--color-exact)]"
        />
      </label>

      {voices.length > 0 && (
        <label className="flex flex-col gap-2">
          <span className="label">Voice</span>
          <select
            className="field"
            value={settings.voiceId ?? ''}
            onChange={(e) =>
              onSettings(
                e.target.value === ''
                  ? { maxTier: settings.maxTier, speechEnabled: settings.speechEnabled, showCamps: settings.showCamps }
                  : { ...settings, voiceId: e.target.value },
              )
            }
          >
            <option value="">System default</option>
            {voices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <WakeLockRow />

      <label className="flex min-h-11 items-center justify-between gap-3">
        <span className="label">Show camps</span>
        <input
          type="checkbox"
          checked={settings.showCamps}
          onChange={(e) => onSettings({ ...settings, showCamps: e.target.checked })}
          className="h-6 w-6 accent-[var(--color-exact)]"
        />
      </label>
      <p className="-mt-3 text-xs leading-snug text-[var(--color-ink-faint)]">
        Hiding the camps degrades to the dominant countdown alone, if the panel proves busy
        under stress.
      </p>
    </div>
  )
}

function WakeLockRow() {
  const status = useWakeLockStatus()
  const tone = status === 'unavailable' ? 'tone-estimated' : status === 'off' ? 'tone-unknown' : 'tone-exact'
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="label">Screen awake</span>
        <span className={`text-xs uppercase tracking-[0.14em] ${tone}`}>{status}</span>
      </div>
      <p className="mt-1 text-xs leading-snug text-[var(--color-ink-faint)]">{wakeLockCopy[status]}</p>
    </div>
  )
}
