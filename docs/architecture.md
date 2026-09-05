# nexiliary architecture

Date: 2026-09-05
Status: designed, not implemented.

This document turns `spec.md` into a buildable structure. It covers package boundaries, the
shape of the projection, how the clock drives rendering, the relay protocol, the offline
replay tool, and the test seams. Read `spec.md` first for what is being built and why.

## Shape of the system

```
packages/
  engine/     pure domain logic, zero dependencies
  maps/       battleground data, schema, validation
  replay/     offline Node tool, not shipped to the browser
apps/
  web/        Vite + React SPA
  relay/      Cloudflare Worker with Durable Objects
```

Dependencies run one way only:

```
maps ---> engine        (maps imports engine's types)
web  ---> engine, maps
relay -->                (depends on neither; it moves opaque anchor payloads)
replay-> engine, maps    (reuses domain types, emits maps data)
```

`relay` deliberately depends on nothing. It routes and stores anchors without interpreting
them, which is what lets the protocol outlive changes to the domain model, and what lets the
deferred Discord bot subscribe without pulling in the engine.

## engine

The whole product is here. Everything else is transport, presentation, or data.

Constraints: no dependencies, no I/O, no access to a clock. Time enters as a parameter and
never as `Date.now()`. This is what makes the deferred desktop companion able to reuse it
verbatim, and it is also the single reason the test suite can be table-driven.

### Domain types

```ts
type Seconds = number      // game time; 0 is match start
type Millis = number       // wall clock, epoch based

type AnchorType = 'MatchStart' | 'ObjectiveEnded' | 'CampTaken'

interface Anchor {
  type: AnchorType
  subject?: string         // camp id, for CampTaken
  gameTimeSeconds: Seconds
  wallClock: Millis
  source: string           // 'local' | 'peer' | 'ocr' | 'hotkey' | 'replay'
}

type Confidence =
  | { kind: 'Exact' }
  | { kind: 'Estimated'; low: Seconds; high: Seconds }
  | { kind: 'Unknown' }

type EventKind = 'objective' | 'camp' | 'boss' | 'wave' | 'tier'

interface TimedEvent {
  id: string               // stable across re-projection; see below
  kind: EventKind
  label: string            // "Beacons", "Siege camp", "Level 13"
  at: Seconds              // best estimate; midpoint when Estimated
  confidence: Confidence
  cycle?: number           // objective cycle index, 0 based
}
```

`TimedEvent.id` is stable across re-projections: `objective:3`, `camp:siege-top:2`,
`wave:14`, `tier:13`. Stability matters because prompts are keyed by event id, and a
re-anchor must not cause a prompt to fire twice for the same underlying event.

### Anchors are a map, not a list

Anchors are stored keyed by `${type}:${subject ?? ''}`. Writing an anchor replaces the entry.
There is no append path anywhere in the system, which is principle 2 expressed as a data
structure rather than as a rule people have to follow.

Two consequences worth stating: the anchor set is bounded regardless of match length, and
last-write-wins is the only conflict rule the relay ever needs.

### Projection

```ts
interface Timeline {
  events: TimedEvent[]     // sorted by `at`
  validUntil: Seconds      // see "Why validUntil exists"
  provenance: Provenance
}

function project(map: MapDefinition, anchors: AnchorSet, now: Seconds): Timeline
```

Internally this is a merge over independent generators, each of which produces events for one
source and knows nothing about the others:

```ts
type Generator = (ctx: ProjectionContext) => TimedEvent[]

const generators = [waves, camps, objectives, tiers]
```

`project` runs each, concatenates, sorts by `at`, prunes what is far in the past, truncates
to a horizon of the next handful of events, then applies the provenance clamp. Adding a new
kind of timed event is a new generator and nothing else.

#### The objective chain, and how confidence widens

Every battleground chains its objective cycle off the resolution of the previous one, so this
generator carries all the real complexity. One cycle looks like:

```
spawn(n) --> [fight happens] --> resolution(n) --> spawn(n+1) = resolution(n) + offset
```

`offset` is a fixed game constant per map. `fight` is not a constant at all; it is how long
humans take to finish the objective, and it is calibrated from replays as a distribution
`{ p10, median, p90 }`.

The generator walks cycles forward from the most recent anchor:

- `spawn(0) = map.objective.firstSpawnSeconds`, `Exact`.
- Given an `ObjectiveEnded` anchor for cycle k at time t, `spawn(k+1) = t + offset`, `Exact`.
  The anchor supplies the resolution directly, so no estimation is involved.
- Without an anchor, resolution must be estimated:
  `spawn(k+1).low  = spawn(k).low  + fight.p10 + offset`
  `spawn(k+1).high = spawn(k).high + fight.p90 + offset`
  `spawn(k+1).at   = spawn(k).at   + fight.median + offset`

The band therefore widens by `(fight.p90 - fight.p10)` per unanchored step, and collapses to
zero the moment an anchor arrives. Nothing accumulates: the walk restarts from the newest
anchor every time, so a stale anchor cannot poison later cycles.

When band width exceeds `maxUsefulBand` (start at 120 seconds, tune against real data),
confidence drops to `Unknown` and every later cycle in that chain is `Unknown` too. A
four-minute range is not information, and showing it would train the player to ignore the
amber state that does carry meaning.

#### Camps

Camps are simpler because each is independent. First spawn is a constant. A `CampTaken`
anchor for that camp gives `respawn = anchor + camp.respawnSeconds`, `Exact`. With no anchor,
the camp is either up (if past first spawn and never taken) or `Unknown`.

Camps never chain, so a camp band never widens. This is worth knowing when reading the code:
all the widening logic lives in one generator.

#### Waves and tiers

Waves are a pure function of game time on a 30 second cadence and are always `Exact`.

Tiers derive from an estimated level curve and are always `Estimated`, because reaching level
10 depends on how well the team soaks. The band comes from the spread of observed level
timings in the corpus. Never `Exact`, regardless of anchors, since no anchor supplies it.

#### The provenance clamp

The final step of `project` is a single function:

```ts
function applyProvenance(events: TimedEvent[], p: Provenance): TimedEvent[]
```

If provenance is not `verified`, every `Exact` becomes `Estimated` with a band reflecting
uncertainty in the underlying constant, and `unknown` provenance drops map-specific events
entirely, leaving only waves, tiers and the death timer.

This is one choke point rather than a condition scattered through the generators. Generators
compute as if their numbers were right; the clamp decides what the app is entitled to claim.
It is the mechanism behind "no map ships without verified numbers", and it is trivially
testable in isolation.

### Why `validUntil` exists

A naive design re-runs `project` every tick. A projection is not cheap enough to want that
sixty times a second, and it is also not necessary: the events' absolute times do not change
as the clock advances. Only the remaining time does, and that is subtraction.

But projections are not valid forever either. When an estimated band elapses with no anchor,
the chain has to be re-derived from a later starting point.

So `project` returns the game time at which its own output stops being true, and the caller
re-projects only when anchors change or when `now` passes `validUntil`. In practice that is a
handful of projections per match instead of tens of thousands.

Reading the timeline for display is a separate, cheap function:

```ts
function view(timeline: Timeline, now: Seconds): LiveView
```

`view` returns the dominant countdown, the rail entries, the death timer length and the tier
row. It does arithmetic and formatting and nothing else, and it is safe to call every frame.

### Prompts

```ts
interface PromptDefinition {
  id: string
  trigger: { eventKind: EventKind; selector?: string; leadSeconds: number }
  display: string
  spoken: string           // may contain the {time} placeholder
  tier: 'essential' | 'standard' | 'verbose'
  priority: number
  minConfidence: 'exact' | 'estimated'
}

function evaluatePrompts(
  timeline: Timeline,
  now: Seconds,
  settings: PromptSettings,
  fired: ReadonlySet<string>,
): { active: ActivePrompt[]; fired: string[] }
```

Firing is edge-triggered, which means state, and the engine holds no state. The already-fired
set is passed in and the new set comes back out, leaving the caller to own it. Keys are
`${promptId}:${eventId}`, so re-anchoring changes an event's time without changing its
identity, and a prompt that already fired stays fired.

Prompts never fire on `Unknown` events. Whether they fire on `Estimated` is per prompt via
`minConfidence`, because "reset if you are not full" is still useful when the timing is
approximate, while "start the camp now" is not.

Spoken text is built by substituting a phrase produced from the confidence:

```ts
describeTime(confidence, at, now)
// Exact      -> "in thirty"
// Estimated  -> "due soon"
```

One function is the whole of principle 1 in the audio channel. There is no path by which an
estimated event is spoken as though it were exact, because the phrasing is derived rather
than authored.

### Derived scalars

```ts
function deathTimerSeconds(now: Seconds): Seconds     // Exact, from a curve table
function estimateLevel(now: Seconds): Estimate        // always Estimated
```

Both are pure functions of game time and need no anchors, which is why they survive as the
floor the app never drops below.

## maps

Data plus a schema plus tests, with no logic.

```
packages/maps/
  src/
    schema.ts                 zod-free hand-written validator, to preserve zero deps upstream
    battlegrounds/
      braxis-holdout.ts
      infernal-shrines.ts
      ...
    fallback.ts               used for unrecognised maps
    index.ts
  test/
    schema.test.ts
    coverage.test.ts
```

Validation runs in CI and asserts more than shape:

- Every prompt's `trigger.eventKind` is a kind the map actually produces.
- Every prompt's `selector` matches a camp or objective that exists.
- `provenance` is present, and any map claiming `verified` carries a corpus reference.
- Timing values sit inside sane bounds, so a misplaced decimal fails the build.

The fallback definition is what an unrecognised map degrades to: waves, tiers and the death
timer, with `provenance: 'unknown'`. It also covers ARAM maps and any future rotation change
without a release.

## apps/web

### Layers

```
main.tsx
  providers            match state, settings, relay connection
  routes               live view, setup, settings
  components           presentation only, no timing logic
  services             clock, speech, wake lock, relay client, persistence
  hooks                bindings between services and React
```

The rule that keeps this maintainable: components receive a `LiveView` and render it.
No component calls `project`, computes a countdown, or reasons about confidence beyond
choosing a colour from a value it was handed.

### The clock

Naive `setInterval` accumulates drift and is throttled hard in background tabs, which is
exactly the situation a phone sitting beside a keyboard ends up in. So the tick never
accumulates:

```ts
gameTime = (Date.now() - matchStartWallClock) / 1000 + matchStartGameTime
```

A 250ms interval recomputes from wall clock every time, so a throttled or skipped tick
self-corrects on the next one rather than falling permanently behind. Countdown text updates
at 250ms, which is imperceptibly different from 60fps for a digit that changes once a second,
and costs nothing.

### State

Anchors are the only real state, and there are at most a handful. React `useReducer` behind a
context is sufficient and no state library is warranted:

```ts
type MatchAction =
  | { type: 'MATCH_STARTED'; mapId: string; wallClock: Millis }
  | { type: 'ANCHOR_SET'; anchor: Anchor }
  | { type: 'ANCHORS_REPLACED'; anchors: Anchor[] }   // relay state sync on join
  | { type: 'MATCH_ENDED' }
```

The reducer is pure and shares the engine's overwrite semantics. `ANCHORS_REPLACED` exists
for joining an in-progress session, where the relay sends the whole anchor set at once.

Memoisation: the timeline is memoised on `(mapId, anchorSet, provenance)` and recomputed when
`now > timeline.validUntil`. Everything else is `view()`, run per tick.

### Speech

A singleton service outside React, because speech is a queue with rate limiting and must not
be affected by re-renders.

Responsibilities: unlock on the first user gesture (the start tap), keep at most one utterance
in flight, drop stale utterances rather than queueing them (a prompt about an event that has
passed must never be spoken late), respect verbosity tiers, and degrade to silence when
`speechSynthesis` is unavailable rather than failing.

Voice selection retries `getVoices()` on the `voiceschanged` event and falls back to the
default voice, because Safari returns nothing on first call.

### Wake lock

Requested when a match starts, released when it ends. Falls back to a looping silent video
where the Screen Wake Lock API is unavailable. Re-requested on `visibilitychange`, since the
lock is dropped when the page is hidden.

### Relay client

Connects on session join, not on app load. Publishes local anchors, applies remote ones.

The app must work fully with the relay unreachable. Connection state is presentational only:
a disconnected session shows a degraded indicator and keeps running on local anchors, and
reconnection triggers a state sync rather than a replay of missed messages. There is nothing
to replay, because anchors overwrite.

### Persistence

`localStorage` for settings and the last used map. No match state is persisted; a match that
outlives a page reload is recovered by rejoining the session, or restarted.

## apps/relay

A Cloudflare Worker routing to one Durable Object per session, via `partyserver`.

```
POST /session            create; returns a short code
WS   /session/:code      join
```

Messages, all JSON:

```ts
type ClientMessage =
  | { t: 'hello'; name?: string }
  | { t: 'anchor'; anchor: Anchor }

type ServerMessage =
  | { t: 'state'; mapId: string; startedAt: Millis; anchors: Anchor[]; peers: number }
  | { t: 'anchor'; anchor: Anchor }
  | { t: 'peers'; count: number }
```

The Durable Object holds a map keyed by `${type}:${subject ?? ''}`, not a log, mirroring the
engine. Writes are last-write-wins on `wallClock`, which is the only conflict rule needed
because an anchor is a statement about a fact rather than an increment. Two teammates tapping
within a second of each other converge on the later tap, and the difference is irrelevant.

Sessions are ephemeral: no persistence beyond the object's lifetime, expiring after a period
of inactivity. Host disconnection does not end a session, since the object outlives any
participant.

The relay never imports `engine`. Anchors are opaque payloads that are stored and forwarded.
That is what allows the deferred Discord bot to subscribe as just another socket.

## packages/replay

An offline Node tool. Not shipped, not bundled, never loaded in a browser in v1.

```
parse(file)        -> MatchTimeline    neutral, no opinion about consumers
derive(timelines)  -> TimingReport     constants and distributions per map
emit(report)       -> map data files with provenance
```

`MatchTimeline` is neutral on purpose. It records what happened with timestamps and does not
shape itself to either consumer, because two consumers exist: the timing derivation now, and
the deferred review later. Shaping it to the first would make the second a rewrite.

CLI:

```
pnpm replay derive --dir <replay dir> --out packages/maps/src/battlegrounds
```

Practical notes for whoever builds this. Map identity comes from parsed replay content and
never from filenames, because the development archive mixes German and English client locales
where `Drachengärten` and `Dragon Shire` are the same battleground. Some archive files sit in
`GameLogs` desync folders and may be truncated, so parse failures are expected and must be
skipped rather than aborting a run. The archive spans 2015 to 2019 and therefore many replay
protocol versions, which is a feature for testing version handling and a trap if those
numbers are mistaken for current ones. Anything derived from it is emitted with
`provenance: 'archive'` and can never render as `Exact`.

`derive` produces two distinct things, and conflating them is the main risk in this tool.
Fixed constants are confirmed from a handful of replays per map; if all of them agree, the
number is settled. Distributions for the estimation bands need hundreds of samples, because
they describe human behaviour rather than game rules. The report records sample counts per
figure so that `emit` can refuse to mark a map `verified` on thin evidence.

## Testing

The design exists to make testing cheap, so the seams are worth stating explicitly.

`engine` carries the great majority of the tests, table-driven, because it is pure and time is
a parameter. The cases that matter most:

- Confidence widening across successive unanchored objective cycles.
- Collapse to `Exact` when an anchor arrives mid-chain, including that later cycles re-derive
  from it rather than from the original start.
- Downgrade to `Unknown` past `maxUsefulBand`.
- Anchor overwrite semantics, including an out-of-order anchor arriving from a peer.
- The provenance clamp at every provenance value.
- Prompt edge triggering, specifically that re-anchoring does not re-fire a fired prompt.
- Degradation to the always-exact floor on an unknown map.

`maps` gets schema and cross-reference validation in CI.

`web` gets Playwright coverage against an injected clock, so time is controllable rather than
waited on. The high-value paths are the match running for fifteen minutes with no anchor ever
arriving, an anchor arriving late, and the relay dropping mid-match.

`relay` gets tests for last-write-wins convergence and for state sync on join.

## Decisions and their reasons

Recorded so they are not silently reversed later.

**Time is a parameter, never read inside `engine`.** Makes the core testable without fake
timers and reusable by the offline tool and the deferred companion.

**Projection is memoised with an explicit `validUntil` rather than recomputed per tick.** The
event times do not change as the clock advances, only the remaining time does. `validUntil`
handles the one case where that is untrue.

**Confidence is a value in the domain, not a presentation concern.** If it lived in the UI,
the audio channel would need its own copy and the two would drift apart.

**The provenance clamp is a single post-processing step.** One place to audit whether the app
can claim more than it knows.

**Anchors are a map with last-write-wins.** Principle 2 as a data structure rather than a
convention, and it makes the relay's conflict rule trivial.

**The relay imports nothing from the domain.** Keeps the protocol stable and lets new
publishers and subscribers appear without touching the engine.

**`MatchTimeline` is neutral rather than review-shaped.** Two consumers, one now and one
later.

**No state management library.** Anchors are the only state and there are a handful of them.

## What is deliberately not designed here

The deferred features in `features.md` are not designed in this document, on purpose. What
this architecture owes them is that they remain additive:

- The desktop companion publishes anchors with a different `source` and reuses `engine`
  unchanged.
- The Discord bot opens a socket to the relay and subscribes.
- The review imports `MatchTimeline` and the same `project`, and adds grading.
- Review-driven prompt promotion changes `PromptDefinition.priority` values, not control flow.

If a change to any of those requires touching `engine`, the boundary has been drawn wrong and
is worth revisiting before proceeding.

## Build order

1. `engine` types, `project`, the objective chain, the provenance clamp. Tests throughout. No
   UI, no data beyond one hand-written map.
2. `maps` schema and one battleground, seeded from published guides with
   `provenance: 'published'`.
3. `apps/web`: clock, live view, speech, wake lock, single map, local anchors only.
4. `packages/replay`: parse against the archive, derive, emit. Promotes maps to `archive` and
   then to `verified` once current replays are available.
5. Remaining battlegrounds as data.
6. `apps/relay` and shared sessions.

Steps 1 to 5 produce a working local app. The relay is last because nothing else depends on
it, and because it is the piece that could be dropped from v1 without disturbing the rest.
