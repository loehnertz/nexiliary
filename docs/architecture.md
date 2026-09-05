# nexiliary architecture

Date: 2026-09-05
Status: designed, not implemented. Revised after review.

This document turns `spec.md` into a buildable structure: package boundaries, the projection,
how the clock drives rendering, the cue system, the input surface, the relay protocol, the
offline replay tool, and the test seams. Read `spec.md` first for what is being built and why.

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
maps  --> engine        (maps imports engine's types)
web   --> engine, maps
relay -->               (depends on neither; it moves opaque anchor payloads)
replay--> engine, maps  (reuses domain types, emits maps data)
```

`relay` deliberately depends on nothing. It routes and stores anchors without interpreting
them, which lets the protocol outlive changes to the domain model and lets the deferred
Discord bot subscribe without pulling in the engine.

## engine

The whole product is here. Everything else is transport, presentation, or data.

Constraints: no dependencies, no I/O, no access to a clock, and no knowledge of the UI. Time
enters as a parameter and never as `Date.now()`. This is what lets the deferred desktop
companion reuse it verbatim, and it is the reason the test suite can be table-driven.

### Two kinds of uncertainty

The domain needs both, and conflating them was a real design error worth naming so it is not
reintroduced.

`Confidence` answers *when will this happen*. It belongs to events on a timeline.

`Belief` answers *is this currently true*. It belongs to states, principally whether a
mercenary camp is standing. There is no meaningful "low and high seconds" for "the siege camp
is probably still up", so it does not borrow the time-band type.

```ts
type Confidence =
  | { kind: 'Exact' }
  | { kind: 'Estimated'; low: Seconds; high: Seconds }
  | { kind: 'Unknown' }

type Belief =
  | { kind: 'Known'; value: boolean }        // an anchor established it
  | { kind: 'Likely'; value: boolean; since: Seconds }
  | { kind: 'Stale' }                        // too long unconfirmed to claim anything
```

`describeTime(confidence, at, now)` renders the first. `describeBelief(belief)` renders the
second. A cue may read either; nothing converts between them.

### Domain types

```ts
type Seconds = number      // game time; 0 is match start
type Millis = number       // wall clock, epoch based

type AnchorType = 'MatchStart' | 'ObjectiveEnded' | 'CampTaken'

interface Anchor {
  type: AnchorType
  subject: string          // '' for MatchStart; see "Anchor keys"
  gameTimeSeconds: Seconds
  wallClock: Millis
  source: string           // 'local' | 'peer' | 'ocr' | 'hotkey' | 'replay'
  schema: number           // anchor payload version; see "Protocol versioning"
}

type EventKind = 'objective' | 'camp' | 'wave' | 'tier'

interface TimedEvent {
  id: string               // stable across re-projection
  kind: EventKind
  trackId?: string         // objective track or camp id
  label: string
  at: Seconds              // the median-accumulated estimate; see "at is the median"
  confidence: Confidence
  cycle?: number
}
```

`EventKind` has no `boss` member. A boss is a camp with `type: 'boss'`, handled by the camp
generator, which is why no boss generator exists.

### Anchor keys, and how cycle identity is represented

Anchors are stored in a map keyed by `${type}:${subject}`. Writing an anchor replaces that
entry. There is no append path and no accumulator.

The subject is what makes an occurrence identifiable:

| Type | Subject | Example key |
| --- | --- | --- |
| `MatchStart` | empty | `MatchStart:` |
| `ObjectiveEnded` | `trackId:cycle` | `ObjectiveEnded:beacons:2` |
| `CampTaken` | `campId:occurrence` | `CampTaken:siege-top:3` |

Including the occurrence index in the subject is deliberate and fixes a real defect. Without
it, every `ObjectiveEnded` in a match collapses onto one key, so no cycle index exists
anywhere, yet `TimedEvent.id` and `CueMatch.key` both depend on one. Inferring the cycle from
`gameTimeSeconds` fails exactly when bands overlap, which is when it matters.

This does not violate the overwrite principle. Tapping twice for the same cycle overwrites
that cycle's entry; a match produces on the order of ten to thirty anchors total, bounded by
match length rather than by tap count, and no entry is ever appended to.

The occurrence index comes from the projection at the moment of the tap: the app records the
cycle it currently believes is in progress. If that belief was wrong, the correction is a later
anchor, which is the mechanism used everywhere else.

### The objective model

One chained objective per map was a generalisation from four battlegrounds and it does not
hold. Sky Temple runs three temples concurrently, Towers of Doom has multiple altars, Cursed
Hollow's respawn is conditional on whether the curse triggered, Haunted Mines is phased, and
Blackheart's Bay separates collection from turn-in.

A map therefore has tracks, each with its own independent chain:

```ts
interface ObjectiveTrack {
  id: string
  label: string                     // "Beacons", "Temple (west)", "Tribute"
  firstSpawnSeconds: Seconds
  respawn: RespawnRule
  concurrentWith?: string[]         // sibling track ids, for display grouping
}

type RespawnRule =
  | { kind: 'afterResolution'; offsetSeconds: Seconds }
  | { kind: 'afterResolutionConditional'
      branches: { conditionId: string; offsetSeconds: Seconds }[]
      defaultOffsetSeconds: Seconds }
  | { kind: 'fixedCadence'; periodSeconds: Seconds }
  | { kind: 'none' }                // one-shot, never returns
```

Most maps have one track with `afterResolution`. Sky Temple has three. Cursed Hollow uses
`afterResolutionConditional`, and since the app cannot observe whether the curse triggered it
takes `defaultOffsetSeconds` with a band wide enough to span the branches. That is the honest
answer: the condition exists, we cannot see it, so the uncertainty is shown rather than
guessed.

Only five battlegrounds have been checked against this model. The remaining ten must be
validated before their data is written, and the model extended if a shape does not fit. That
validation is part of build order step 5, not an assumption.

### Projection

```ts
interface Timeline {
  events: TimedEvent[]        // sorted by `at`
  camps: CampState[]
  validUntil: Seconds
  provenance: Provenance
}

function project(map: MapDefinition, anchors: AnchorSet, now: Seconds): Timeline
```

A merge over independent generators, each producing events for one source and knowing nothing
about the others:

```ts
const generators = [waves, camps, objectives, tiers]
```

Truncation is per generator, not global. Each generator emits its own next few entries and the
merge keeps all of them. A single global horizon over an `at`-sorted list is the wrong design:
waves recur every 30 seconds, so the next four events are always four waves, and the objective,
camps and tiers get evicted along with everything the cues depend on.

Suggested horizons: waves emit the next 4, so `view` can pick without re-projecting; each
objective track emits the next 2 cycles; each camp emits its next availability; tiers emit the
next 2.

#### `at` is the median

`at` is the median-accumulated estimate, not the midpoint of `low` and `high`. Those differ
whenever the fight distribution is skewed, which it is, and `at` drives sorting, the countdown
and every cue threshold, so both definitions must not be in circulation.

Cue thresholds compare against `at`. A cue needing to reason about the band reads `confidence`
explicitly.

#### The objective chain

```
spawn(n) --> [fight] --> resolution(n) --> spawn(n+1) = resolution(n) + offset
```

`offset` is a per-map constant. `fight` is how long humans take to resolve the objective and is
calibrated from replays.

Walking a track forward from its newest anchor:

- `spawn(0) = track.firstSpawnSeconds`, `Exact`.
- Given an `ObjectiveEnded` anchor for cycle k at time t: `spawn(k+1) = t + offset`, `Exact`.
- Without an anchor the midpoint accumulates linearly, because expected values add:
  `spawn(k+1).at = spawn(k).at + fight.median + offset`

The recurrence must be clamped to the present. If cycle k's band has elapsed with no anchor,
the objective cannot have resolved before now, so:

```
low = max(low, now + offset)
```

Without this the app offers a spawn time the clock already rules out, which is principle 1
violated in precisely the state principle 3 claims to handle. The clamp is one line and it also
feeds `validUntil`.

A stale anchor is bounded by the same rule. Tapping once at 4:10 and never again does not let
the chain project confidently into minute fifteen: each unanchored step widens, the clamp
pushes the floor forward, and the chain reaches `Unknown` on schedule.

When every projected cycle of a track is `Unknown`, that is a state the UI shows deliberately
rather than silently. The dominant countdown reads "objective timing lost" with the anchor
button offered prominently. A blank countdown reads as a bug.

#### How the band grows

The obvious approach is wrong. Accumulating percentiles linearly, `low += p10` and
`high += p90` per step, assumes every cycle hits its extreme in the same direction. Independent
draws partially cancel, so a sum of n draws spreads with `sqrt(n)`, not `n`.

Pure `sqrt(n)` is also wrong. Fight durations are positively correlated: a team that resolves
objectives slowly tends to do so every cycle. For n draws with pairwise correlation r:

```
var(sum) = n * sigma^2 + n * (n - 1) * r * sigma^2
```

At `r = 0` growth is `sqrt(n)`; at `r = 1` it is linear. The truth is between, and it is
measurable rather than assumable:

```
spread(n) = z * sigma * sqrt(n + n * (n - 1) * r)      // z = 1.28, an 80% interval
low  = max(at - spread(n), now + offset)
high = at + spread(n)
```

Preferred once the corpus supports it: measure the n-step spread directly, as the observed
distribution of time from a cycle spawn to the spawn n cycles later. That needs no
distributional assumption and no correlation estimate. The formula is the interim model for
tracks with too few samples.

The difference is not academic. With a 40 second p10-to-p90 fight spread, linear accumulation
reaches a 120 second band by the third unanchored cycle; uncorrelated growth does not until
around the ninth.

When band width exceeds `maxUsefulBand` (start at 120 seconds, tune against real data),
confidence drops to `Unknown`, and every later cycle in that track is `Unknown` too.

#### Camps

Camps are independent of each other and never chain, so no camp band widens the way an
objective track does.

Camps have the opposite failure mode. A missing objective anchor produces a widened band, which
is honest. A missing camp anchor would produce a false positive: claiming a camp is available
when someone took it two minutes ago. That is worse than silence, because `stall-camp` would
fire on it.

```ts
interface CampState {
  id: string
  standing: Belief            // is the camp there right now
  nextUp?: TimedEvent         // respawn, when known
  availableSince?: Seconds
}
```

Availability decays from `availableSince` regardless of how availability was derived. This
corrects an earlier version that scoped decay to the no-anchor branch only, which meant one tap
made a camp permanently `Known` and reintroduced the exact bug the model exists to prevent.
Whether availability came from `firstSpawnSeconds` or from `anchor + respawnSeconds`, the clock
since then is what matters.

- Before first spawn: `standing = Known(false)`, with an `Exact` countdown.
- On a `CampTaken` anchor at t: `Known(false)` until `t + respawnSeconds`, then availability
  begins and decay restarts from there.
- From any `availableSince`: `Known(true)` briefly, then `Likely(true)` after `decaySeconds`,
  then `Stale` after `staleSeconds`.

Thresholds are per camp, not global. A boss routinely stands untaken for a whole match while a
contested siege camp falls in twenty seconds, so one pair of constants would make boss
availability `Stale` in essentially every match and quietly kill boss timers. `decaySeconds`
and `staleSeconds` live on `CampDefinition` and are asserted by the `maps` CI check.

Calibration target: these encode the point at which belief is worthless, so they are quantiles
of the survival function, not of time-to-first-capture. Define them as the times by which 50%
and 90% of camps of that type have been taken.

`Stale` means the app stops claiming anything about that camp. It does not mean the camp
vanishes from the UI, and it does not remove the control that could correct it. See "Input
surface".

#### Waves and tiers

Waves are a pure function of game time on a 30 second cadence and are always `Exact`.

Tiers derive from an estimated level curve. A tier the team has already reached may be `Exact`,
since an anchor could establish it; future tiers are always `Estimated`, because reaching level
13 depends on soak nobody can observe. No anchor supplies a future tier.

#### The provenance clamp

The last step of `project`:

```ts
function applyProvenance(t: Timeline, p: Provenance): Timeline
```

Specified, because "downgrade a bit" is not implementable:

- `verified` leaves everything unchanged.
- `archive` and `published` turn every map-derived `Exact` into `Estimated` with a band of
  plus or minus `clampBandSeconds` (start at 20; it represents uncertainty in the constant
  itself, not in human behaviour). Applies to objective and camp events only.
- `unknown` drops map-derived events entirely.

Waves and tiers are exempt at every provenance level. They derive from game-wide rules rather
than per-map constants, so a wrong map file cannot make them wrong. Read literally, an
unexempted clamp would downgrade waves, which is nonsense.

That exemption is what keeps milestone 2 tunable, and it is not sufficient alone: a map seeded
as `published` renders nothing `Exact`, so the exact display path, exact spoken wording and any
cue requiring an exact objective are unreachable. Milestone 2 therefore also carries one
hand-verified map marked `verified`, timed by hand in a few custom games. That is an hour of
work and it unblocks the entire exact path without waiting for the corpus.

### `validUntil`

Re-running `project` every tick is unnecessary, because event times do not move as the clock
advances; only remaining time does, and that is subtraction. But a projection does expire.

`validUntil` is the earliest of:

- the end of the wave block already emitted,
- for each objective track, the `high` of its earliest `Estimated` cycle,
- for each camp, `availableSince + decaySeconds` and `availableSince + staleSeconds`,
- any `nextUp` respawn boundary,
- the `now + offset` clamp becoming binding on any track.

Belief decay is defined at thresholds, not continuously, precisely so this value exists. A
continuously falling confidence would make `validUntil` meaningless and force a projection
every tick, which is the design this section exists to avoid.

The memo key must include it. `(mapId, anchorSet)` alone never changes when a projection
expires, so a naive `useMemo` yields a permanently stale timeline. Recompute when the anchor
set changes or when `now > timeline.validUntil`.

Reading the timeline for display is separate and cheap:

```ts
function view(timeline: Timeline, now: Seconds): LiveView
```

`view` does arithmetic and formatting only and is safe to call every frame.

## Cues and prompts

A cue is a rule: a condition plus a reference to its text. A prompt is what it renders. This is
the subsystem that grows indefinitely, so it is designed for that specifically without becoming
a plugin framework.

Three ways it rots, and the countermeasure for each:

1. Conditions as branches in a shared function. Countermeasure: one cue per file, collected in
   a registry.
2. Map-specific forking. Countermeasure: cues are map-agnostic and ask questions map data
   answers.
3. Arbitration leaking into rules. Countermeasure: selection happens in one place and no cue
   knows another exists.

Honest limits of those claims, so nobody is surprised later. `predicates.ts` and `context.ts`
are shared growth surfaces, and "no existing file grows" is false for those two by design,
since new cues add helpers. They get size budgets and their own tests, and a helper used by one
cue belongs in that cue's file until a second cue needs it. `appliesTo` is a sanctioned escape
hatch for map-specific cues, and CI asserts it stays under a small budget so it does not become
the fork it exists to prevent.

### Text and thresholds are data

Conditions are code, because they genuinely are code. Everything tunable is not.

```ts
// packages/maps/src/cue-text.ts  (data, no logic)
interface CueText {
  id: string
  display: string
  spoken: string              // contains {time}, substituted from confidence
  tier: 'essential' | 'standard' | 'verbose'
  basePriority: PriorityBand
  cooldownSeconds?: number
  thresholds: Record<string, number>
}
```

This preserves an obligation stated in `CLAUDE.md` and `features.md`: prompt text and priority
are data, so review-driven promotion and wording changes are value edits rather than engine
rebuilds. `spec.md` makes wording the thing milestone 2 exists to tune, and putting it in engine
source would mean recompiling to try a sentence. Thresholds travel with it for the same reason:
at thirty cues that is otherwise sixty to a hundred magic numbers in engine source.

### Cue

```ts
interface Cue {
  id: string                              // indexes into CueText
  appliesTo?: string[]
  evaluate(ctx: AdviceContext): CueMatch | null
}

interface CueMatch {
  key: string                             // 'stall-camp:siege-top:cycle-3'
  basedOn: string[]                       // TimedEvent ids and camp ids this rests on
  score?: number
  subject?: string
}
```

`basedOn` is what makes the confidence filter implementable. Arbitration resolves those ids
back to their `Confidence` or `Belief` and applies the rule: a prompt may fire only if every
fact it rests on is at least `Estimated` or `Likely`, and never if any is `Unknown` or `Stale`.
A cue cannot fabricate its own confidence, and a multi-fact cue like `stall-camp`, which rests
on both a camp state and an objective spawn, is handled correctly rather than by a single scalar
that cannot express it.

`spoken` text contains `{time}`, substituted by `describeTime(confidence, at, now)` at render
time. No cue writes a time phrase itself, so no cue can speak an estimated event as though it
were exact.

### Priority

Priority is a named band plus an integer within it, not one undocumented global namespace:

```ts
type PriorityBand = 'critical' | 'high' | 'normal' | 'low'
```

Ties break by band, then integer, then cue id alphabetically, never by registry array order,
which would make speech depend on import order. This lets a test assert "stall-camp outranks
wave-reminder" without encoding a magic number.

### Cooldowns and the fired set

Set membership cannot express a cooldown, so the state carries timestamps and is owned by the
caller:

```ts
interface CueState {
  matchId: string
  fired: Record<string, Seconds>          // CueMatch.key -> when it fired
  lastFiredByCue: Record<string, Seconds> // Cue.id -> when it last fired anything
}

function evaluateCues(
  cues: Cue[], ctx: AdviceContext, state: CueState,
): { active: Prompt[]; state: CueState }
```

`fired` keyed by `CueMatch.key` gives once-per-occurrence semantics. `lastFiredByCue` keyed by
`Cue.id` gives the cooldown, which is what stops a cue chattering across different occurrences.
Both are needed; either alone is wrong.

`matchId` is not decoration. Without it, keys from match one suppress identical keys in match
two and the app goes silent on the second game of the evening. `CueState` is discarded on
`MATCH_ENDED` and recreated with a new `matchId` on `MATCH_STARTED`.

### Arbitration

One function, the only place that knows more than one cue exists. It runs every cue, discards
nulls, resolves `basedOn` and drops anything resting on `Unknown` or `Stale`, drops cues above
the configured verbosity tier, drops fired keys and cues inside a cooldown, sorts by band then
score then id, and takes the top one for speech and the top two for display.

Speech takes only the highest. Two sentences over each other in a teamfight is worse than
silence, and that is enforced once here rather than negotiated between cues.

Cost is negligible: roughly twenty cues at most once a second.

### Re-anchoring and already-fired cues

A subtlety worth stating because the obvious design gets it backwards. Keys deliberately exclude
time, so a cue that fired stays fired. But if an anchor moves an event later, the already-fired
cue stays silent through the corrected moment, which is the opposite of helpful.

Rule: when an anchor changes an event's `at` by more than `refireThresholdSeconds` (start at
15), fired keys whose `basedOn` includes that event are cleared, so the cue may fire once more
at the corrected time. Small corrections do not re-fire; real ones do.

### Context

Every cue reads from one uniform object, built at most once a second. Cues never project, never
call each other, and never touch the anchor set directly.

```ts
interface AdviceContext {
  now: Seconds
  map: MapDefinition
  timeline: Timeline
  nextObjectiveByTrack: Record<string, TimedEvent | null>
  camps: CampState[]
  tier: { current: number; next: TimedEvent | null }
  deathTimerSeconds: Seconds
}
```

`AdviceContext` does not carry settings. Verbosity governs which prompts are spoken, not which
facts exist; including it made the button set depend on speech preferences once controls began
sharing this context. Arbitration reads settings; cues and controls do not.

### Starting set

| Cue | Fires when |
| --- | --- |
| `objective-prep` | Objective approaching; reset if you are not full |
| `stall-camp` | Starting a camp now lands mercenaries at the objective |
| `camp-available` | A camp is up and its respawn is confirmed |
| `tier-spike` | Level 10, 16 or 20 is close |
| `wave-reminder` | A wave is about to spawn; soak it if nobody is there |
| `death-timer-warning` | The death timer has crossed a costly threshold |

Two earlier entries were removed because they required facts the app is forbidden to know.
`wave-soak` fired on "an unattended lane" and `camp-pressure` on "a lull" and "pushing is safe",
which are hero positions and enemy locations, exactly what `spec.md` puts out of scope. Both
survive rephrased as conditions the player evaluates, the same discipline applied to every other
prompt.

### Camp-stall arithmetic

To have mercenaries arrive as the objective starts:

```
startCaptureAt = objectiveSpawn - travelSeconds - clearSeconds - approachSeconds
```

`approachSeconds` is the walk to the camp and was missing, making the advice systematically
late. `travelSeconds` is measured to the objective, not to the lane generally, because the two
differ and the objective is where the pressure is meant to land. On maps where the objective
location changes per cycle, `travelSeconds` is per track rather than a single camp constant.

Camp choice is the highest `pressureValue` among camps whose `standing` is at least `Likely`,
ties broken by camp id. A static argmax names the same camp every cycle of every match, which is
`spec.md`'s "speech becomes noise" risk with a deterministic cause, so `pressureValue` is per
objective track rather than per map, and the cue does not fire for consecutive cycles of the
same track unless the chosen camp differs.

### Layout

```
packages/engine/src/cues/
  index.ts              the registry: an array, one import per cue
  context.ts            buildContext()
  predicates.ts         shared helpers
  arbitrate.ts          evaluateCues()
  objective-prep.ts
  stall-camp.ts
  camp-available.ts
  tier-spike.ts
  wave-reminder.ts
  death-timer-warning.ts
```

Adding a cue is a new file, one import line, and a `CueText` entry. This is deliberately not a
plugin system: no dynamic registration, no manifest, no condition DSL. A cue is an object in an
array and `evaluate` is ordinary TypeScript, so it stays debuggable and directly testable. The
discipline comes from the narrow interface and the shared context, not from machinery.

## maps

Data, schema and tests, no logic.

```
packages/maps/
  src/
    schema.ts
    battlegrounds/braxis-holdout.ts ...
    cue-text.ts
    fallback.ts
    index.ts
  test/
```

CI validates more than shape:

- Every camp carries `clearSeconds`, `travelSeconds`, `approachSeconds`, `pressureValue`,
  `decaySeconds`, `staleSeconds`. A missing field silently disables a cue in play, so it fails
  the build instead.
- Every `ObjectiveTrack` has a `RespawnRule` of a kind the objective generator implements.
- `provenance` is present, and `verified` requires a corpus reference or a hand-timing note.
- Every `CueText` id matches a registered cue, and every threshold a cue reads exists.
- The count of cues using `appliesTo` stays under budget.

The fallback definition covers unrecognised maps: waves, tiers and the death timer, with
`provenance: 'unknown'`. This also covers ARAM maps and any future rotation change without a
release.

## apps/web

### Layers

```
main.tsx
  providers      match state, settings, relay
  routes         setup, live, settings
  components     presentation only
  controls       the AnchorControl registry
  services       clock, speech, wake lock, relay client, persistence
  hooks
```

Components receive a `LiveView` and render it. No component calls `project`, computes a
countdown, or reasons about confidence beyond choosing a colour from a value handed to it.

### Controls live here, not in engine

The control registry is in `web`. `AnchorControl` carries labels and layout placements, and
`engine` must not own UI vocabulary: a desktop companion driven by global hotkeys has no use for
`placement: 'rail'`. `AdviceContext` is the shared interface, exported by `engine` and consumed
by both.

### The clock, and who owns match start

Three write paths for one fact caused real ambiguity. There is now one authority.

The `MatchStart` anchor is the session's start time. `ServerMessage.state.startedAt` mirrors it
for convenience on join; the reducer derives from the anchor.

Local clock offset is separate and never published. Correcting your own late tap must not
re-time your teammates, so the clock adjust control writes a local `clockOffsetSeconds` stored
outside the anchor set. Only an explicit "fix the session clock" action in the overflow menu
rewrites the shared `MatchStart` anchor, and it says so plainly.

```
gameTime = (Date.now() - matchStartWallClock) / 1000 + clockOffsetSeconds
```

Recomputed from wall clock on every 250ms tick rather than incremented, so a throttled or
skipped tick self-corrects instead of falling permanently behind. That matters because a phone
beside a keyboard is exactly the backgrounded-tab case browsers throttle hardest.

### State

```ts
type MatchAction =
  | { type: 'MATCH_STARTED'; matchId: string; mapId: string; wallClock: Millis }
  | { type: 'ANCHOR_SET'; anchor: Anchor }
  | { type: 'ANCHOR_CLEARED'; key: string }        // undo of a first write
  | { type: 'ANCHORS_REPLACED'; anchors: Anchor[] }
  | { type: 'CLOCK_OFFSET_SET'; seconds: Seconds }
  | { type: 'MATCH_ENDED' }
```

`ANCHOR_CLEARED` exists because undoing the first anchor of a key means removing an entry, and
"there is no append path" said nothing about deletion. Removal is the third legal operation on
the anchor set, stated so nobody implements undo as a write of a bogus value.

`MATCH_ENDED` has a producer: an explicit end-match control. Without one it was an action
nothing dispatched, the wake lock was never released, the clock never stopped, and `CueState`
was never cleared.

### Between matches

Where the app spends most of its open time, and previously undesigned.

`MATCH_ENDED` releases the wake lock, stops the clock, discards `CueState`, keeps the session
open, and returns to setup with the map picker focused. The relay session survives so a team
does not rejoin between games.

Setup must be completable inside a 30 to 60 second loading screen, on a phone, one-handed. The
map picker is a grid of 15 named tiles with the battleground selectable in one tap and a large
start button. Recently played maps sort first; "last used map" is a poor default in a rotating
queue and is not used as one.

### Speech

A singleton outside React. Unlocks on the first user gesture, keeps at most one utterance in
flight, drops stale utterances rather than queueing them, respects verbosity tiers, and degrades
to silence when unavailable. Voice selection retries on `voiceschanged` and falls back to the
default, because Safari returns nothing on first call.

### Wake lock

Requested on `MATCH_STARTED`, released on `MATCH_ENDED`, re-requested on `visibilitychange`.
Falls back to a looping silent video where unavailable.

### Relay client

Connects on session join, not app load. The app must work fully with the relay unreachable:
connection state is presentational, a disconnected session keeps running on local anchors, and
reconnection triggers a state sync rather than a replay of missed messages.

### Persistence

`localStorage` for settings and recent maps. No match state is persisted; a match outliving a
reload is recovered by rejoining the session or restarted.

## Input surface

Every button writes or clears an anchor, and anchors overwrite, so no input can produce an
inconsistent state. The worst outcome of a mistap is a wrong number that the next tap or an undo
replaces.

| Control | Where | Writes | Frequency |
| --- | --- | --- | --- |
| Start match | setup | `MatchStart` | once, required |
| Objective ended | live, primary | `ObjectiveEnded` | 4-6, optional |
| Camp chip | live, rail | `CampTaken` | opportunistic |
| Camp is up | live, on a stale chip | restores the camp's belief | rare |
| Clock adjust | live, header | local offset | rare |
| End match | live, header | `MATCH_ENDED` | once |
| Undo | live, transient | reverts last anchor | rare |

Only `Start match` is required.

Camp chips are the rail entries, tappable while a camp's `standing` is at least `Likely`. A
`Stale` camp still shows a chip: it reads "camp?" and offers both "taken" and "camp is up",
because decay must not remove the only control that could correct it. An earlier version made
`Stale` mean no chip, which deadlocked camp coaching for the rest of the match after one missed
tap, in exactly the solo case the documentation identifies as most likely.

Rail slot allocation is fixed rather than emergent, because the rail serves two purposes over
four slots. Slot 1 is always the next objective, slot 2 the next wave, slots 3 and 4 the two
highest-`pressureValue` camps that are `Likely` or `Stale`, falling back to the next tier when
fewer camps qualify. Without a stated rule, a map with four camps up shows no upcoming events at
all.

Tap targets are a minimum of 44 by 44 CSS pixels, which the earlier 10px text in a 60px slot did
not meet. These are pressed without looking, mid-game. The rail's chromelessness is a virtue for
reading and a liability for tapping, and the tap target wins.

Undo covers the one way input actively hurts. It reverts the last anchor write, including
clearing an entry that had no previous value, and it publishes a revert to the relay so peers do
not keep the bad anchor. Its window is 60 seconds, not "a few", because a mistapped objective is
noticed when the countdown looks wrong half a minute later, not within a transient. One level
only; there is no undo stack.

## Adding inputs later

Cues are cheap to add. Inputs must be too, or growth pressure moves to the live view.

### The gate

A proposed input must pass all five:

0. The app can restate the fact without asserting anything it cannot verify. This is principle 1
   applied to inputs, and it is the rule the other four miss: they test the shape of the input,
   not what the app is then entitled to claim.
1. It states a fact, not an increment. Anchors must be overwritable.
2. Something downstream reads it.
3. Forgetting it degrades to silence, never a false claim.
4. It is tappable during a lull.

| Candidate | Verdict |
| --- | --- |
| `TierReached` | Passes, narrowly. It makes the current tier known. It does not make future tiers `Exact`, because those still depend on unobservable soak. Worth having only if a cue needs the current tier |
| `ObjectiveEnded` with a winner | Fails rule 0 as previously written. Winning tells you nobody's death timer, so "they are down two, take the fort" asserts occupancy the app cannot see. A weaker cue phrased as a condition would pass; the example given did not |
| `BossTaken` | Already covered. Boss is a camp type |
| `FortLost` | Fails rule 2 today. Nothing reads it |
| `EnemyDied` | Fails rule 1. A count, not a fact |

### The mechanism

Anchors are read by key, never through a central switch, so widening `AnchorType` touches the
union and nothing else, and an anchor nobody reads is inert.

```ts
interface AnchorControl {
  id: string
  placement: 'primary' | 'rail' | 'header' | 'overflow'
  appliesTo?: string[]
  offer(ctx: AdviceContext): ControlOffer | null
}
```

`offer()` returning `null` mirrors a cue returning `null`. The registry owns what is offered;
the view owns how a placement looks. A control in an existing placement needs no component
change; a new placement is a view change, which is honest, because layout is not something a
registry should own.

Controls and cues read the same `AdviceContext`, built at most once a second, so the rail renders
chips and event entries from one snapshot rather than two that can disagree.

## apps/relay

A Cloudflare Worker routing to one Durable Object per session via `partyserver`.

```
POST /session   { mapId, startedAt }  -> { code }
WS   /session/:code
```

```ts
type ClientMessage =
  | { v: 1; t: 'hello'; name?: string }
  | { v: 1; t: 'anchor'; anchor: Anchor }
  | { v: 1; t: 'revert'; key: string }
  | { v: 1; t: 'match'; mapId: string; startedAt: Millis }

type ServerMessage =
  | { v: 1; t: 'state'; mapId: string; startedAt: Millis; anchors: Anchor[]; peers: number }
  | { v: 1; t: 'anchor'; anchor: Anchor }
  | { v: 1; t: 'revert'; key: string }
  | { v: 1; t: 'peers'; count: number }
```

The object holds a map keyed by `${type}:${subject}`, mirroring the engine. Writes are
last-write-wins on `wallClock`, which suffices because an anchor is a statement about a fact
rather than an increment.

Sessions are ephemeral and expire after 30 minutes of inactivity. Host disconnection does not end
a session, since the object outlives any participant.

### Clock agreement between peers

`gameTimeSeconds` is computed in the publisher's frame, and unsynchronised device clocks make
that a real skew. On `hello` the client exchanges timestamps with the object and stores the
offset, then converts to session time before publishing. Sub-second accuracy is unnecessary;
avoiding a ten-second phone-clock drift is not.

### Protocol versioning

Messages carry `v` and `Anchor` carries `schema`. The risk that matters is not unknown types,
which are inert, but known types with changed semantics: a subject-key format change silently
creating two entries for one camp. A version field is nearly free now and impossible to add
retroactively.

Stored anchors are typed with a widened `type: AnchorType | (string & {})` so an unrecognised
type is representable under `strict: true` and can be stored and ignored rather than forced
through with `as any`. Generators must not assume the set contains only types they know.

## packages/replay

An offline Node tool. Not shipped, not bundled, never loaded in a browser.

```
parse(file)        -> MatchTimeline    neutral, no opinion about consumers
derive(timelines)  -> TimingReport     constants, distributions, survival curves
emit(report)       -> map data files with provenance
```

`MatchTimeline` is neutral because it has two consumers: timing derivation now, and the deferred
review later. Shaping it to the first would make the second a rewrite.

`derive` produces three things, and conflating them is the main risk:

- Fixed constants (first spawn, offsets, respawns), confirmed from a handful of replays per map.
  If they agree, the number is settled; no statistics involved.
- Cycle spread, as `{ median, sigma, r }` per track or empirical n-step quantiles where samples
  allow. Needs hundreds of samples, because it describes human behaviour.
- Camp survival curves per camp type, from which `decaySeconds` and `staleSeconds` are read at
  the stated quantiles.

The report records sample counts per figure so `emit` can refuse to mark a map `verified` on
thin evidence.

Practical notes. Map identity comes from parsed content, never filenames: the development archive
mixes German and English locales. Some archive files sit in `GameLogs` desync folders and may be
truncated, so parse failures are expected and skipped rather than fatal. The archive spans 2015
to 2019 and therefore many protocol versions, useful for testing version handling and a trap if
the numbers are mistaken for current ones; anything derived from it is emitted as
`provenance: 'archive'` and can never render as `Exact`.

## Testing

`engine` carries most of the tests, table-driven, because it is pure and time is a parameter.
The cases that matter:

- Band growth across unanchored cycles, specifically that spread grows sub-linearly. A regression
  to linear accumulation is the most likely wrong implementation and silently costs several
  usable cycles.
- The `now + offset` clamp, including that a long-stale anchor never projects a spawn the clock
  rules out.
- Collapse to `Exact` on an anchor mid-chain, and that later cycles re-derive from it.
- Downgrade to `Unknown` past `maxUsefulBand`, and that the UI receives a distinguishable
  "timing lost" state rather than a null.
- Anchor overwrite per key, out-of-order arrival from a peer, and `ANCHOR_CLEARED`.
- Cycle identity: two `ObjectiveEnded` anchors for different cycles coexist; a repeat tap for the
  same cycle overwrites.
- Camp belief decaying from `availableSince` in both derivations, anchored and unanchored.
- Per-camp thresholds, specifically that a boss does not go `Stale` in a normal match.
- The provenance clamp at every value, including that waves and tiers are exempt.
- `validUntil` being the earliest of its candidates, and the memo recomputing when it lapses.
- Per-generator truncation: a merged timeline is never all waves.
- Cue confidence filtering via `basedOn`, including a multi-fact cue with mixed confidence.
- Re-fire on a large anchor correction, and no re-fire on a small one.
- `CueState` scoped to `matchId`, so a second match is not silent.
- Cooldowns via `lastFiredByCue`, once-per-occurrence via `fired`.
- Deterministic arbitration ordering independent of registry array order.

`maps` gets the schema and cross-reference checks listed above.

`web` gets Playwright against an injected clock: a fifteen-minute match with no anchor ever
given, an anchor arriving late, a second match started immediately after the first, and the relay
dropping mid-match.

`relay` gets last-write-wins convergence, state sync on join, revert propagation, and clock offset
exchange.

## Decisions and their reasons

Recorded so they are not silently reversed.

Time is a parameter, never read inside `engine`. Makes the core testable without fake timers and
reusable by the offline tool and the deferred companion.

Projection is memoised with an explicit `validUntil`. Event times do not change as the clock
advances; `validUntil` handles the cases where that is untrue.

`Confidence` and `Belief` are different types. One answers when, the other answers whether.
Forcing camp availability into a time band produced meaningless bounds and broke rendering.

The occurrence index lives in the anchor subject. Cycle identity has to exist somewhere, and
putting it in the key keeps every entry a single overwritable fact and the set bounded.

Truncation is per generator. A global horizon over an `at`-sorted list is always waves.

The provenance clamp is one post-processing step, with waves and tiers exempt. One place to audit
what the app may claim.

Cue conditions are code; cue text, priorities and thresholds are data. Conditions genuinely are
code. Wording is what milestone 2 exists to tune, and tuning must not mean a rebuild.

`basedOn` rather than a confidence scalar on `CueMatch`. A cue resting on several facts cannot
express their combined confidence in one value.

Priority is a band plus an integer. Makes ordering assertable in a test and independent of import
order.

Controls live in `web`. `engine` must not own labels or layout, or the desktop companion inherits
UI vocabulary it cannot use.

Local clock offset is not published. Correcting your own late tap must not re-time four teammates.

Anchors are a map with last-write-wins. Principle 2 as a data structure, and it makes the relay's
conflict rule trivial.

The relay imports nothing from the domain. Keeps the protocol stable and lets new publishers and
subscribers appear without touching the engine.

`MatchTimeline` is neutral. Two consumers, one now and one later.

Cues and controls are registries of small objects, not a plugin system. The subsystems that grow
need a shape that makes growth cheap, but dynamic registration and a condition DSL would buy
flexibility nobody asked for at the cost of debuggability.

No state management library. Anchors and a small reducer are the whole of it.

## What is deliberately not designed here

The deferred features in `features.md`. What this architecture owes them is that they stay
additive: the desktop companion publishes anchors with a different `source` and reuses `engine`
unchanged; the Discord bot subscribes to the relay; the review imports `MatchTimeline` and the
same `project`; review-driven promotion edits `CueText.basePriority`.

If adding any of those requires touching `engine`, a boundary was drawn wrong and is worth
revisiting before proceeding.

## Build order

1. `engine` types, `project`, one objective track, the `now` clamp, the band model, the
   provenance clamp. Tests throughout. No UI.
2. `maps` schema, one battleground seeded as `published`, plus one hand-timed map marked
   `verified` so the exact path is reachable and milestone 3 is tunable.
3. `apps/web`: clock, live view, input surface, speech, wake lock, and the match lifecycle
   including end-match and the between-matches flow. Local anchors only.
4. `packages/replay`: parse against the archive, derive, emit. Promotes maps to `archive`, then
   to `verified` once current replays exist.
5. Remaining battlegrounds, validating the objective model against each before writing data. Ten
   of fifteen are unchecked against the track model.
6. `apps/relay` and shared sessions.

Steps 1 to 5 produce a working local app. The relay is last because nothing else depends on it,
and because it is the piece that could be dropped without disturbing the rest.
