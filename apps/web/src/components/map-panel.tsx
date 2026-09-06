import type { CampChip } from '@nexiliary/engine'
import type { MapImage } from '@nexiliary/maps'
import { toneClass } from './chrome.js'

/** Camp id to its marker, normalised 0..1 within the battleground's playable extent. */
export interface CampPositions {
  readonly [campId: string]: { readonly x: number; readonly y: number }
}

/**
 * The battleground, with a dot per camp where the camp actually is.
 *
 * A second renderer for the same `CampChip[]` the rail consumes, never a second model:
 * `state` and `tone` are passed through untouched, so the two views cannot come to
 * disagree about belief.
 *
 * What the map adds is that one tap needs no disambiguation. `offerTaken` and `offerUp`
 * are mutually exclusive by construction — the app either believes a camp is standing, in
 * which case only "we took it" means anything, or believes it is not, in which case only
 * "it's up" does. So the dot performs whichever the app is actually asking about, and a
 * mis-tap is undone by tapping the same dot again.
 */
export function MapPanel({
  camps,
  image,
  positions,
  onCampTaken,
  onCampUp,
}: {
  camps: readonly CampChip[]
  image: MapImage
  positions: CampPositions
  onCampTaken: (campId: string) => void
  onCampUp: (campId: string) => void
}) {
  if (camps.length === 0) return null
  return (
    <section className="mt-4">
      <div className="label-tight mb-1.5">camps</div>
      {/* The aspect ratio is reserved from the declared dimensions, so the panel does not
          jump when the image lands. */}
      <div className="map-frame" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
        <img className="map-ground" src={image.src} alt="" aria-hidden="true" />
        {camps.map((camp) => {
          const at = positions[camp.id]
          if (at === undefined) return null
          const act = camp.offerTaken ? onCampTaken : camp.offerUp ? onCampUp : null
          return (
            <button
              key={camp.id}
              type="button"
              disabled={act === null}
              onClick={act === null ? undefined : () => act(camp.id)}
              aria-label={
                camp.offerTaken
                  ? `${camp.label} taken`
                  : camp.offerUp
                    ? `${camp.label} is up`
                    : `${camp.label}, ${camp.text}`
              }
              style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
              className={`map-dot map-dot-${camp.state} ${toneClass(camp.tone)}`}
            >
              <span className="numerals">{camp.text}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
