import { useMemo, useState } from 'react'
import type { MapDefinition } from '@nexiliary/engine'
import { Frame, Rule } from './chrome.js'

/**
 * Setup must be completable inside a 30 to 60 second loading screen, on a phone,
 * one-handed: a grid of named tiles, one tap to select, one large button to start.
 *
 * Recently played maps sort first. "Last used map" is a poor default in a rotating
 * queue and is not used as one.
 */
export function Setup({
  battlegrounds,
  recentMaps,
  onStart,
  resumable,
  onResume,
  onDiscardResume,
}: {
  battlegrounds: readonly MapDefinition[]
  recentMaps: readonly string[]
  onStart: (mapId: string) => void
  resumable: { mapName: string; ageMinutes: number } | null
  onResume: () => void
  onDiscardResume: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)

  const ordered = useMemo(() => {
    const rank = (id: string) => {
      const index = recentMaps.indexOf(id)
      return index === -1 ? Number.MAX_SAFE_INTEGER : index
    }
    return [...battlegrounds].sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name))
  }, [battlegrounds, recentMaps])

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 p-4">
      <Frame>
        <header className="flex items-baseline justify-between px-4 pt-3 pb-2">
          <span className="label">nexiliary</span>
          <span className="label-tight">pick a battleground</span>
        </header>
        <Rule />
        <div className="p-4">
          {resumable !== null && (
            <div className="prompt mb-4">
              A match on {resumable.mapName} was running {resumable.ageMinutes} minutes ago.
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn-slant btn-primary min-h-11 flex-1 py-2 text-xs" onClick={onResume}>
                  Resume it
                </button>
                <button
                  type="button"
                  className="btn-slant btn-quiet min-h-11 flex-1 py-2 text-xs"
                  onClick={onDiscardResume}
                >
                  Start fresh
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ordered.map((map) => (
              <button
                key={map.id}
                type="button"
                className={`map-tile ${selected === map.id ? 'map-tile-selected' : ''}`}
                onClick={() => setSelected(map.id)}
                aria-pressed={selected === map.id}
              >
                <span className="block text-[0.8rem] leading-tight font-semibold tracking-wide uppercase">
                  {map.name}
                </span>
                <span className="label-tight mt-1 block">
                  {map.objective.kind === 'timed' ? map.objective.label : 'no objective timer'}
                  {map.provenance !== 'verified' && ' · estimated'}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn-slant btn-primary mt-4 min-h-14 w-full py-4 text-sm"
            disabled={selected === null}
            onClick={() => selected !== null && onStart(selected)}
          >
            Start match
          </button>

          <p className="mt-3 text-xs leading-snug text-[var(--color-ink-faint)]">
            Start it as you spawn in. Then tap <b className="text-[var(--color-ink-dim)]">objective ended</b>{' '}
            four to six times a match, during the regroup after a fight — that tap is what keeps
            objective timing accurate. Without it the app is good for a few cycles and then
            honestly goes quiet on objectives, while waves, camps and tiers carry on.
          </p>
        </div>
      </Frame>
    </div>
  )
}
