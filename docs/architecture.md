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

`Known` means the app has a definite answer, whether from an anchor or from a rule such as "before
first spawn" or "suppressed during an objective phase". It does not mean "an anchor said so".

**Never order `Belief` by strength when what you mean is availability.** The ordering
`Known > Likely > Stale` is over epistemic strength, not over the value, so `Known(false)` — a
camp just taken and not yet respawned — is the *strongest* belief in the lattice and passes any
"at least `Likely`" test. Written that way, `stall-camp` would select a camp it knows is not
standing, arbitration would not filter it, and the chip would be tappable on a camp that is not
there. Two helpers exist so this is never expressed in prose:

```ts
function isAvailable(b: Belief): boolean   // Known(true) or Likely(true) only
function isClaimable(b: Belief): boolean   // anything but Stale
```

Every availability test uses `isAvailable`. Every "may we say anything at all" test uses
`isClaimable`.

### Domain types

```ts
type Seconds = number      // game time; 0 is match start
type Millis = number       // wall clock, epoch based

type AnchorType = 'MatchStart' | 'ObjectiveEnded' | 'CampTaken' | 'CampUp'

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
  subjectId?: string       // camp id; objectives have one chain per map
  label: string
  at: Seconds              // the median-accumulated estimate; see "at is the median"
  confidence: Confidence
  cycle?: number

  // clamp inputs, computed once in `project` so `view` can clamp with arithmetic alone
  offsetMin?: Seconds
  offsetMax?: Seconds
  spread?: Seconds         // spread(n) for this cycle; not recoverable from `confidence`
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
| `ObjectiveEnded` | `cycle` | `ObjectiveEnded:2` |
| `CampTaken` | `campId:occurrence` | `CampTaken:siege-top:3` |
| `CampUp` | `campId:occurrence` | `CampUp:boss:1` |

Including the occurrence index in the subject is deliberate and fixes a real defect. Without
it, every `ObjectiveEnded` in a match collapses onto one key, so no cycle index exists
anywhere, yet `TimedEvent.id` and `CueMatch.key` both depend on one. Inferring the cycle from
`gameTimeSeconds` fails exactly when bands overlap, which is when it matters.

This does not violate the overwrite principle. Tapping twice for the same cycle overwrites
that cycle's entry; a match produces on the order of ten to thirty anchors total, bounded by
match length rather than by tap count, and no entry is ever appended to.

**A near-simultaneous second tap overwrites rather than opening a cycle.** A new `ObjectiveEnded`
whose `gameTimeSeconds` is within `offsetMin` of the newest existing one replaces that entry. Without
this the design's own encouraged behaviour breaks it: two teammates tapping the same objective a
couple of seconds apart, with the second computing its index against a set that already contains the
first, would write two entries for one occurrence and inflate every later cycle.

**A missed tap leaves the count one short.** Timing is unaffected, because the chain walks from the
anchor's time rather than its index. `possibleFromCycle` gating is affected: on Cursed Hollow the
curse branch stays out of the union one cycle longer than it should, which is false precision. Tested
at the boundary.

The occurrence index is derived from the anchor set, not from the projection:

```
cycle = (number of ObjectiveEnded entries) + 1
```

Taking it from the projection's belief about the current cycle was wrong, and wrong in a way that
mattered. That belief comes from the same widening bands, so when bands overlap the projection
does not know which cycle is in progress either. It would have relocated the defect rather than
fixed it, and then baked an unreliable value into a persistent key and broadcast it to peers, so
two clients could write two mutually inconsistent statements about one occurrence.

Counting entries is monotone, independent of band arithmetic, converges across peers through the
`state` sync on join, and is trivially testable. It can still be wrong about how many cycles truly
occurred, if a tap was missed, but it can no longer be *inconsistent* between two clients or
between two re-projections, which is what actually breaks things.

The stronger alternative is the Durable Object assigning the index on write, which would give true
cross-peer agreement. It is not taken because it would make the relay interpret anchor payloads,
and relay neutrality is what keeps the deferred Discord bot and desktop companion additive. If
peer disagreement on the count ever proves worse than that coupling, this is the trade to revisit.

### The objective model

Validated against all 15 battlegrounds. Two earlier versions were wrong, in opposite
directions.

The first assumed one chained objective per map. The second replaced it with independent
concurrent *tracks*, on the theory that Sky Temple's three temples each ran their own chain.
Both are wrong. A map has **one objective phase chain**. Within a phase, one or more
*instances* activate: two temples on Sky Temple, two or three altars on Towers of Doom, three
cavalry on Alterac Pass, one tribute on Cursed Hollow. Instance count varies by phase index
and is sometimes random, but it does not affect *when* the phase happens, so it is a display
hint rather than a timing input.

```ts
type ObjectiveModel =
  | { kind: 'none' }                          // Tomb of the Spider Queen
  | { kind: 'timed'
      label: string                           // "Beacons", "Altars", "Tribute"
      firstSpawnSeconds: Seconds
      fight: FightEstimate
      respawn: RespawnRule
      instances?: string }                    // display hint: "2-3 altars", "1 then 2 then 3"


type RespawnRule =
  | { kind: 'afterResolution'
      minOffsetSeconds?: Seconds              // floor for scalePerMinuteSeconds
      outcomes: Record<string, {
        minSeconds: Seconds
        maxSeconds: Seconds
        possibleFromCycle?: number   // branch unreachable before this cycle
      }>
      scalePerMinuteSeconds?: number }
  | { kind: 'fixedInterval'; minSeconds: Seconds; maxSeconds: Seconds }
```

`ObjectiveModel` is a discriminated union so that a map with no timed objective is not forced to
invent a `label` and a `firstSpawnSeconds: 0` under `strict: true`, which the objectives generator
would then have to remember to ignore or else emit a phantom objective at 0:00.

`instances` is a display hint and a string on purpose. The table below has "2-3 altars", "2-4
warheads" and "1, then 2, then 3 chests", and a `number[]` cannot hold any of those. Since nothing
reads it for timing, the cheap representation is the right one.

Four things forced this shape, each found on a real map:

**Offsets are ranges, not scalars.** Cursed Hollow respawns 0:50 to 1:30 after a tribute is
collected; Garden of Terror 0:50 to 1:20 after a seed; Alterac Pass 1:50 to 2:30. A scalar
offset cannot express these, and pretending it can would manufacture false precision.

**Some maps have two resolution outcomes with different offsets.** Cursed Hollow respawns 0:50
to 1:30 after an ordinary tribute but 2:00 to 2:40 after a curse ends. Garden of Terror is 0:50
to 1:20 after a seed but 1:30 to 2:00 after the Garden Terrors die. Hence `outcomes` keyed by
name.

Crucially this needs **no extra input**. When the player has not said which outcome occurred,
the band spans the union of the *reachable* outcomes: the minimum of the minima to the maximum
of the maxima. Wider, honest, no new button. A control naming the outcome could tighten it
later and would pass the input gate, but v1 does not need one.

`possibleFromCycle` indexes the **spawning** cycle, the one whose time is being predicted, not
the resolving cycle before it. An off-by-one here produces false precision on the one map it was
added for, so both boundaries are tested.

It is what keeps the union from being needlessly pessimistic, and it matters more than it looks. On Cursed Hollow a curse requires one team to hold three tributes, so it
cannot possibly have occurred on the first or second. Taking the union from cycle one would
give a 110 second band before any fight spread is added, which alone nearly exhausts the 120
second `maxUsefulBand` and makes the map go `Unknown` by its third cycle, around 9:30. Marking
the curse branch `possibleFromCycle: 3` leaves the early cycles on the tight 0:50 to 1:30 band
and only widens once a curse is actually possible. Garden of Terror has the same shape, needing
three seeds before the Garden Terrors branch is reachable.

**One map scales its offset with game time.** Alterac Pass reduces the respawn delay by 2 seconds
per minute of elapsed game time. `scalePerMinuteSeconds` exists solely for it. Nothing else in the
model would have caught this, and it would have shown visibly wrong numbers by the twenty minute
mark.

The scaling applies to both `minSeconds` and `maxSeconds`, so `offsetHalfWidth` is unchanged by
it, and it is floored by `minOffsetSeconds` on the rule. Without a floor, 2 seconds per minute
against a 110 to 150 second offset reaches zero at 55 minutes and goes negative after, and Heroes
of the Storm matches do run long.

**One map has no timed objective at all.** Tomb of the Spider Queen drops gems continuously
from minions, and the turn-in is player-initiated with no clock. There is nothing to count down
to. `kind: 'none'` is a supported, tested state, not an error: the app shows waves, camps, tiers
and the death timer, and the objective slot reads "no objective timer on this battleground"
rather than sitting blank or falling back to the unknown-map path.

Blackheart's Bay is the one `fixedInterval` map: chests respawn every 3:00 on their own clock
rather than chaining off a resolution.

It carries a known residual limitation. The chest timer **pauses during a bombardment**, and a
bombardment is triggered by a player turning in doubloons, which the app cannot see. Over a
match with several bombardments the interval drifts by minutes. `fixedInterval` cannot express
a pause driven by an unobservable event, and inventing an anchor for "a bombardment started"
would fail the input gate's rule 4, since nobody is tapping a phone while a bombardment is
being contested.

The recovery has to be defined rather than gestured at. **An `ObjectiveEnded` anchor on a
`fixedInterval` map re-phases the whole band:** `next = [t + minSeconds, t + maxSeconds]`. That is implementable, and it
is exactly what the player means by tapping after a bombardment, so the residual limitation
becomes recoverable for one line of specification rather than resting on undefined behaviour.

Blackheart's Bay still ships with a deliberately wide band and leans harder on the anchor than
other maps. If that proves annoying, the fallback is to model it as `afterResolution` keyed off
chest collection and drop the fixed interval entirely.

Thirteen of the fifteen maps use `afterResolution`, one uses `fixedInterval`, and one uses
`none`. Three variants cover the whole pool, and no speculative fourth is carried.

One row needs confirming when its data is written: sources disagree on whether Warhead
Junction's 2:55 is a true clock cadence or an offset from all warheads being collected. It is
recorded as `afterResolution` because that is what the more detailed source says. If it turns
out to be a genuine cadence, it becomes the second `fixedInterval` map rather than needing a new
variant.

#### Validated map table

Source: Icy Veins map guides, September 2026. Every figure still requires confirmation, but the
*structure* below is what the model must support.

| Map | First | Respawn trigger | Offset | Instances |
| --- | --- | --- | --- | --- |
| Alterac Pass | 3:00 | after completion | 1:50-2:30, minus 2s per game minute | 3 cavalry |
| Battlefield of Eternity | 3:00 | Immortal dies | 1:45 | 2 immortals |
| Blackheart's Bay | 1:30 | fixed interval, paused in bombardment | 3:00 | 1, then 2, then 3 chests |
| Braxis Holdout | 1:30 | zerg waves die | 2:10 | 2 beacons |
| Cursed Hollow | 3:00 | tribute collected / curse ends | 0:50-1:30 / 2:00-2:40 | 1 tribute |
| Dragon Shire | 1:30 | Dragon Knight dies | 2:00 | 2 shrines |
| Garden of Terror | 2:30 | seed collected / terrors die | 0:50-1:20 / 1:30-2:00 | 1 seed |
| Hanamura Temple | 3:00 | last shot fired | 3:00 | 1 payload |
| Haunted Mines | 3:00 | grave golems die | 2:00 | 1 mine |
| Infernal Shrines | 3:00 | Punisher dies | 3:00 | 1 shrine |
| Sky Temple | 3:00 | phase ends | 2:00 | 1-2 temples |
| Tomb of the Spider Queen | none | none | none | continuous gems |
| Towers of Doom | 3:00 | all altars captured | 1:50 | 2-3 altars |
| Volskaya Foundry | 3:00 | Triglav Protector dies | 3:00 | 1 capture point |
| Warhead Junction | 3:00 | all warheads collected | 2:55 | 2-4 warheads |

These figures disagree with the older seed table in `research.md` on several maps, including
Cursed Hollow, Sky Temple, Garden of Terror and Haunted Mines. The disagreements are patch
drift; the Icy Veins guides are the more current source and this table supersedes the other.

#### Camps vanish during some objective phases

Alterac Pass and Braxis Holdout remove mercenary camps from the battlefield while the objective
is active, returning them when it ends. A camp model that does not know this will advise
starting a camp that is not there.

`MapDefinition` therefore carries `campsSuppressedDuringObjective: boolean`.

"A phase is believed active" has to be defined, and defined so that it expires. The obvious
reading, active from spawn until an `ObjectiveEnded` anchor arrives, means one missed tap pins
every camp on the map to `Known(false)` for the rest of the match: a wrong claim produced by
forgetting, which the founding principle forbids, and one with no correction affordance because
`Known(false)` renders as a respawn countdown rather than a tappable chip.

So suppression runs from the objective's spawn to the far end of its estimated resolution, and
then decays like everything else:

The phase's **estimated resolution band** is `spawn.at + fight.medianSeconds ± spread(n)`, emitted by
the objectives generator as a `resolution` event so that both this rule and `validUntil` can name a
quantity that exists rather than gesture at one.

- From the spawn's `low` until the resolution band's `high`, every camp is `Known(false)`.
- Once `now` passes that `high` with no `ObjectiveEnded` anchor, every camp becomes `Stale` rather
  than staying `Known(false)`.
- When suppression lifts, by anchor or by elapse, every suppressed camp's `availableSince` is
  **reset to that moment**. Camps return to the battlefield as a fresh spawn, so carrying the
  pre-suppression value forward would have them emerge already past `staleSeconds` — a phase lasts
  well over two minutes against a 120 second threshold — killing camp coaching on Alterac Pass and
  Braxis Holdout from the first objective onward.

The window starts at **spawn**, not at the resolution band. Camps vanish when the objective becomes
active, so on Braxis, where beacons spawn at 1:30 and resolution is estimated around 2:20 to 2:40, a
window opening at the band's `low` would advise starting a camp through the fifty seconds when the
objective is live and the camps are gone.

That degrades to "I do not know" instead of a false negative, keeps the correcting chip reachable,
and reuses machinery that already exists. With `isAvailable` in place, `stall-camp` skipping
suppressed camps falls out rather than needing to be asserted as a special case.

### Projection

```ts
interface Timeline {
  events: TimedEvent[]        // sorted by `at`
  camps: CampState[]
  deathTimer: { id: string; seconds: Seconds; confidence: Confidence }
  level: { id: string; estimate: number; confidence: Confidence }
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

Suggested horizons: waves emit the next 4, so `view` can pick without re-projecting; the
objective chain emits the next 2 cycles; each camp emits its next availability; tiers emit the
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

`offset` is per map and is a range on several of them. `fight` is how long humans take to resolve
the objective.

Walking the chain forward from its newest anchor:

- `spawn(0) = firstSpawnSeconds`, `Exact`.
- Given an `ObjectiveEnded` anchor for cycle k at time t, the next spawn is
  `[t + offsetMin, t + offsetMax]`. This is `Exact` **only when `offsetMin === offsetMax`** for
  the reachable outcome set. Provenance is not consulted here; the clamp owns that, so there is one
  place to audit what the app may claim. Otherwise it is `Estimated`, with no fight
  spread for that step, because no fight is being predicted: it already happened.
- Without an anchor the midpoint accumulates linearly, because expected values add:
  `spawn(k+1).at = spawn(k).at + fight.median + offsetMid`

That conditional matters, and an earlier version got it wrong. Declaring the first post-anchor
step `Exact` was inherited from a model in which offsets were scalars. On Alterac Pass, offset
1:50 to 2:30, an anchor at 6:00 puts the next spawn somewhere in 7:38 to 8:18. Rendering that as
one green number while speaking "cavalry in two minutes" is a claim that can be forty seconds
wrong, made at the moment the player has most reason to trust it. Eleven maps have scalar offsets and do collapse to `Exact`;
Cursed Hollow, Garden of Terror and Alterac Pass do not, Blackheart's Bay re-phases an interval
instead, and Tomb has no objective to collapse.

##### Advancing the chain as the clock moves

`project` must decide what happens when `now` overtakes a projected spawn. Leaving that implicit
produced one defect; getting the order of operations wrong produced a worse one. Both are worth
recording, because the correct rule looks arbitrary without them.

**The division of labour.** `project` walks the chain on **unclamped** values and assigns
confidence from the unclamped width. `view` applies the present clamp to both ends, for display
only, and never changes confidence.

**Advancement, in `project`:** while `now > high` for the cycle under consideration, presume that
cycle occurred, advance the cycle index, add a step to `n`, and recompute
`at += fight.median + offsetMid` with `spread(n)`. Repeat until `now <= high`.

**The clamp, in `view`. It must translate the interval, never compress it:**

```
width       = high - low                                  // = 2 * spread(n)
displayLow  = max(low,  now + offsetMin)
displayHigh = max(high, now + offsetMax, displayLow + width)
displayAt   = clamp(at, displayLow, displayHigh)
```

The `displayLow + width` term is the whole point and an earlier version omitted it. Without it,
when both ends bind the width becomes `offsetMax - offsetMin`, which is **zero on every
scalar-offset map**. Combined with the rule that a zero-width `Estimated` collapses to `Exact`,
that turns the countdown green and precise about a spawn the app knows nothing about, sliding
forward with `now` forever: the same founding-principle violation as the inverted band, reached
from the opposite direction. The band may move right and may grow. It may never narrow.

Once the clamp binds, `displayAt` is a floor rather than a median. Cue thresholds compare against it,
which is the right behaviour — "no sooner than" is what the player needs — but it is worth knowing
that `at`'s meaning changes at that point.

Two failure modes this avoids, both of which existed in earlier drafts.

*Clamping only the near end inverts the interval.* On Braxis with offset 130s, `stepSpread` 30 and
an anchor at 5:00, the first unanchored cycle sits at `at` 630 with a band of 600 to 660
(`n = 1`, so `spread = 30`). At `now = 640` a one-sided clamp gives `low = 770` against an unmoved
`high = 660`. The countdown reads minus ten, the band renders backwards, and because the width is
*negative* it never exceeds `maxUsefulBand`, so the event stays amber and confident-looking instead
of dropping to `Unknown`. The safety net was defeated by its own sign.

*Clamping both ends without preserving width collapses it to zero.* Same example: both ends bind at
770, width zero, `Exact`. Described above; it is why the `displayLow + width` term exists.

*Advancing on clamped values freezes the chain forever.* Advancement and the clamp read the same
silence and draw opposite conclusions from it, which is coherent only because they run in different
places: advancement in `project` says "an earlier cycle must have occurred, so move on", the clamp
in `view` says "the pending resolution has not been reported, so it cannot be sooner than now".
Evaluated together in one place they cancel. If the clamp raises `high` to
`now + offsetMax` before advancement is tested, then `now > high` is never true. The cycle never
advances, `n` never grows, the band never widens, and confidence never reaches `Unknown`. The app
would sit indefinitely showing a green `Exact` objective at `now + offset`: a confident false
claim that never self-corrects, which is worse than the inverted band it replaced. This is why
advancement reads unclamped values and the clamp lives in `view`.

Worked through, the corrected rule behaves as intended. On Braxis with an anchor at 5:00 the next
spawn is `Exact` until it passes, then `Estimated` and widening, reaching `Unknown` around 14:40,
roughly nine and a half minutes after the last tap. On Alterac Pass, whose ranged offset means no
step is ever `Exact`, the band starts at 40 seconds and reaches `Unknown` around 14:10. Neither
produces an unordered interval at any point.

`view` can clamp with arithmetic alone because `project` puts `offsetMin`, `offsetMax` and `spread`
on the event. They are not recoverable otherwise: `Timeline` carries no `MapDefinition`, and `at` is
the median rather than the midpoint, so `(high - low) / 2` is not `spread(n)`.

`buildContext` applies the same clamp **before** constructing `AdviceContext`, so cues and controls
read the numbers the player sees. Without that, a cue would speak "beacons due soon" about an event
whose own clamp says it cannot happen for another seventy seconds, and an event the clamp drives
past `maxUsefulBand` would still look `Estimated` to the confidence filter.

Keeping the clamp in `view` has a second benefit: once it binds, `displayLow` is a continuous
function of `now`, so leaving it in `project` would collapse `validUntil` to `now` and force a
projection every tick, which is the behaviour that section exists to prevent.

When every projected cycle is `Unknown`, the UI shows that deliberately rather than silently: the
dominant countdown reads "objective timing lost" with the anchor button offered prominently. A
blank countdown reads as a bug.

#### How the band grows

v1 hardcodes the inputs. Measurement is a refinement path, not a prerequisite.

Each map carries a hand-authored estimate of how long the objective takes to resolve:

```ts
interface FightEstimate {
  medianSeconds: Seconds
  spreadSeconds: Seconds     // roughly an 80% half-width
}
```

These come from the published guides, from timing a handful of replays by hand, or from
judgement. They do not need to be precise, because they only govern how fast the app admits it is
unsure, and admitting uncertainty slightly early is the safe direction to be wrong.

`spreadSeconds: 0` is legal and meaningful. Some phases end on a deterministic timer rather than
on a fight: Sky Temple's temples fire for a fixed 40 seconds, Hanamura's payload barrage lasts a
fixed 15. Forcing those through a spread would manufacture an amber "due soon" for a number the
app actually knows. A zero-width `Estimated` collapses to `Exact`, subject to provenance.

The midpoint accumulates linearly, because expected values add. The spread does not.

**Each step contributes two independent uncertainties**, and both must be counted. The fight
duration is one. The respawn offset is the other, because it is published as a range rather
than a scalar on several maps: Cursed Hollow's 0:50 to 1:30, Alterac Pass's 1:50 to 2:30. An
earlier version of this formula accumulated only the fight spread and silently ignored the
offset range, which understates the band on exactly the maps with the widest offsets.

```
stepSpread = max(sqrt(fightSpread^2 + offsetHalfWidth^2), minStepSpread)
             where offsetHalfWidth = (offsetMax - offsetMin) / 2

spread(n)  = stepSpread * sqrt(n + n * (n - 1) * r)      // r defaults to 0.3
band       = [at - spread(n), at + spread(n)]            // before clamping
```

The band is `at ± spread(n)`. The present clamp is a separate step applied in `view`; see
"Advancing the chain as the clock moves". Two formulas for one quantity in one document is how the
first version of the clamp bug survived, so this block defines the spread and nothing else.

`minStepSpread` (start at 8 seconds) is a floor, and it exists because two maps would otherwise
never widen at all. Sky Temple and Hanamura have deterministic phase durations (`spreadSeconds: 0`)
and scalar offsets, so `stepSpread` would be zero and the chain would report `Exact` at cycle
twenty with no taps. Those cycles genuinely are close to deterministic, but "the phase resolved
exactly when the model says" is itself an assumption, and the floor prices it.

Two things about the outer term are worth understanding rather than copying.

Accumulating linearly, `low += min` and `high += max` per step, would assume every cycle hits
its extreme in the same direction. Independent draws partially cancel, so a sum of n draws
spreads with `sqrt(n)`, not `n`. Linear over-widens, and the practical cost is that the app goes
`Unknown` several cycles earlier than the evidence justifies.

Pure `sqrt(n)` is also wrong, because fight durations are positively correlated: a team that
resolves objectives slowly tends to do so every cycle. The `r` term interpolates, at `r = 0`
giving `sqrt(n)` and at `r = 1` giving linear. **`r = 0.3` is a guess**, stated plainly so nobody
mistakes it for a measurement. It is one constant and the single thing most worth replacing with
a real number later.

When band width exceeds `maxUsefulBand` (start at 120 seconds), confidence drops to `Unknown`
and every later cycle does too.

##### Expected behaviour, and what it means for the product

Working the model through with real numbers gives a blunter answer than an earlier draft of this
section claimed, and the model is right.

**Without any taps, objective timing is good for two to six cycles after the last anchor, which
varies a lot by map.** Worked through with the per-map offsets and plausible fight estimates:

| Map | Cycles | Time from last anchor |
| --- | --- | --- |
| Cursed Hollow | 2 | about 4 minutes |
| Alterac Pass | 3 | about 8 minutes |
| Braxis Holdout | 3 | about 10 minutes |
| Towers of Doom | 6 | about 15 minutes |
| Infernal Shrines | 4 | about 17 minutes |

Ten minutes is a rough middle, not a floor: fast-cadence maps with wide offset ranges are
considerably worse, and Sky Temple and Hanamura never reach `Unknown` at all because their phases
are near-deterministic. After the threshold the band exceeds `maxUsefulBand` and the chain honestly
reports that it has lost the thread. Reaching five or six cycles everywhere would require a
`maxUsefulBand` near 170 seconds, and "sometime in the next three minutes" is not coaching.

That reframes the interaction. "Only starting the match is required input" is true in the sense
that nothing breaks without taps, and misleading as a description of how the app is meant to be
used. **The re-anchor tap is a core interaction, not an optional refinement.** Four to six taps a
match keep objectives accurate throughout; zero taps give a good first ten minutes and then a
quiet objective slot, while waves, camps, tiers and the death timer continue unaffected.

Both halves are worth stating plainly to the player during onboarding, and the pre-step-1 spike
should test whether people actually tap, not only whether they like the voice.

Two maps are the other extreme. Sky Temple and Hanamura have deterministic phase durations and
scalar offsets, so with only `minStepSpread` driving the widening they stay `Estimated` for an
entire match rather than reaching `Unknown`. That is defensible, since those cycles genuinely are
near-deterministic, but it is why the figure above is a range rather than a single number.

Maps with a fast objective cadence and wide offset ranges degrade soonest. Cursed Hollow is the
worst case in the pool, on both counts at once: past `possibleFromCycle: 3` its union offset is
0:50 to 2:40, which alone is a 110 second band, so even a fresh anchor leaves it near the
threshold and one unanchored step exceeds it. Cursed Hollow therefore has little useful objective
coaching in the second half of a match regardless of tapping. The fix is the outcome-naming
control described under the input gate, which would collapse the union to one branch. It is
deferred, and this is the map that would justify building it.

A worked example, to check an implementation against rather than to treat as a specification.
Take a `stepSpread` of 25 seconds and `r = 0.3`:

```
n=1   band  50s
n=2   band  81s
n=3   band 110s
n=4   band 138s   -> exceeds 120, drops to Unknown
```

Deliberately no per-map table of cycle counts here. The fight estimates feeding it are
judgement, and publishing derived numbers to the cycle would be exactly the false precision this
project exists to avoid. If an implementation's numbers differ substantially from the curve
above, linear accumulation of the range is the most likely cause.

##### The refinement path, if it is ever needed

Deferred, and possibly never necessary. A corpus of replays would let the offline tool measure
`spreadSeconds` and `r` per map, or skip the model entirely and measure the n-step spread
directly as the observed distribution of time from one phase spawn to the spawn n phases later.

Nothing in v1 depends on that happening. The shape of `FightEstimate` is what a measurement
would fill in, so replacing guesses with data is a data change and not a redesign. That is the
whole of what "keeping the door open" requires here.

#### Camps

Camps are independent of each other and never chain, so no camp band widens the way the
objective chain does.

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

v1 hardcodes these per camp type from judgement. Starting values: **45 and 120 seconds for
regular camps**, and **300 and 900 seconds for bosses**.

The boss numbers carry a hard constraint rather than a preference. `staleSeconds` for a boss must
exceed the typical remaining match length after it first spawns, or boss availability goes `Stale`
in the last third of every game, which is exactly when bosses are contested. A boss spawning
around 5:00 in a twenty-minute match needs at least 900. Setting it by the same intuition as a
siege camp gives 600 and silently kills the boss timer that `features.md` lists as a v1 feature.

The cost of a long threshold is a boss believed standing that was quietly taken. That is the right
trade: a boss being up is the default state, taking one is a large and visible event, and the
anchor resets belief when it happens.

If they are ever measured, the target is the point at which belief becomes worthless, which is a
quantile of the survival function rather than of time-to-first-capture: the times by which
roughly 50% and 90% of camps of that type have been taken. That is a refinement, not a
prerequisite.

`Stale` means the app stops claiming anything about that camp. It does not mean the camp
vanishes from the UI, and it does not remove the control that could correct it. See "Input
surface".

#### Waves, tiers and the death timer

These three are the floor the app never drops below on an unrecognised map, so they derive from
game-wide constants rather than from `MapDefinition`.

Those constants live in `engine`, not in `maps`. They are game rules rather than map data, and the
generators that read them run inside `engine`, so putting them in `maps` would invert the one-way
dependency and break the zero-dependency rule. `CueText` went the other way, into `maps` and passed
in as a parameter, precisely because it is authored content; these are not.

```ts
// packages/engine/src/game-constants.ts
export const firstWaveSeconds: Seconds        // waves are not at 0:00
export const waveIntervalSeconds = 30
export const levelCurve: { level: number; typicalSeconds: Seconds; spreadSeconds: Seconds }[]
export const deathTimerByLevel: { level: number; seconds: Seconds }[]
```

Engine tuning values get their own module rather than being scattered as literals, for the same
reason cue thresholds were moved into data:

```ts
// packages/engine/src/tuning.ts
export const maxUsefulBand = 120          // guess
export const correlation_r = 0.3          // guess; the single value most worth measuring
export const minStepSpread = 8            // guess
export const clampBandSeconds = 20        // guess
export const refireThresholdSeconds = 15  // guess
```

Each is commented as guess or measurement. `r` in particular is described elsewhere as the one thing
most worth replacing with a real number, so it needs to be findable rather than buried in a formula.

Waves are a pure function of game time from `firstWaveSeconds` on a 30 second cadence, and are
always `Exact`.

Tiers derive from `levelCurve`, which is an estimate because team level depends on soak nobody can
observe. A tier already reached may be `Exact` if an anchor ever establishes it; future tiers are
always `Estimated`.

**The death timer is not `Exact`, and earlier drafts said it was in three places.** It is a step
function of team level, and team level is `Estimated`. Near a breakpoint that makes it simply the
wrong number, rendered green, in the one place the provenance clamp is not allowed to intervene:
a direct principle 1 violation. So the death timer carries a `Confidence` inherited from the level estimate.

It is not a timeline event, so it does not get an `EventKind`. It lives on `Timeline` and on
`AdviceContext` as a small record with a stable id, and `basedOn` may name that id alongside event
ids. Without a home in the type model the confidence filter could not reach it, which was the whole
point of the change. The estimated team level, which the footer displays, gets the same treatment
for the same reason.

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

Two cases that were previously silent. An event already `Estimated` on a non-`verified` map has
its band widened by `clampBandSeconds` rather than replaced, because the two uncertainties are
independent and the map constant being unverified does not remove the behavioural spread. And
`Belief` is clamped too: a camp's pre-first-spawn `Known(false)` is map-derived, so under
`unknown` provenance it becomes `Stale` rather than a confident negative.

Waves, tiers and the death timer are exempt at every provenance level.

That exemption is about map files: a wrong map cannot make a game-wide rule wrong. It says nothing
about the constants themselves, which are currently unmeasured. `firstWaveSeconds`, `levelCurve` and
`deathTimerByLevel` have no values in any document, and whatever they contain renders unqualified.
Hand-timing them is a natural output of the pre-step-1 spike, and the exemption is conditional on
that having happened. They derive from game-wide rules rather
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

`validUntil` is the earliest candidate **strictly greater than `now`**, falling back to
`now + 30` when none is. Without the strictness it is permanently in the past once any camp goes
`Stale`, and the memo then recomputes every tick, defeating the whole section.

Candidates:

- the end of the wave block already emitted,
- the `high` of the earliest `Estimated` objective cycle,
- the `at` of the earliest `Exact` objective cycle, so a spawn forces a recompute,
- for each camp, `availableSince + decaySeconds` and `availableSince + staleSeconds`,
- any `nextUp` respawn boundary,
- on a suppression map, the objective spawn's `low` and the resolution band's `high`, since both
  change every camp's `standing`.

The present clamp is deliberately not a candidate. It lives in `view`.

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
  priorityWithinBand: number              // the integer half; data, not code
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
interface Prompt {
  cueId: string
  key: string
  display: string
  spoken: string
  band: PriorityBand
}

interface PromptSettings {
  maxTier: 'essential' | 'standard' | 'verbose'
  speechEnabled: boolean
  voiceId?: string
}

interface Cue {
  id: string                              // indexes into CueText
  appliesTo?: string[]
  thresholds: readonly string[]           // threshold keys this cue reads
  evaluate(ctx: AdviceContext, t: Record<string, number>): CueMatch | null
}

interface CueMatch {
  key: string                             // 'stall-camp:siege-top:cycle-3'
  basedOn: string[]                       // TimedEvent ids and camp ids this rests on
  timeFrom?: string                       // which basedOn entry supplies {time}; defaults to [0]
  score?: number
  subject?: string
}
```

`timeFrom` exists because `basedOn` is a list and multi-fact cues are the motivating case. Without
it, which fact supplies the spoken time is undefined precisely where it matters.

`basedOn` is what makes the confidence filter implementable. Arbitration resolves those ids
back to their `Confidence` or `Belief` and applies the rule: a prompt may fire only if no fact it
rests on is `Unknown` or fails `isClaimable`. A cue additionally states its own value requirement
for camp facts, which is where `isAvailable` is used, because "we may speak about this camp" and
"this camp is standing" are different questions.
A cue cannot fabricate its own confidence, and a multi-fact cue like `stall-camp`, which rests
on both a camp state and an objective spawn, is handled correctly rather than by a single scalar
that cannot express it.

`spoken` text contains `{time}`, substituted by `describeTime(confidence, at, now)` at render
time. `at`, `low` and `high` are absolute game seconds; the subtraction to a relative phrase or a
displayed range happens in `view`. No cue writes a time phrase itself, so no cue can speak an estimated event as though it
were exact.

### Priority

Priority is a named band plus an integer within it, not one undocumented global namespace:

```ts
type PriorityBand = 'critical' | 'high' | 'normal' | 'low'
```

Both halves are data. `basePriority` and `priorityWithinBand` live in `CueText`, which keeps the
obligation that priorities are tunable without an engine rebuild. `CueMatch.score` is an optional
per-occurrence override for genuine urgency, and an absent `score` sorts as `priorityWithinBand`.

Ties break by band, then integer, then cue id alphabetically, never by registry array order,
which would make speech depend on import order. This lets a test assert "stall-camp outranks
wave-reminder" without encoding a magic number.

### Cooldowns and the fired set

Set membership cannot express a cooldown, so the state carries timestamps and is owned by the
caller:

```ts
interface CueState {
  matchId: string
  fired: Record<string, { at: Seconds; basedOn: Record<string, Seconds> }>  // key -> when, and
                                                                            // each fact's `at` then
  lastFiredByCue: Record<string, Seconds>                     // Cue.id -> last fire of anything
  perCue: Record<string, unknown>                             // small per-cue scratch
}

function evaluateCues(
  cues: Cue[],
  text: Record<string, CueText>,
  settings: PromptSettings,
  ctx: AdviceContext,
  state: CueState,
): { active: Prompt[]; state: CueState }
```

Three things about that signature are deliberate and were wrong in an earlier draft.

`text` is a parameter rather than an import. `CueText` lives in `packages/maps` and the dependency
runs `maps -> engine`, so `engine` cannot import it. Arbitration needs `tier` and `basePriority`
to filter and sort, and the rendered `Prompt` needs `display` and `spoken`, so the table is passed
in.

`settings` is a parameter for the same reason it is absent from `AdviceContext`: verbosity governs
what is spoken, and arbitration is the only thing that should see it.

`fired` stores each fact's `at` **as it was at fire time**, not just the fact's id. The re-fire rule
compares an event's current `at` against that snapshot, and "changed by more than
`refireThresholdSeconds`" is not computable from the id alone. Storing the ids without the values was
half a fix.

`perCue` is a small scratch slot, needed because `stall-camp` must remember the camp it named last
cycle in order not to repeat it. Cues stay stateless functions; the state travels with the caller
like everything else.

`fired` keyed by `CueMatch.key` gives once-per-occurrence semantics. `lastFiredByCue` keyed by
`Cue.id` gives the cooldown, which is what stops a cue chattering across different occurrences.
Both are needed; either alone is wrong.

On `ANCHOR_CLEARED`, cycle indices downstream of the cleared anchor shift, so event ids shift with
them. Any `fired` entry whose `basedOn` references an id no longer present in the timeline is
dropped. Without that rule a cue either re-fires immediately or goes silent for the match, depending
on which way the renumbering went.

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
  nextObjective: TimedEvent | null
  camps: CampState[]
  tier: { current: number; next: TimedEvent | null }
  deathTimer: Timeline['deathTimer']
  level: Timeline['level']
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

`approachSeconds` is the walk to the camp and was missing, making the advice systematically late.
`travelSeconds` is measured to the objective, not to the lane generally, because the two differ
and the objective is where the pressure is meant to land.

Camp choice is the highest `pressureValue` among camps satisfying `isAvailable`, ties broken by
camp id. A static argmax would name the same camp every cycle of every match, which is `spec.md`'s
"speech becomes noise" risk with a deterministic cause.

`pressureValue` and `travelSeconds` are therefore **indexed by cycle**, with the last entry
repeating. Not per map, and not per track: under one chain per map "per track" is identical to
"per map" and cures nothing, which was residue from the rejected multi-track model. The objective's
location genuinely moves between cycles on Sky Temple, Towers of Doom and Warhead Junction, so a
single camp constant cannot be right for all of them.

`stall-camp` additionally does not fire on consecutive cycles unless the chosen camp differs. That
is what `CueState.perCue` remembers.

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
- Every map whose `ObjectiveModel` is `kind: 'timed'` has a `RespawnRule` of a kind the objective
  generator implements, and every named outcome in an `afterResolution` rule has a min and a max.
- `campsSuppressedDuringObjective` is not set on a map whose `ObjectiveModel` is `kind: 'none'`.
- `provenance` is present, and `verified` requires a corpus reference or a hand-timing note.
- Every `CueText` id matches a registered cue, and every key in a cue's declared `thresholds`
  exists in its `CueText`. The declaration is what makes this checkable; reading thresholds by
  string key inside arbitrary TypeScript would leave the check as a note someone has to remember.
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
for convenience on join and never wins; the reducer derives from the anchor.

The manual adjustment is separate and never published. Correcting your own late tap must not
re-time your teammates, so the clock adjust control writes a local `userAdjustSeconds` stored
outside the anchor set. Only an explicit "fix the session clock" action in the overflow menu
rewrites the shared `MatchStart` anchor, and it says so plainly.

```
gameTime = (Date.now() + peerSkewMillis - matchStartWallClock) / 1000 + userAdjustSeconds
```

Two distinct offsets, and conflating them was a real gap. `peerSkewMillis` is the device clock
difference negotiated with the Durable Object on `hello`, and it must be applied to the local
derivation and not only when publishing: `matchStartWallClock` arrives in the host's epoch, so a
phone ten seconds fast otherwise runs ten seconds ahead of its team for the whole match, which is
a third of a wave on a 30 second cadence. `userAdjustSeconds` is the manual nudge, is local, and
is never published.

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
  | { type: 'USER_ADJUST_SET'; seconds: Seconds }
  | { type: 'MATCH_ENDED' }
```

`ANCHOR_SET` applies last-write-wins on `wallClock`, the same rule the relay uses. Without it
stated, a late-delivered peer anchor overwrites a newer local one on the client, and the test for
out-of-order peer arrival has nothing to assert against.

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

`localStorage` for settings and recent maps, **and for the live match**: the anchor set, `matchId`,
`mapId` and `matchStartWallClock`, written on every anchor change.

An earlier draft persisted no match state and relied on rejoining the session to recover. That is
circular for build steps 1 to 4, where no relay exists, and iOS routinely evicts a backgrounded
PWA on a phone that sits beside a keyboard for twenty minutes. Persisting is a few lines and
contradicts nothing. On load, a stored match younger than 45 minutes offers to resume.

## Input surface

Every button writes or clears an anchor, and anchors overwrite, so no input can produce an
inconsistent state. The worst outcome of a mistap is a wrong number that the next tap or an undo
replaces.

| Control | Where | Writes | Frequency |
| --- | --- | --- | --- |
| Start match | setup | `MatchStart` | once, required |
| Objective ended | live, primary | `ObjectiveEnded` | 4-6; see below |
| Camp chip | live, rail | `CampTaken` | opportunistic |
| Camp is up | live, on a stale chip | `CampUp` | rare |
| Clock adjust | live, header | local offset | rare |
| End match | live, header | `MATCH_ENDED` | once |
| Undo | live, transient | reverts last anchor | rare |

Only `Start match` is required. But see "Expected behaviour": without objective anchors the app
is good for two to six cycles depending on the map, roughly four to seventeen minutes, and then
goes quiet on objectives, so "optional"
describes what does not break rather than how the app is meant to be used.

The objective control's `offer()` returns `null` on a map whose `ObjectiveModel` is
`kind: 'none'`. Offering it there would write an anchor no generator reads, failing the input
gate's own rule 2.

Camp chips are the rail entries, tappable while `isAvailable` holds. A
`Stale` camp still shows a chip: it reads "camp?" and offers both "taken" and "camp is up",
because decay must not remove the only control that could correct it. An earlier version made
`Stale` mean no chip, which deadlocked camp coaching for the rest of the match after one missed
tap, in exactly the solo case the documentation identifies as most likely.

Rail slot allocation is fixed rather than emergent, because the rail serves two purposes over
four slots. Slot 1 is always the next objective, slot 2 the next wave, slots 3 and 4 the two
highest-`pressureValue` camps satisfying `isClaimable`, falling back to the next tier when fewer
qualify. Without a stated rule, a map with four camps up shows no upcoming events at
all.

Camps that do not win a rail slot are reachable through an **overflow camp list**, opened from the
header and using the registry's existing `'overflow'` placement. Without it, a typical map with
five or six camps leaves three or four with no control anywhere in the app, which contradicts the
reasoning that justified keeping chips on `Stale` camps. A boss is the common casualty, since its
long `staleSeconds` is exactly what makes it lose to two siege camps on `pressureValue`.

Empty slots are defined rather than left to render blank. On a map whose `ObjectiveModel` is
`kind: 'none'`, slot 1 reads "no objective timer on this battleground". On a `provenance: 'unknown'`
map, where the clamp drops map-derived events, slots 1, 3 and 4 collapse and the rail shows the
wave and the next tier.

Tap targets are a minimum of 44 by 44 CSS pixels, which the earlier 10px text in a 60px slot did
not meet. These are pressed without looking, mid-game. The rail's chromelessness is a virtue for
reading and a liability for tapping, and the tap target wins.

Undo covers the one way input actively hurts. It reverts the last anchor write, which has two
cases: restoring a previous value, or deleting an entry that had none. Both publish to the relay
as `revert { key, restore? }`, so peers converge. A `revert` carrying only a key could express
deletion alone, which would leave the undoing client with a restored value and every peer with
nothing. Its window is 60 seconds, not "a few", because a mistapped objective is
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

interface ControlOffer {
  label: string
  subject?: string                       // camp id, cycle index, whatever the anchor needs
  emphasis?: 'normal' | 'urgent'
  secondary?: { label: string; action: 'clear' | 'restore' }   // the "camp is up" affordance
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
POST /session   { mapId, anchors: Anchor[] }  -> { code }
WS   /session/:code
```

`POST /session` carries the creating client's existing anchors. The normal path is to play solo,
tap a few times, and only then open a session for the team, and build steps 1 to 4 are local-only by
design. Without seeding, the object would come back empty and `state` would wipe the host's own
anchors. `state` is applied as **replace**, which is why seeding is required rather than optional.

```ts
type ClientMessage =
  | { v: 1; t: 'hello'; name?: string; clientTime: Millis }
  | { v: 1; t: 'anchor'; anchor: Anchor }
  | { v: 1; t: 'revert'; key: string; restore?: Anchor }
  | { v: 1; t: 'match'; mapId: string }

type ServerMessage =
  | { v: 1; t: 'state'; mapId: string; startedAt: Millis; anchors: Anchor[]; peers: number;
      serverTime: Millis }
  | { v: 1; t: 'anchor'; anchor: Anchor }
  | { v: 1; t: 'revert'; key: string; restore?: Anchor }
  | { v: 1; t: 'peers'; count: number }
```

The object holds a map keyed by `${type}:${subject}`, mirroring the engine. Writes are
last-write-wins on `wallClock`, which suffices because an anchor is a statement about a fact
rather than an increment.

**Anchors live in `ctx.storage`, not in an in-memory `Map`.** This is the one place where the
named technology and a naive design are actually incompatible. WebSocket hibernation, which is
the reason `partyserver` was chosen, evicts the object from memory while sockets stay open and
re-runs the constructor on wake. In-memory state does not survive, so a mid-match reconnect would
return a `state` message with zero anchors and silently reset the whole team's clock, in a system
whose own tests assert state sync on join.

`revert` bypasses last-write-wins. A restored anchor carries an older `wallClock` than the mistap it
replaces, so the normal write rule would reject it and peers would keep the bad value.

Storage keys are namespaced (`anchor:${type}:${subject}`) so they cannot collide with `mapId`,
`startedAt` or alarm bookkeeping in the same `ctx.storage`.

Sessions expire after 30 minutes of inactivity, implemented with a Durable Object alarm rather than
a timer, for the same reason. A Durable Object has exactly one alarm, so it is re-armed on every
message rather than set once. Host disconnection does not end a session, since the object
outlives any participant.

`t: 'match'` carries the map selection only and never wins on time. The `MatchStart` anchor is the
single authority for when the match began; `state.startedAt` is a convenience mirror.

### Clock agreement between peers

`gameTimeSeconds` is computed in the publisher's frame, and unsynchronised device clocks make
that a real skew. `hello` carries `clientTime` and the `state` reply carries `serverTime`, from which the client
computes `peerSkewMillis = serverTime - clientTime`, adjusted for round trip. That sign convention is
what makes the local derivation correct, so it is stated rather than left to be inferred.

`Anchor.wallClock` and `matchStartWallClock` are both in **session epoch**, not device epoch.
Last-write-wins compares `wallClock` across devices, so a device-epoch value would resolve conflicts
by whose phone is fastest. Sub-second accuracy is unnecessary;
avoiding a ten-second phone-clock drift is not.

### Protocol versioning

Messages carry `v` and `Anchor` carries `schema`. The risk that matters is not unknown types,
which are inert, but known types with changed semantics: a subject-key format change silently
creating two entries for one camp. A version field is nearly free now and impossible to add
retroactively.

Stored anchors are typed with a widened `type: AnchorType | (string & {})` so an unrecognised
type is representable under `strict: true` and can be stored and ignored rather than forced
through with `as any`. Generators must not assume the set contains only types they know.

## packages/replay (deferred, not v1)

Not built for v1. Map timings are hand-authored from published guides and from timing a handful
of replays by hand, which is enough to ship and avoids making a replay parser a prerequisite for
a countdown.

It is described here because two later things want it and the interfaces should not have to
change when they arrive: replacing hand-authored estimates with measurements, and the post-game
review.

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
- The two-sided present clamp: after an estimated band elapses with no anchor, assert
  `low <= at <= high` and that confidence has become `Unknown`, not merely that the numbers moved.
  A one-sided clamp inverts the interval and defeats the width test by its own sign.
- Chain advancement on unclamped values: `now` passing a cycle's unclamped `high` advances the
  index and adds a step. Explicitly assert that the chain does advance while the clamp is binding,
  since advancing on clamped values freezes it forever in a confident `Exact` state.
- An anchor collapsing to the tightest band the offset permits, asserting `Exact` only on
  scalar-offset maps and an offset-width band on the three ranged ones.
- Downgrade to `Unknown` past `maxUsefulBand`, and that the UI receives a distinguishable
  "timing lost" state rather than a null.
- Anchor overwrite per key, out-of-order arrival from a peer, and `ANCHOR_CLEARED`.
- Cycle identity derived from the anchor count: two anchors for different cycles coexist, a
  repeat tap for the same cycle overwrites, and two clients with different projections but the
  same anchor set agree on the index.
- `possibleFromCycle` at both boundaries, since an off-by-one produces false precision.
- `isAvailable` rejecting `Known(false)`, which an "at least Likely" ordering would admit.
- Suppression running from objective spawn (not from the resolution band's start) to the
  resolution `high`, then expiring to `Stale` rather than pinning camps to `Known(false)`.
- A boss not reaching `Stale` within a twenty-minute match, since that would kill the boss timer
  precisely when bosses are contested.
- The death timer carrying the level estimate's confidence rather than rendering `Exact`.
- `validUntil` always strictly greater than `now`, including once every camp is `Stale`.
- The clamp translating rather than compressing: assert `displayHigh - displayLow >= 2 * spread(n)`
  as well as ordering. A width assertion alone passes while the band collapses to zero, which is how
  the compressing version would have shipped.
- `spreadSeconds: 0` with a scalar offset still widening, via `minStepSpread`.
- A second `ObjectiveEnded` within `offsetMin` of the newest overwriting rather than opening a cycle.
- `ANCHOR_CLEARED` dropping `fired` entries whose `basedOn` names a now-absent id.
- A `CampUp` anchor restoring a `Stale` camp.
- Suppression lifting resetting `availableSince`, so camps do not emerge already `Stale`.
- `revert` bypassing last-write-wins, so a restore with an older `wallClock` is not rejected.
- An `ObjectiveEnded` anchor re-phasing a `fixedInterval` map.
- The reducer applying last-write-wins on `wallClock` for a late peer anchor.
- A resumed match rehydrating from `localStorage` with no relay present.
- Camp belief decaying from `availableSince` in both derivations, anchored and unanchored.
- Per-camp thresholds, specifically that a boss does not go `Stale` in a normal match.
- The provenance clamp at every value, including that waves and tiers are exempt.
- `validUntil` being the earliest of its candidates, and the memo recomputing when it lapses.
- Per-generator truncation: a merged timeline is never all waves.
- Every `RespawnRule` variant: a ranged offset, a two-outcome rule producing the union band when
  the outcome is unknown, `possibleFromCycle` keeping an unreachable branch out of the union in
  early cycles, `scalePerMinuteSeconds` shortening the offset late in a match, `fixedInterval`,
  and `kind: 'none'`.
- The band accumulating both the fight spread and the offset half-width. A map with a wide
  offset range and a narrow fight spread must not produce the same band as the reverse.
- A map with no timed objective renders the no-objective state and not the unknown-map fallback.
- `campsSuppressedDuringObjective`: no camp reads as standing while a phase is believed active,
  and `stall-camp` does not fire.
- Cue confidence filtering via `basedOn`, including a multi-fact cue with mixed confidence.
- Re-fire on a large anchor correction, and no re-fire on a small one.
- `CueState` scoped to `matchId`, so a second match is not silent.
- Cooldowns via `lastFiredByCue`, once-per-occurrence via `fired`.
- Deterministic arbitration ordering independent of registry array order.

`maps` gets the schema and cross-reference checks listed above.

`web` gets Playwright against an injected clock: a fifteen-minute match with no anchor ever
given, an anchor arriving late, a second match started immediately after the first, and the relay
dropping mid-match.

`relay` gets last-write-wins convergence, state sync on join after a hibernation eviction,
`revert` propagation in both its restore and delete forms, and a joining client with a skewed
device clock computing the same game time as the host.

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

One objective phase chain per map, with instances inside a phase. Independent per-instance
chains were a second wrong model: Sky Temple's temples activate together within one cadence, not
on separate clocks.

v1 hardcodes timing inputs rather than measuring them. A replay parser is a large build and
nothing about a countdown requires one. `FightEstimate` is the shape a measurement would fill,
so the door stays open as a data change.

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

1. `engine` types, `project`, the objective phase chain with every `RespawnRule` variant, chain
   advancement and the two-sided present clamp, the band model, the provenance clamp, and the
   `isAvailable` / `isClaimable` predicates. Plus `game-constants.ts` and `tuning.ts`: the wave cadence, the level
   curve and the death-timer curve, which the floor depends on and which no other step provides.
   Tests throughout. No UI.
2. `maps` schema plus two or three battlegrounds, hand-authored from the validated table with
   `provenance: 'published'`, and one of them hand-timed in custom games and marked `verified`
   so the exact path is reachable.
3. `apps/web`: clock, live view, input surface, speech, wake lock, and the match lifecycle
   including end-match and the between-matches flow. Local anchors only. This is the first
   point at which the product hypothesis can be tested, and it should be tested here before
   going further.
4. Remaining battlegrounds as data.
5. `apps/relay` and shared sessions.

Steps 1 to 4 produce a working local app. The relay is last because nothing else depends on it
and it could be dropped from v1 without disturbing the rest.

No replay parsing in v1. Timings are hand-authored, which removes a parser from the critical
path of a countdown. `packages/replay` is described above so that adding it later replaces
values rather than reshaping interfaces.

### Before step 1

Spend a day on a throwaway spike: one battleground, timings hand-stopwatched in a few custom
games, hardcoded, a countdown and the Web Speech API, no engine and no packages. Play four
games with it.

The central bet of this project is that a voice giving timed coaching mid-match is helpful
rather than irritating, and nothing in this document tests it. The spike answers that in a day.
If the voice is good, everything here is worth building. If it is noise, that is a product
finding no architecture would have surfaced, and it is far cheaper to learn now.
