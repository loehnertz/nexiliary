# nexiliary

A companion app for playing Heroes of the Storm. From the moment the player spawns into a
match it says what is coming and when, by voice and on screen.

This is a personal hobby project and it is self-contained. No conventions from outside this
repository apply to it: the stack, the principles and the constraints are the ones described
below and in `docs/spec.md`, and nothing else.

## Current state

Design and architecture are complete. No application code has been written yet.

v1 is the live match only, from the moment the player spawns in. No draft support before it
and no review after it. The post-game review is designed in `docs/spec.md` but deferred;
read that design before making architectural choices, because the live prompts are chosen to
match its grading dimensions.

The next step is implementation, following the build order at the end of
`docs/architecture.md`. Read the "Before step 1" note there first: a one-day throwaway spike
tests the product hypothesis before any of this gets built.

Then start with `packages/engine`: types, `project`, the objective phase chain, the `now` clamp
and the provenance clamp, with tests throughout and no UI.

## Documents

| File | What it is |
| --- | --- |
| `docs/spec.md` | The approved design. Read this first |
| `docs/architecture.md` | How it is built: packages, projection, clock, relay, test seams |
| `docs/features.md` | Every feature discovered, marked v1 / deferred / rejected |
| `docs/research.md` | Game timing data, technical constraints, and sources |
| `docs/design/live-view-mockup.html` | Approved visual direction as a static reference. Open it in a browser |

## Principles that must not be violated

These are load-bearing. Most of the design falls out of them, and breaking one produces an
app that is worse than useless, because the player acts on its output mid-fight.

0. **The re-anchor tap is a core interaction, not an optional extra.** Without objective anchors
   the app is good for roughly the first ten minutes and then honestly goes quiet on objectives.
   Nothing breaks, but do not design or write copy as though tapping were incidental.
1. **Never assert what cannot be derived.** Every displayed fact carries a confidence level
   of `Exact`, `Estimated` or `Unknown`. Confidence governs both colour and wording,
   including spoken wording. `Unknown` events are silent.
   Two kinds of uncertainty exist and must not be conflated: `Confidence` answers *when* an
   event happens, `Belief` answers *whether* something is true right now (a camp standing).
   Forcing the second into the first produces meaningless time bounds.
2. **Anchors overwrite, they never accumulate.** There is no event log, so the model cannot
   drift. Any feature that asks the user to log a stream of events is the wrong shape and
   was rejected for this reason.
3. **Missing input is a supported state.** The app widens its uncertainty and stays correct.
   Forgetting to tap must never produce a wrong number.
4. **Input is source-agnostic.** Anchors carry a `source` field that the engine never
   branches on. This is what makes the deferred desktop companion additive.

Before adding a feature, check it against principle 1. If it needs live game state the
clock cannot supply (hero positions, who is alive, enemy cooldowns, actual team levels), it
does not belong here. `docs/features.md` records several such rejections and why.

## Architecture obligations

Designed in full in `docs/architecture.md`. The load-bearing ones, which must survive any
refactor:

- `engine` has **zero dependencies**, so the deferred desktop companion can reuse it
  verbatim.
- The relay fans out to subscribers without knowing what they are, so a Discord bot is
  additive.
- Cue conditions are code; cue text, priorities and thresholds are data, so wording and
  review-driven promotion are value changes rather than engine rebuilds.
- Anchors carry an occurrence index in their subject, so cycle identity exists without the
  anchor set becoming a log.
- Map definitions are data validated by schema, never code.
- Replay parsing produces a neutral match timeline rather than review-shaped output, so one
  parse feeds timing verification and estimation-band calibration now, and grading later.
- The live view assumes no review exists. Nothing in v1 may depend on post-match data.

## Stack

- TypeScript, strict, throughout.
- Vite + React, built as a static SPA. Deliberately not Next.js: the app is almost entirely
  client state and would use none of Next's server features.
- `vite-plugin-pwa` for installability and mid-match offline resilience.
- Tailwind as a design token layer only. No component library.
- pnpm workspaces.
- Cloudflare Pages for the app; Cloudflare Workers and Durable Objects for the relay, via
  `partyserver`.
- No replay parsing in v1. Timings are hand-authored from published guides and hand-timing.
  `heroprotocol` is for a deferred offline tool, described in `docs/architecture.md`.
- Web Speech API for spoken prompts.
- Vitest for the pure packages, Playwright for live view timing against a mocked clock.

## Dependency policy

Take a library where the problem is a genuine specialist domain (replay format decoding,
WebSocket and Durable Object lifecycle, service worker generation). Write it by hand where a
library would cost more than the code it replaces (clock formatting, countdown ticking,
projection maths, all UI chrome). `engine` stays at zero dependencies regardless.

## Visual design

The UI reproduces the Heroes of the Storm interface language in CSS: deep indigo and violet,
double-stroke bevelled panel frames, hex-tiled fills, slanted parallelogram buttons, fading
gradient rules, glow for selection, condensed uppercase labels and large tabular numerals in
Rajdhani. It should not look like a default Tailwind app.

No Blizzard assets are used. Fonts, icons and ornament are rebuilt from freely licensed
sources.

Confidence colours are green for `Exact` and amber for `Estimated`, which matches the game's
own use of green for health and amber for "your attention is required". Team blue and enemy
crimson keep their existing meaning and are never reused for confidence.

## Environment

The game is played on Linux under Proton, several sessions a week, so current replays are
available on request. This matters twice: replay paths live inside a Wine prefix rather than
at the native Windows location, and the deferred desktop companion targets Linux, where
global hotkeys and screen capture behave differently under Wayland than under X11.

Development happens on macOS.

## Conventions

- Branch per unit of work; do not commit directly to `master`.
- Timings are hand-authored and sources conflict. The validated per-map table is in
  `docs/architecture.md` and supersedes the older seed table in `docs/research.md`. A map never
  renders `Exact` until hand-timed and marked `verified`; unverified maps still render
  estimates, and only a map with no data falls back to waves, tiers and the death timer.
