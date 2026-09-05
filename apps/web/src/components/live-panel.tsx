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
    <div className="rail mt-4">
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
  // Collapses rather than reserving space. The reserved band kept the layout still, but
  // with no prompt and no anchor button to show it left a hole in the middle of the
  // panel that reads as a rendering fault.
  if (prompts.length === 0) return null
  return (
    <div className="mt-3 flex flex-col gap-1">
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

export function TierRow({
  tiers,
  anchored,
  onTierReached,
}: {
  tiers: LiveView['tiers']
  anchored: boolean
  onTierReached: (level: number) => void
}) {
  // Bare numerals are the game's own talent-screen idiom, and out of that context they
  // read as seven unexplained numbers, so the row says what it is.
  //
  // It is also the input. Team level is the one number here the player can read off
  // their own screen, so the app asks rather than guessing: tap the tier you just hit
  // and the whole curve re-phases. Like the rail entries doubling as camp buttons, the
  // control lives on the thing it corrects.
  const next = tiers.find((t) => t.state === 'next')
  return (
    <div className="mt-3 border-t border-[rgb(155_140_232_/_0.22)] pt-2.5">
      <div className="label-tight mb-1 flex items-baseline justify-between gap-2">
        <span>talent tiers</span>
        <span className={anchored ? 'tone-exact' : 'tone-estimated'}>
          {anchored ? 'confirmed' : 'tap the one you just hit'}
        </span>
      </div>
      <div className="flex justify-between">
        {tiers.map((cell) => (
          <button
            key={cell.level}
            type="button"
            onClick={() => onTierReached(cell.level)}
            aria-label={`We reached talent tier ${cell.level}`}
            className={`tier-cell tier-tap ${cell.state === 'reached' ? 'tier-reached' : ''} ${cell.state === 'next' ? 'tier-next' : ''} ${cell.known ? 'tier-known' : ''}`}
          >
            {cell.level}
          </button>
        ))}
      </div>
      <div className="label-tight mt-0.5 text-right">
        {next === undefined ? 'all tiers reached' : `next ${next.level}`}
      </div>
    </div>
  )
}

export function Footer({ view }: { view: LiveView }) {
  // "1 synced" was in the mockup and says nothing while there is no session to sync
  // with. It comes back with the relay. The other two now say what they are: "death"
  // beside "level" reads as two unexplained numbers rather than as the cost of dying.
  return (
    <footer className="mt-2.5 flex justify-between gap-4">
      <Stat value={view.deathTimer.text} label="if you die now" tone={view.deathTimer.tone} />
      <Stat
        value={view.level.text}
        label={view.level.estimated ? 'team level (est.)' : 'team level'}
        tone={view.level.tone}
      />
    </footer>
  )
}

export { Rule }
