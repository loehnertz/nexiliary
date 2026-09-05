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
  onCampUnknown,
}: {
  rail: readonly RailSlot[]
  onCampTaken: (campId: string) => void
  /**
   * A `Stale` chip is the control that corrects it, which is the whole reason decay does
   * not remove it. What it should write is genuinely ambiguous, though — the player may
   * be looking at a camp that is standing, or at one they just took — so it opens the
   * camp list where both are spelled out rather than guessing on their behalf.
   */
  onCampUnknown: () => void
}) {
  return (
    <div className="rail mt-4">
      {rail.map((slot) => {
        const body = (
          <>
            <b className={`block text-[0.95rem] font-bold numerals ${toneClass(slot.tone)}`}>{slot.text}</b>
            <span className="label-tight">{slot.label}</span>
            {slot.camp?.tappable === true && <span className="chip-hint tone-exact">tap if taken</span>}
            {slot.camp?.stale === true && <span className="chip-hint tone-unknown">unconfirmed</span>}
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
        if (slot.camp?.stale === true) {
          return (
            <button
              key={slot.key}
              type="button"
              className="chip chip-stale flex-1"
              onClick={onCampUnknown}
              aria-label={`${slot.label} is unconfirmed — open the camp list`}
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

/**
 * Only things the game does not already show you.
 *
 * Team level and the talent tier row were both on this strip and both are on the player's
 * own screen, which is a straight duplication — and a duplication that can visibly
 * disagree, costing trust in the numbers they cannot check. What is left is the length of
 * the death timer, which is not shown until you are already dead, and when the next tier
 * lands, which is not shown at all.
 */
export function Footer({ view }: { view: LiveView }) {
  return (
    <footer className="mt-3 flex justify-between gap-4 border-t border-[rgb(155_140_232_/_0.22)] pt-2.5">
      <Stat value={view.deathTimer.text} label="if you die now" tone={view.deathTimer.tone} />
      {view.nextTier === null ? (
        <Stat value="—" label="all tiers reached" />
      ) : (
        <Stat
          value={view.nextTier.text}
          label={`to talent tier ${view.nextTier.level}`}
          tone={view.nextTier.tone}
        />
      )}
    </footer>
  )
}

export { Rule }
