import type { CampChip, LiveView, ObjectiveSlot, Prompt } from '@nexiliary/engine'
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
      <div className="objective-slot pt-1 pb-1 text-center">
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
      <div className="objective-slot py-6 text-center">
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
    <div className="objective-slot pt-1 pb-1 text-center">
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

/**
 * Every camp on the battleground, with its taps on it.
 *
 * These were two rail slots plus a list behind the overflow menu, which put the control
 * one tap away from someone mid-match who is not looking at the phone — de facto never.
 * Camp state is also the thing the player genuinely cannot track in their head, unlike a
 * thirty-second wave cadence, so it earns the space.
 */
export function CampPanel({
  camps,
  onCampTaken,
  onCampUp,
}: {
  camps: readonly CampChip[]
  onCampTaken: (campId: string) => void
  onCampUp: (campId: string) => void
}) {
  if (camps.length === 0) return null
  return (
    <section className="mt-4">
      <div className="label-tight mb-1.5">Camps</div>
      <ul className="camp-grid">
        {camps.map((camp) => (
          <li key={camp.id} className={`camp-row camp-${camp.state}`}>
            <span className="min-w-0 flex-1">
              <b className={`numerals block text-[0.95rem] leading-tight font-bold ${toneClass(camp.tone)}`}>
                {camp.text}
              </b>
              <span className="label-tight block truncate">{camp.label}</span>
            </span>
            <span className="flex shrink-0 gap-1">
              {camp.offerTaken && (
                <button
                  type="button"
                  className="camp-action camp-action-taken"
                  onClick={() => onCampTaken(camp.id)}
                  aria-label={`${camp.label} taken`}
                >
                  taken
                </button>
              )}
              {camp.offerUp && (
                <button
                  type="button"
                  className="camp-action camp-action-up"
                  onClick={() => onCampUp(camp.id)}
                  aria-label={`${camp.label} is up`}
                >
                  it's up
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function PromptBar({ prompts }: { prompts: readonly Prompt[] }) {
  // Collapses rather than reserving space. The reserved band kept the layout still, but
  // with no prompt and no anchor button to show it left a hole in the middle of the
  // panel that reads as a rendering fault.
  //
  // Collapsing is now free of its old cost too: the prompt sits *below* the map, so its
  // appearing and disappearing moves nothing the player taps.
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
      <Stat value={view.deathTimer.text} label="If you die now" tone={view.deathTimer.tone} />
      {view.following !== null && (
        <Stat value={view.following.text} label={view.following.label} tone={view.following.tone} />
      )}
    </footer>
  )
}

export { Rule }
