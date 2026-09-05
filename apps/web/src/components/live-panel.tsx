import type { LiveView, ObjectiveSlot, Prompt, RailSlot } from '@nexiliary/engine'
import { Rule, Stat, glowClass, toneClass } from './chrome.js'

export function Header({
  mapName,
  clock,
  onAdjustClock,
  onOverflow,
}: {
  mapName: string
  clock: string
  onAdjustClock: () => void
  onOverflow: () => void
}) {
  return (
    <header className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-2">
      <span className="label truncate text-[0.7rem]">{mapName}</span>
      <div className="flex items-baseline gap-3">
        {/* The clock is tappable to nudge the match start, since that is the one
            required input that is easy to fumble. */}
        <button
          type="button"
          onClick={onAdjustClock}
          className="dotted-underline numerals cursor-pointer bg-transparent p-0 text-[1.05rem] font-bold tracking-wide text-[var(--color-ink)]"
          aria-label="Adjust the match clock"
        >
          {clock}
        </button>
        <button
          type="button"
          onClick={onOverflow}
          className="label-tight min-h-11 cursor-pointer bg-transparent px-1"
          aria-label="More controls"
        >
          •••
        </button>
      </div>
    </header>
  )
}

export function ObjectivePanel({ slot }: { slot: ObjectiveSlot }) {
  if (slot.kind === 'live') {
    // The phase is believed to be running. Saying so is a claim about the present, so
    // it carries the cycle's own confidence and goes quiet when that is Unknown.
    return (
      <div className="pt-1 pb-1 text-center">
        <div className="label">{slot.label}</div>
        <div className={`countdown ${toneClass(slot.tone)} ${glowClass(slot.tone)}`}>LIVE</div>
        <div className={`mt-1 text-[0.7rem] uppercase tracking-[0.16em] ${toneClass(slot.tone)}`}>
          {slot.confidenceLabel}
          <span className="text-[var(--color-ink-faint)]"> · up to {slot.endsText} left</span>
        </div>
      </div>
    )
  }

  if (slot.kind !== 'countdown') {
    return (
      <div className="py-6 text-center">
        <div className="label">Objective</div>
        <p className="mx-auto mt-3 max-w-[26ch] text-sm leading-snug text-[var(--color-ink-faint)]">
          {slot.message}
        </p>
      </div>
    )
  }

  const { countdown } = slot
  const [head, tail] = splitRange(countdown.text)
  return (
    <div className="pt-1 pb-1 text-center">
      <div className="label">{countdown.label}</div>
      <div className={`countdown ${toneClass(countdown.tone)} ${glowClass(countdown.tone)}`}>
        {head}
        {tail !== null && <small>{tail}</small>}
      </div>
      <div className={`mt-1 text-[0.7rem] uppercase tracking-[0.16em] ${toneClass(countdown.tone)}`}>
        {countdown.confidenceLabel}
        {slot.instances !== undefined && (
          <span className="text-[var(--color-ink-faint)]"> · {slot.instances}</span>
        )}
      </div>
    </div>
  )
}

/** `~0:25-1:05` renders the upper bound smaller, as the mockup does. */
function splitRange(text: string): [string, string | null] {
  const dash = text.indexOf('-', 1)
  if (dash === -1) return [text, null]
  return [text.slice(0, dash), text.slice(dash).replace('-', '–')]
}

export function Rail({
  rail,
  onCampTaken,
}: {
  rail: readonly RailSlot[]
  onCampTaken: (campId: string) => void
}) {
  return (
    <div className="mt-4 flex items-stretch justify-between gap-1">
      {rail.map((slot) => {
        const body = (
          <>
            <b className={`block text-[0.95rem] font-bold numerals ${toneClass(slot.tone)}`}>{slot.text}</b>
            <span className="label-tight">{slot.label}</span>
            {slot.camp?.tappable === true && <span className="chip-hint tone-exact">tap if taken</span>}
          </>
        )
        if (slot.camp?.tappable === true) {
          return (
            <button
              key={slot.key}
              type="button"
              className="chip chip-tappable flex-1"
              onClick={() => onCampTaken(slot.camp!.id)}
            >
              {body}
            </button>
          )
        }
        return (
          <span key={slot.key} className="chip flex-1">
            {body}
          </span>
        )
      })}
    </div>
  )
}

export function PromptBar({ prompts }: { prompts: readonly Prompt[] }) {
  if (prompts.length === 0) {
    return <div className="mt-3 min-h-[3.2rem]" aria-hidden />
  }
  return (
    <div className="mt-3 flex min-h-[3.2rem] flex-col gap-1">
      {prompts.map((prompt, index) => (
        <div
          key={prompt.key}
          className={`prompt ${prompt.band === 'critical' ? 'prompt-critical' : ''} ${index > 0 ? 'opacity-60' : ''}`}
        >
          {prompt.display}
        </div>
      ))}
    </div>
  )
}

export function TierRow({ tiers }: { tiers: LiveView['tiers'] }) {
  return (
    <div className="mt-3 flex justify-between border-t border-[rgb(155_140_232_/_0.22)] pt-2.5">
      {tiers.map((cell) => (
        <span
          key={cell.level}
          className={`tier-cell ${cell.state === 'reached' ? 'tier-reached' : ''} ${cell.state === 'next' ? 'tier-next' : ''}`}
        >
          {cell.level}
        </span>
      ))}
    </div>
  )
}

export function Footer({ view, syncedPeers }: { view: LiveView; syncedPeers: number }) {
  return (
    <footer className="mt-2.5 flex justify-between">
      <Stat value={view.deathTimer.text} label="death" tone={view.deathTimer.tone} />
      <Stat value={view.level.text} label="level" tone={view.level.tone} />
      <Stat value={String(syncedPeers)} label="synced" />
    </footer>
  )
}

export { Rule }
