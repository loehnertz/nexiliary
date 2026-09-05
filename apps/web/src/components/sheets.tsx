import { useEffect, useState } from 'react'
import type { LiveView, RailSlot } from '@nexiliary/engine'
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
  off: 'Not held. It is requested when a match starts.',
  locked: 'Held. The screen will stay on for the match.',
  video: 'Held by the fallback. Screen Wake Lock needs HTTPS, so this is what a plain http:// address gets.',
  unavailable: 'Not held, and the fallback was refused. The screen will sleep, and speech stops with it.',
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
  view,
  settings,
  matchLog,
  onSettings,
  onCampTaken,
  onCampUp,
  onEndMatch,
  onClose,
}: {
  view: LiveView
  settings: StoredSettings
  matchLog: string
  onSettings: (next: StoredSettings) => void
  onCampTaken: (campId: string) => void
  onCampUp: (campId: string) => void
  onEndMatch: () => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'camps' | 'guide' | 'log' | 'settings'>('camps')
  const titles = { camps: 'All camps', guide: 'What am I looking at', log: 'Match log', settings: 'Settings' }
  const title = titles[tab]
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="mb-4 flex gap-2">
        {(['camps', 'guide', 'log', 'settings'] as const).map((t) => (
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

      {tab === 'camps' && <CampList camps={view.overflowCamps} onCampTaken={onCampTaken} onCampUp={onCampUp} />}
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

      <Entry term="The four chips">
        The objective after this one, the next minion wave, and the two camps most worth taking for
        the coming fight. They read west to east, like the map. A chip with a green outline is
        tappable: tap it when that camp gets taken, and its respawn becomes exact.
      </Entry>

      <Entry term="To talent tier 16">
        When the next tier lands — not which one you are on, which is on your own screen. A tier
        advantage matters far more than a level advantage, so never take an even fight into a
        deficit. This is estimated from the experience tables and is the least certain number in
        the app.
      </Entry>

      <Entry term="If you die now">
        How long you would spend dead at the current team level. Fifteen seconds early, sixty-five
        after level 20. It is the number that decides whether a camp or a chase is worth the risk,
        and it is amber because it is read off an estimated level.
      </Entry>

      <Entry term="What is not here">
        Team level and which talent tier you are on. Both are on your own screen, and a derived
        number that can visibly disagree with one you can read costs trust in the numbers you
        cannot check. The level is still estimated internally, because the two readings above are
        computed from it — which is also why both are amber rather than green.
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

function CampList({
  camps,
  onCampTaken,
  onCampUp,
}: {
  camps: readonly RailSlot[]
  onCampTaken: (campId: string) => void
  onCampUp: (campId: string) => void
}) {
  if (camps.length === 0) {
    return <p className="text-sm text-[var(--color-ink-faint)]">No camp data for this battleground.</p>
  }
  return (
    <ul className="flex flex-col gap-2">
      {camps.map((slot) => (
        <li key={slot.key} className="flex items-center gap-2">
          <span className="min-w-[5.5rem] flex-1">
            <b className={`numerals block text-sm tone-${slot.tone}`}>{slot.text}</b>
            <span className="label-tight">{slot.label}</span>
          </span>
          <button
            type="button"
            className="btn-slant btn-quiet min-h-11 px-4 py-2 text-[0.65rem]"
            onClick={() => onCampTaken(slot.camp!.id)}
          >
            Taken
          </button>
          {/* Decay must not remove the only control that could correct it. */}
          <button
            type="button"
            className="btn-slant btn-quiet min-h-11 px-4 py-2 text-[0.65rem]"
            onClick={() => onCampUp(slot.camp!.id)}
          >
            Camp is up
          </button>
        </li>
      ))}
    </ul>
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
                  ? { maxTier: settings.maxTier, speechEnabled: settings.speechEnabled, showRail: settings.showRail }
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
        <span className="label">Show rail</span>
        <input
          type="checkbox"
          checked={settings.showRail}
          onChange={(e) => onSettings({ ...settings, showRail: e.target.checked })}
          className="h-6 w-6 accent-[var(--color-exact)]"
        />
      </label>
      <p className="-mt-3 text-xs leading-snug text-[var(--color-ink-faint)]">
        Hiding the rail degrades to the dominant countdown alone, if it proves busy under
        stress.
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
