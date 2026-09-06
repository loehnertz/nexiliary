# Map-image camp tapping

Approved design, 2026-09-06.

## The problem

Camps are addressed by compass name. The camp rail lists `boss ne`, `knights sw` and so on,
sorted west to east. In play this costs two translations that both land mid-fight:

1. Seeing the camp ping in the top right of the minimap, then deriving "that is north-east".
2. Finding the row labelled `ne` in a list of six.

Each costs about a second, and the second one is spent looking at the phone. Playtesting on
2026-09-06 established that phone attention is the binding constraint on this app: the tap
works, but it "pulls me out of focus too hard eventually and I play noticeably worse".

Compass names are a *naming* scheme standing in for a *spatial* fact. Replacing them with the
spatial fact removes both translations: the player sees a camp fall at a position and taps that
same position.

## The decision

A tappable battleground image replaces the camp rail in the live panel. Camps are dots drawn at
their real positions. One tap on a dot records what the app is currently asking about that camp.
Compass names survive in the spoken output, where they are unambiguous and cost nothing.

Scope is the phone. The deferred desktop companion is not designed for here and no allowance is
made for it.

### Decisions taken, and what they exclude

| Decision | Rejected alternative |
| --- | --- |
| Map sits in the panel flow where the rows were | Map as a full-bleed background with the countdown over it |
| Real battleground render at full fidelity | Desaturated treatment; hand-traced schematic |
| Base render carries no camp markers | Shipping an image that already marks the camps |
| Arrival announcements | Lead-time announcements ("boss in fifteen") |

The map-as-background option was rejected because battleground renders are 1.33:1 to 1.55:1
wide, so map size is bound by screen *width*, which both layouts share. It would have bought
almost no target size while putting the objective countdown over a busy ground.

A full-screen map behind a button was rejected outright. The doc comment above `CampPanel` in
`apps/web/src/components/live-panel.tsx` records that camp controls behind the overflow menu
were "de facto never" used mid-match. That shape has already failed once here.

Visual treatment of the render — desaturation, tint, dimming — is a CSS `filter` value, not an
architectural choice. It ships untreated and is tuned against a real phone in a real match.

## Data model

### Camp position

`CampDefinition` in `packages/engine/src/map-types.ts` gains one field:

```ts
/**
 * The camp's marker, normalised 0..1 within the battleground's playable bounding box.
 * This is a tap target, not a survey pin: it may be nudged from the literal location to
 * keep two adjacent camps separately tappable.
 */
readonly position: { readonly x: number; readonly y: number }
```

This lives in `engine` rather than in the web app because where a camp sits is a fact about the
battleground, in the same category as `bearing`, which is already there. It is not a rendering
detail that happens to be stored as data.

The obvious objection is that "normalised" is meaningless without a frame, which would couple an
engine type to whichever image we happened to ship. The contract is therefore stated the strict
way round:

> **The image is cropped to the playable extent. Coordinates are relative to that box.**

The image conforms to the coordinates. A later re-crop is a change to the asset and its crop,
never to the fifteen map files.

### Bearing is kept, and becomes checkable

`bearing` is not replaced. It remains the camp sort order (`packages/engine/src/view.ts:232`)
and it is what the voice says, since compass names spoken aloud are unambiguous and cost the
player nothing.

Holding both means they can now contradict each other, and across 15 battlegrounds × ~6 camps
the likely authoring error is a transposed coordinate pair. So they are cross-checked (see
Validation).

### The image asset

Image metadata does **not** go in `engine`. `MapDefinition` stays free of it, preserving the
zero-dependency reuse obligation. `packages/maps` gains a separate export:

```ts
export interface MapImage {
  readonly src: string
  readonly width: number   // intrinsic pixels, so the frame reserves its aspect before load
  readonly height: number
}

export const mapImages: Readonly<Record<string, MapImage>>
```

Keyed by map id, with a missing entry meaning the map falls back to the existing rail.

A missing entry is a **supported outcome, not a gap**. Five battlegrounds — Battlefield of
Eternity, Blackheart's Bay, Cursed Hollow, Dragon Shire and Sky Temple — are published in the
wiki's map category only as annotated renders, and an annotated render cannot ship (see
Assets). Where no unmarked render can be sourced, that battleground keeps the rail. The same
branch covers an image that fails to load at runtime.

## Assets

Fifteen renders from the wiki's `Category:Battleground maps`, which covers every battleground in
the pool. Fetched once by hand, cropped to the playable extent, resized to roughly 800 px wide,
converted to WebP, committed to `apps/web/public/maps/<map-id>.webp`. Around 60 KB each, under
1 MB total.

A one-off manual job rather than a fetch script: the game is no longer being updated, so
automation would be ceremony around something that happens once.

Images with the camps already marked — the wiki's "areas of interest" set, or Icy Veins' camp
maps — are the **authoring reference**, not the shipped base. Their markers are baked into the
pixels, so shipping one would put a permanently-green marker under every state dot: six camps
rendered as twelve, half of them never changing. That is a display asserting something it cannot
derive, which principle 1 forbids. They are used to read coordinates off and then discarded.

`vite-plugin-pwa` must precache the map images. Mid-match offline resilience is a stack
requirement, and a map view that blanks when the phone drops signal is worse than the rows it
replaced.

### Known irregularities

- **Haunted Mines** has two renders, surface and mine. Camps are on the surface; the surface
  render ships and the mine render is not used.
- **Alterac Pass** and **Braxis Holdout** set `campsSuppressedDuringObjective`. Their dots enter
  the `away` state during the objective, which the existing projection already produces.

## The tap

The map's largest single win is that one tap needs no disambiguation. `CampChip.offerTaken` and
`CampChip.offerUp` are mutually exclusive by construction: the app either believes a camp is
standing, in which case only "we took it" is meaningful, or believes it is not, in which case
only "it's up" is. So:

**Tapping a dot performs whichever action is on offer for that camp.** No long-press, no mode
toggle, no second button.

A mis-tap self-heals. Tapping "taken" by mistake sends the camp down; the offered action flips
to "it's up"; tapping the same dot again restores it. This falls out of principle 2 — anchors
overwrite rather than accumulate, so there is no log to unwind and no undo to build.

When neither action is offered, as during objective suppression, the dot is inert and visibly
so.

## Rendering

The map is a **second renderer for the existing `CampChip[]`**, not a second model. It consumes
`state` and `tone` verbatim so belief semantics cannot drift between the two views.

Colour comes from the chip's existing `tone` and is not recomputed. The table below describes
only the **shape** each state takes, so the two renderers cannot disagree about belief:

| `CampChipState` | Dot shape |
| --- | --- |
| `up` | Solid fill, `UP` |
| `unconfirmed` | Hollow ring, `?` — never a solid assertion |
| `down` | Dim fill with the respawn countdown in tabular numerals |
| `away` | Dashed outline, no number |

Because tone is passed through, the existing rule holds without restating it: green for what is
known, amber for what is estimated, and team blue and enemy crimson never reused for either.

Each dot is a real `<button>` carrying the same `aria-label` the rows carry today, so screen
reader support does not regress.

`MapPanel` replaces `CampPanel` at `apps/web/src/app.tsx:250` for any map that has an image;
the surrounding layout is untouched. **`CampPanel` is retained, not deleted**, and renders
whenever `mapImages` has no entry for the map — which is the case for `fallbackMap`, the
unknown-battleground path in `packages/maps/src/fallback.ts`. The rail is the degraded mode, and
the degraded mode must keep working.

## Announcements

Three changes to the existing `camp-available` cue. The behaviour chosen — spoken, but only when
it matters — is largely what `arbitrate.ts` already does: `evaluateCues` speaks only `active[0]`
after sorting by band then score, and `factsPermit` refuses any cue resting on a camp that fails
`isClaimable`. Camp announcements therefore already lose to objective and tier cues, and already
go silent once belief has decayed. No new gate is needed.

**1. Name the camp.** `renderSpoken` in `packages/engine/src/cues/arbitrate.ts` substitutes
`{time}` and nothing else. It learns `{camp}`, resolved from the match's existing `subject` field
by looking the id up in `ctx.map.camps` and taking its `label`. `camp-available`'s `spoken`
becomes `"{camp} is up."`

The same substitution must also be applied to `display`, which is currently passed through
untouched. Without that the screen would read "Camp is up." while the voice named which one.

**2. Rank by what is worth interrupting for.** The cue returns `score: pressureValue` for the
matched camp. `CueMatch.score` already exists and already overrides `priorityWithinBand` in the
sort. A boss (9) therefore outranks a siege camp (6) when both come up in the same tick. This is
what makes the boss case work, and the boss case is the one where mistiming is expensive.

**3. Correct the cooldown.** `cooldownSeconds` is keyed on `lastFiredByCue[cue.id]` — per cue,
not per camp. At its current 120 seconds one siege camp mutes every other camp for two minutes,
including a boss. Per-availability-window deduplication is already handled by `fired[match.key]`,
whose key includes the camp id and `availableSince`. So `cooldownSeconds` drops to 30 and acts
only as a rate limiter on bursts.

Lead-time announcements are **not** in scope. Arrival is arguably late for a boss, but that is a
separate cue with its own threshold and priority, it is purely additive, and bundling it makes
this change harder to judge in a real match.

## Validation

`packages/maps/src/schema.ts` is the enforcement point. It runs from
`packages/maps/test/schema.test.ts`, which iterates every battleground and asserts zero issues,
so a violation fails the test suite.

**Bearing agrees with position.** Each named component constrains one axis, and an axis the
bearing does not name is unconstrained:

- a bearing containing `n` requires `y < 0.5`; containing `s` requires `y > 0.5`
- a bearing containing `w` requires `x < 0.5`; containing `e` requires `x > 0.5`
- `c` constrains nothing

So `nw` constrains both axes, `n` constrains only `y`, and `c` is exempt. Deliberately a
half-plane test rather than a derived-bearing equality: the point is to catch a transposed or
mistyped pair, not to relitigate whether a camp sitting near the middle is `n` or `ne`.

**Camps stay separately tappable.** A new `validateMapImage(map, image)` — separate from
`validateMap`, because only this check needs the image's aspect ratio — asserts a minimum
centre-to-centre separation of **0.13** between any two camps, measured in units of rendered
width:

```
distance = sqrt(dx² + (dy × height / width)²)
```

A 44 pt target on a 370 pt-wide map is 0.119 of the width, so 0.13 guarantees no overlap with a
small margin. Boss and bruiser camps sharing a corner is common in this game, so some maps are
expected to need their markers nudged apart; that is the check doing its job, not a false
positive.

## Testing

Vitest, in `packages/engine/test` and `packages/maps/test`:

- Schema rejects a bearing that contradicts its position.
- `validateMapImage` rejects a pair closer than 0.13 and accepts one at 0.14.
- Every battleground passes both, with real coordinates.
- `{camp}` substitution renders the camp's label in both `spoken` and `display`.
- A boss outranks a siege camp when both match in the same tick.
- Tapping a camp then tapping it again returns the anchor set to its original size — principle 2
  holds through the flip.

The web package has **no DOM testing tooling** — no React Testing Library, no Playwright,
despite `CLAUDE.md` naming Playwright for this purpose. Its tests are pure logic tests in
Vitest. Rather than introduce a browser harness for this change, the logic worth testing is
kept out of the component:

- Positions, bearings and separation are validated in `packages/maps`, not at render time.
- `mapImages` is checked against the files actually committed, so a missing or renamed asset
  fails the suite rather than showing a blank frame mid-match.
- The self-healing tap is characterised at the reducer level in `apps/web/test/match.test.ts`:
  recording a camp taken and then up leaves one anchor per claim, so principle 2 holds through
  the flip.

`MapPanel` itself is chrome over data those tests validate. It is verified by looking at it —
`pnpm dev`, a match on a mapped battleground, at phone width.

## Out of scope

Pinch-zoom, panning, per-camp detail popovers, and a map on the setup screen. The map replaces
the camp *list*, not the camp *vocabulary*: compass names stay in the data and in the speech.
