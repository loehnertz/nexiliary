# nexiliary

Heroes of the Storm auxiliary web app.

From the moment you spawn into a match it tells you what is coming and when, spoken aloud
and shown on a phone or second screen: objective spawns, camp timings, minion waves, talent
tier windows, and short prompts about what to prepare.

The game has no live data available to a web app, so nexiliary works from the match clock
plus a small number of anchor taps, and is explicit about how confident it is in any given
number. It never asserts something it cannot derive.

## Status

The live app works, on all fifteen battlegrounds, as a single-player local app. Shared
sessions over a relay are the one thing left and need a Cloudflare account.

No battleground is marked `verified`, so nothing renders as exact except minion waves.
That is deliberate: timings are hand-authored from published guides, and the app is not
allowed to claim precision until a map has been timed by hand in a few custom games.

## Running it

```sh
corepack enable
pnpm install
pnpm dev                              # http://localhost:5173
pnpm --filter @nexiliary/web dev:lan  # also on the LAN, for a phone
pnpm test
pnpm typecheck
```

Use the deployed address on the phone, not a LAN one. Screen Wake Lock requires a secure
context, so on a plain `http://192.168.x.x` address the API is not restricted, it is
absent — the screen sleeps mid-match and takes the speech with it, and there is no
fallback that works. `dev:lan` is for looking at layout on a phone, not for playing.

Settings reports what is actually holding the screen, and says so plainly when nothing is.

## Deploying

```sh
pnpm --filter @nexiliary/web deploy
```

A Cloudflare Worker serving static assets. Real certificate, so Wake Lock works and the
service worker registers, which is what makes it installable — an installed PWA is also
markedly harder for a phone to discard mid-match.

Pick a battleground, tap **start match** as you spawn in, then tap **objective ended**
during the regroup after each objective fight. That tap is the whole interaction. Without
it the app is accurate for a few objective cycles and then honestly goes quiet about
objectives, while waves, camps, talent tiers and the death timer carry on unaffected.

## Layout

```
packages/engine   the whole product: projection, confidence, cues. Zero dependencies
packages/maps     fifteen battlegrounds and the cue text, as data with a schema
apps/web          Vite + React SPA. No timing logic
```

## Documents

- [`docs/spec.md`](docs/spec.md) - the approved design
- [`docs/architecture.md`](docs/architecture.md) - packages, projection, clock, relay, tests
- [`docs/implementation-findings.md`](docs/implementation-findings.md) - what building it found wrong in the design
- [`docs/features.md`](docs/features.md) - full feature catalogue, v1 and deferred
- [`docs/game-constants.md`](docs/game-constants.md) - where the game-wide constants came from
- [`docs/camp-data.md`](docs/camp-data.md) - mercenary camp timings per battleground
- [`docs/research.md`](docs/research.md) - timing data, constraints, sources
- [`docs/design/live-view-mockup.html`](docs/design/live-view-mockup.html) - visual direction
- [`CLAUDE.md`](CLAUDE.md) - orientation for AI agents working in this repo
