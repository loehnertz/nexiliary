# nexiliary design

Date: 2026-09-05
Status: approved. The architecture is designed in `architecture.md`; implementation has not
started.

Companion documents: `architecture.md` for how this is built, `features.md` for the full
feature catalogue including everything deferred and rejected, `research.md` for game timing
data and technical constraints, `design/live-view-mockup.html` for the approved visual
direction.

## Purpose

nexiliary is a companion for playing Heroes of the Storm. From the moment the player spawns
into a match it tells them what is coming and when, by voice and on a phone or second
screen.

v1 covers the live match only. A post-game review that reads the replay file and grades the
same decisions the app was coaching is designed below but deferred; the design is retained
because it shapes decisions that have to be made now.

The game has no official API and none is coming, so nexiliary derives everything from
the match clock plus a small number of user-supplied anchor points.

## Principles

These came out of the design discussion and every decision below follows from them.

1. Never assert what cannot be derived. Every displayed fact carries a confidence level.
2. Anchors overwrite rather than accumulate. There is no event log to corrupt, so the
   model cannot drift.
3. Missing input is a supported state, not an error. The app widens its uncertainty and
   stays correct.
4. Input is source-agnostic. A tap, a teammate's tap, and later an OCR reading or a
   global hotkey are the same thing to the engine.

Principle 1 is the reason the project exists in this shape. An assistant that confidently
asserts a game state it cannot verify is worse than one that says nothing, because the
player acts on it mid-fight.

## Scope

### In scope for v1

The live match only, from the moment the player spawns in. Coaching spoken and displayed,
driven by the match clock and re-anchor taps. Shared sessions over a relay so a whole team
runs one clock.

Nothing before the match (no draft support) and nothing after it (no review). The app's job
starts at spawn and ends when the match does.

All 15 battlegrounds are the target, but a map ships only once its timings are verified
(see "Timing data sourcing and verification"). Five maps currently have no published
timings at all. Unverified maps degrade to the always-exact events rather than being
absent, so the app is never useless on a map, only less specific.

### Deferred, with the architecture kept open for it

The post-game review, designed in full below because it constrains decisions that have to
be made now. Its grading dimensions are what the live prompts are chosen to match, and the
obligation that replay parsing emit a neutral match timeline comes from it.

A desktop companion running on the gaming PC (screen OCR of the in-game clock, global
hotkey re-anchoring, replay folder watching, speech output routed into voice chat). A
Discord bot that joins the team voice channel and speaks the prompts.

### Replay parsing in v1

Replay parsing stays in v1, but as an offline development tool rather than a shipped
feature. It has no UI, does not run in the browser, and `heroprotocol` is not in the app
bundle. Its job is to derive verified objective and camp timings and to calibrate the
estimation bands from a corpus of matches, emitting `maps` data files.

This is not optional. Five battlegrounds have no published timings at all and the ten that
do have contradictory sources, so the live feature cannot ship accurate numbers without it.

### Out of scope

Draft assistance. This is already well served by HOTS GG, hotspatchnotes and
heroescounters, and it needs a different input model.

Anything requiring live game state that the clock cannot supply: hero positions, current
team levels, who is alive, enemy cooldowns. Tracking these would need per-event user input,
which violates principle 2.

## The timing engine

The core of the product is one pure function:

```
project(mapDefinition, clockNow, anchors) -> TimedEvent[]
```

It has no I/O, no framework dependency and no clock of its own. Time is a parameter. The
live view calls it, and so does the offline timing tool, and so would the deferred review.
That is what makes the review cheap to add later rather than something to build now.

### Anchors

An anchor pins a known real-world moment to a known game fact.

```ts
type AnchorType = 'MatchStart' | 'ObjectiveEnded' | 'CampTaken'

interface Anchor {
  type: AnchorType
  subject?: string        // camp id, for CampTaken
  gameTimeSeconds: number
  wallClock: number
  source: string          // 'local' | 'peer' | 'ocr' | 'hotkey' | 'replay'
}
```

A new anchor replaces the previous anchor for the same type and subject. The engine never
branches on `source`; it is metadata for display and debugging only. That is the seam that
makes the deferred desktop companion additive rather than invasive: it becomes another
publisher of the same events.

### Confidence

```ts
type Confidence =
  | { kind: 'Exact' }
  | { kind: 'Estimated'; lowSeconds: number; highSeconds: number }
  | { kind: 'Unknown' }
```

Confidence propagates along the chain of derived events. An `ObjectiveEnded` anchor makes
the next objective spawn `Exact`. The one after that is `Estimated` with a band derived from
observed cycle lengths, and each further step widens. A new anchor collapses the band back
to `Exact` and re-derives everything downstream.

Confidence also governs wording, which is how the app stays honest out loud without becoming
annoying:

| Confidence | Display | Spoken |
| --- | --- | --- |
| Exact | `Beacons - 0:30` | "Beacons in thirty" |
| Estimated | `Beacons - ~0:25-1:05` | "Beacons due soon" |
| Unknown | greyed, no countdown | silent |

Colour carries confidence consistently everywhere in the UI: green for exact, amber for
estimated, grey for unknown.

### Always-exact events

Four things need no input at all and form the floor the app never drops below:

- Minion waves, on a 30 second cadence from match start.
- The current death timer length, from the game-time curve.
- Initial mercenary camp spawns.
- The first objective of the match.

Talent tiers are always `Estimated`, because reaching level 10 depends on how well the team
soaks. Presenting a tier countdown as exact would violate principle 1.

## Map definitions

Maps are data, not code. Adding or correcting a battleground is a data change validated by
schema tests in CI, never a logic change.

```ts
type Provenance = 'verified' | 'archive' | 'published' | 'unknown'

interface MapDefinition {
  id: string
  name: string
  provenance: Provenance            // governs the confidence its timings may claim
  objective: {
    name: string                    // "Beacons", "Altars", "Tributes"
    firstSpawnSeconds: number
    respawnRule: RespawnRule        // offset from resolution of previous cycle
  }
  camps: CampDefinition[]
}
```

Maps carry the data cues read, not cue definitions. Cues live in `engine` and are
map-agnostic; a battleground shapes their behaviour through its camp metadata rather than by
supplying its own rules. `architecture.md` covers this under "How map variation is
expressed".

`provenance` records where a map's timings came from, and the engine reads it rather than
trusting the numbers on sight:

- `verified` - measured from current replays. May be presented as `Exact`.
- `archive` - measured from the 2015-2019 replay archive. Development use only. Never
  presented as `Exact`; degrades to `Estimated` with a wide band.
- `published` - taken from a wiki or guide. Same treatment as `archive`.
- `unknown` - no data. The map falls back to the always-exact events.

This is what makes "no map ships without verified numbers" enforceable rather than a note
someone has to remember. Development can proceed freely against `archive` data, and the app
physically cannot claim precision it has not earned. Promoting a map to `verified` is a data
change.

Because every battleground chains its objective cycle off the resolution of the previous
one rather than a fixed clock, `respawnRule` is always expressed relative to an
`ObjectiveEnded` anchor, with a fallback estimation band for when no anchor exists.

An unrecognised map degrades to the always-exact events plus the death timer and level
curve. This covers ARAM maps and any future rotation change without a release.

## Cues and prompts

A cue is a rule: a condition plus a template. A prompt is the sentence a cue produces when it
matches. Cues are the part of the system expected to grow indefinitely as more coaching is
identified, so `architecture.md` describes the structure that keeps adding one cheap.

Cues are map-agnostic wherever possible, with per-map variation supplied by map data rather
than by branching inside the cue. Each prompt is phrased as a condition the player evaluates,
never as an assertion about the world:

- "Beacons in 30, reset if you are not full."
- "Siege camp up in 15, starting now lands it during the fight."
- "Level 10 range in about 40 seconds, avoid an even fight if they hit it first."

Phrasing as a condition is what keeps prompts safe without game state. Prompts inherit the
confidence of the event that triggered them and change wording accordingly. Cues never fire
on `Unknown` events.

When several cues match at once, one arbitration step chooses. Speech takes only the highest
scoring prompt, because two sentences spoken over each other in a teamfight is worse than
silence.

Verbosity tiers control which prompts speak. Objectives and level 10 are on by default;
wave spawns are off by default, because a voice that talks every 30 seconds gets muted
within two games.

## Live view

Responsive, with phone portrait as the primary target and a desktop layout as a
first-class second. The chosen layout combines a dominant countdown with a compact rail
of upcoming events:

- A single large countdown for the next objective, styled by confidence, legible from
  peripheral vision at roughly 60cm.
- A rail beneath it showing the next four events in order with their own confidence
  colouring, which answers "what is after this" for camp-stall decisions that plan two
  events ahead.
- The active prompt.
- One large "objective ended" re-anchor button. The rail entries double as camp buttons: a
  camp chip is tappable while that camp is believed available, and tapping marks it taken.
  Only starting the match is required input; everything else improves precision and nothing
  else is needed for correctness.
- Match clock and map name in a header strip.
- A talent tier row rendering 1, 4, 7, 10, 13, 16, 20 with the current tier highlighted and
  the next one marked, in the style of the game's own talent screen.
- A footer strip carrying current death timer length, estimated team level, and the count
  of teammates synced to the session.

If the rail proves busy under stress it can be hidden, degrading to the dominant countdown
alone.

## Speech

Web Speech API (`speechSynthesis`). Free, built in, no key, no network, low latency for
short phrases.

Known constraints and their handling:

- iOS silently drops utterances not triggered by a user gesture. The "start match" tap
  doubles as the audio unlock.
- iOS stops speech when Safari backgrounds or the phone locks. Screen Wake Lock keeps the
  page awake, with the silent-video fallback where Wake Lock is unavailable.
- Safari's `getVoices()` is unreliable. Voice selection needs a default-voice fallback path.

## Sessions and the relay

A session is created by one player and joined by teammates via a short code or QR. No
accounts in v1.

The relay accepts anchor events from any participant and fans them out to all others.
Because anchors overwrite, any teammate's re-anchor corrects the whole team's clock, which
is the practical answer to one person forgetting to tap.

```
AnchorEvent { sessionId, type, subject?, gameTimeSeconds, wallClock, source }
```

The relay holds only current session state and does not persist matches. The deferred
Discord bot is a subscriber on the same channel that speaks instead of drawing; the
deferred desktop companion is a publisher on the same channel. Neither requires an engine
change.

Host disconnection does not end a session. Any remaining participant can continue to
publish anchors, and the session expires after a period of inactivity.

## Post-game review (deferred)

Not in v1. Retained here because the live prompts are chosen to match these dimensions, and
because the parser's output shape is fixed by it.

The replay supplies every anchor exactly, so the review runs the same `project()` call with
all confidence resolved to `Exact` and can be fully assertive.

Six dimensions are measured, chosen so that each corresponds to a live prompt. The review
grades only what the coach coaches:

| Dimension | Measured as | Prompt it grades |
| --- | --- | --- |
| Objective readiness | Alive and in position at spawn | "Beacons in 30, reset if not full" |
| Costly deaths | Deaths inside the pre-objective window | "Do not trade a death for this camp" |
| Camp timing | Captures in dead time vs synced to objectives | "Start siege now, lands during the fight" |
| Soak | XP lost to unattended lanes | "Wave in 10, nobody bot" |
| Tier windows | Periods with a talent tier lead and what was done with them | "Level 10 in about 40 seconds" |
| Conversion | Structures taken inside a won fight's death timers | "They are down 2, take the fort" |

Output is a match timeline with three to five ranked findings, each carrying a game clock
time so the player can scrub to it in the replay:

> 4:12 - you died 22 seconds before Beacons. Your team fought the objective 4v5 and lost
> it. The prompt fired at 3:52.

The cap is deliberate. The parser can measure far more, and showing everything turns the
review into a stats page that gets read once.

A trend across recent matches shows whether a habit is shifting. Findings feed back into
prompt priority, so a player who repeatedly misses soak gets soak prompts promoted.

When built, parsing would run client-side, so replays never leave the machine and no
storage, uploads or accounts are needed.

## Packages and architecture

- `engine` - pure TypeScript, zero dependencies. `project()`, the confidence model, prompt
  evaluation, map definition types. The zero-dependency constraint is deliberate: it lets
  the deferred desktop companion reuse it verbatim.
- `maps` - the 15 map definitions as data, plus schema and validation tests.
- `web` - the app. Live view and settings. Owns speech, wake lock and layout. Contains no
  timing logic.
- `relay` - Cloudflare Worker with a Durable Object per session, via `partyserver`.
- `replay` - offline Node tool wrapping `heroprotocol`. Not shipped to the browser in v1.
  Produces a neutral match timeline, from which the timing derivation and band calibration
  scripts read. The deferred review reads the same timeline, which is why it is neutral
  rather than shaped to either consumer.

## Stack

- TypeScript strict throughout.
- Vite + React, built as a static SPA. The app is almost entirely client state, so a
  server-rendering framework would add build complexity and server semantics for no
  benefit. Static output also means the app deploys to any host unchanged.
- `vite-plugin-pwa` for installability and offline resilience mid-match.
- Tailwind, used as a design token layer for the palette and spacing rather than for its
  default look. No component library. See "Visual design" for what the UI actually looks
  like.
- pnpm workspaces.
- Cloudflare Pages for the app, Cloudflare Workers and Durable Objects for the relay via
  `partyserver` (maintained under the `cloudflare` org, one Durable Object per session,
  WebSocket hibernation so idle sessions cost nothing).
- Vitest for `engine` and `maps`, Playwright for live view timing behaviour against a
  mocked clock.

## Visual design

The app takes its visual language from the Heroes of the Storm interface rather than
looking like a default Tailwind web app. The direction was derived from in-game
screenshots (talent screen and in-match panels).

Observed characteristics to reproduce:

- Deep indigo and violet base, near black at the darkest point, with panel fills that are
  semi-transparent and gradient shaded from top to bottom.
- Double stroke panel frames: a thin light periwinkle inner line over a darker outer
  stroke, with a faint inner glow. Corners are square or bevel cut, not rounded.
- Hexagonal and bevel-cut geometry as the recurring motif, seen in ability buttons, hero
  portrait frames, talent icons and the hex tiled minimap ground.
- Slanted parallelogram buttons, built with `clip-path`.
- Divider rules that fade out at both ends, built with gradients.
- Selection and activity shown by soft outer glow rather than by fill.
- Condensed uppercase labels with wide letter spacing; large heavy numerals.

Colour semantics already align with the confidence model. The game uses amber for "your
attention is required" (the CHOOSE A TALENT prompt) and green for health and confirm
actions, so green for `Exact` and amber for `Estimated` reads natively. Team blue and enemy
crimson keep their existing meaning and are not reused for confidence.

Two treatments were mocked, a faithful one carrying the full ornament and a restrained one
keeping only palette and frame. The faithful treatment was chosen: hex-tiled panel fill,
double-stroke bevelled frame with outer glow, fading gradient rules, parallelogram buttons
and the talent tier row.

The tension to manage is that the game's UI is decorative and fairly low contrast, purple
on purple, because the player studies it at rest, whereas the live countdown is read in
peripheral vision under stress. Ornamentation therefore goes in the chrome while the data
area stays high contrast, and the countdown is sized to dominate regardless of what
surrounds it. If real matches show the ornament competing with legibility, the restrained
treatment exists as a fallback reachable by removing texture and glow, without changing
layout.

The talent screen's column headers are the bare numerals 1, 4, 7, 10, 13, 16, 20, which is
the talent tier readout this app needs, already expressed in the game's own idiom.

Typography uses Rajdhani from Google Fonts: angular and squarish in the manner of the
game's numerals, with tabular figures so countdown digits do not jitter.

No Blizzard assets are used. Fonts, icons and ornament are rebuilt in CSS and SVG from
freely licensed sources.

## Dependencies

Neither extreme is the goal. Pull in a library where the problem is a genuine specialist
domain; write it by hand where a library would cost more than the code it replaces.

Taken as dependencies:

- `heroprotocol` for replay parsing, as a development dependency of the offline `replay`
  tool rather than of the app. MPQ archive handling and Blizzard's versioned replay
  protocols are not something to reimplement.
- `partyserver` for the relay. WebSocket lifecycle, room to Durable Object routing,
  broadcast and hibernation handling.
- `vite-plugin-pwa` for service worker and manifest generation.
- Google Fonts for typography.

Written by hand:

- Clock formatting, countdown ticking and all projection maths. These are small, and
  wrapping them in a date library would add weight and indirection for no gain.
- The UI chrome. Reproducing the game's look is the point, so a component library would be
  actively unhelpful.

Judgement calls to make during implementation rather than now: a state management library
only if React state and context prove painful at the scale of one live view, and an
animation library only if hand written CSS transitions prove insufficient for the glow and
pulse effects.

One hard rule: `engine` stays at zero dependencies, because the deferred desktop companion
needs to reuse it verbatim.

## Timing data sourcing and verification

This is the largest non-code risk. Published sources conflict and predate patches. One
guide gives siege camps as first spawn 2:00 with a 3:00 respawn; the wiki gives mercenaries
at 0:30 and bosses at 5:00. Shipping wrong numbers is worse than shipping none, because the
player trusts them during a fight.

Approach: seed from published guides, then verify and calibrate from a replay corpus using
the offline `replay` tool. Measuring actual spawn times across real matches replaces trust
in stale wikis with observation.

Two kinds of number come out of this, and they need very different sample sizes.

Fixed game rules (first objective spawn, the offset after resolution, camp respawn, the
death timer curve) are constants in the game's code. A handful of replays per map settles
each one; no statistics are involved.

The estimation bands are not a game constant. They describe how long humans take to resolve
an objective fight, so they are a distribution and need hundreds of samples to be worth
anything. Bands only matter when the player has not anchored, so they can lag the fixed
numbers without holding up a release.

Corpus sources are covered in `research.md`. Removing the review from v1 does not remove
this work: the tool is on the critical path for the live feature, because without it the app
has no trustworthy numbers to display.

Seed values gathered so far, all requiring verification:

| Map | First objective | Subsequent | Verified |
| --- | --- | --- | --- |
| Battlefield of Eternity | 3:00 | +1:45 after Immortal dies | no |
| Towers of Doom | 3:00 | +1:50 after all Altars captured | no |
| Infernal Shrines | 3:00 | +3:00 after Punisher dies | no |
| Braxis Holdout | 1:30 | +2:10 after Zerg waves die | no |
| Sky Temple | 1:30 | +2:00 after last shot | no |
| Garden of Terror | 1:30 | +3:20 after plants killed | no |
| Dragon Shire | 1:15 | +2:00 after Dragon Knight dies | no |
| Haunted Mines | 2:00 | +2:00 after last grave golem dies | no |
| Cursed Hollow | 1:30 | +0:50-1:40, or +3:00-4:00 if cursed | no |
| Blackheart's Bay | 0:50 (chests) | +2:30-3:15 | no |
| Alterac Pass | unknown | unknown | no |
| Hanamura Temple | unknown | unknown | no |
| Tomb of the Spider Queen | unknown | unknown | no |
| Volskaya Foundry | unknown | unknown | no |
| Warhead Junction | unknown | unknown | no |

Supporting constants, same caveat: minion waves every 30 seconds; regeneration globe
restores 9% health and 7% mana over 5 seconds, lives 6 seconds, becomes neutral after 3;
talent tiers at levels 1, 4, 7, 10, 13, 16, 20; death timers scale from roughly 10 seconds
early to roughly 60 seconds after level 20, exact curve to be derived from replays.

No map ships without verified numbers. A map with unverified data degrades to the
always-exact events.

## Testing

`engine` is a pure function, which makes table-driven tests unusually cheap and valuable.
Cases cover confidence propagation along a chain, anchor overwrite semantics, band widening
with each unanchored step, and degradation to always-exact events.

`maps` gets schema validation plus a check that every prompt references an event the map
actually produces.

`web` gets Playwright coverage of live view behaviour against a mocked clock, including
what happens when an anchor never arrives.

## Milestones

1. `engine` and `maps` with one battleground, fully tested. No UI. Seed timings from
   published guides so development is not blocked on verification.
2. Live view on phone and desktop, manual start, re-anchor tap, speech. Single map.
3. Offline `replay` tool: derive verified timings and calibrate estimation bands from a
   corpus, emitting `maps` data files.
4. Remaining battlegrounds, verified by step 3.
5. Relay and shared sessions.

Steps 1 through 4 have no relay dependency and work as a purely local app, so the relay can
slip without blocking anything. Step 3 gates shipping, not development: milestone 2 can be
built and tuned against seeded data.

`architecture.md` carries a finer-grained build order that supersedes this list for
implementation purposes.

## Risks

Timing data accuracy is the main one, handled above.

Speech becoming noise is the second. Mitigated by verbosity tiers and conservative
defaults. The stronger mitigation, letting the review promote the prompts a given player
actually needs, is unavailable until the review is built.

Prompt wording is unproven until used in real matches. Milestone 2 deliberately ships one
map so wording can be tuned before authoring 15 maps' worth.
