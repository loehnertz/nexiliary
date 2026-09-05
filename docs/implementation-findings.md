# What implementation found in the design

Date: 2026-09-05
Status: all applied. `architecture.md` has been corrected at each point below; this file
is the index, so the changes can be reviewed without diffing a 1,650 line document.

Seventeen findings, from building steps 1 to 4. Grouped by how they were caught, because
that is the useful signal: the type checker found the first group in seconds, and no
amount of further reading would have found the last.

## Found by the compiler

**1. `TimedEvent` had no way to tell a spawn from a resolution.** The objectives generator
is required to emit both as events, and both are `kind: 'objective'`. Nothing downstream
could distinguish them, so the rail would count a resolution as the next objective. Added
`role: 'spawn' | 'resolution'`.

**2. `Cue.evaluate(ctx, t)` had no access to `perCue`.** `stall-camp` is given the rule
"does not fire on consecutive cycles unless the chosen camp differs. That is what
`CueState.perCue` remembers" — and the signature it is given cannot read it. `evaluate`
now takes the cue's memory as a third argument and `CueMatch` may carry a new value back,
which keeps cues pure functions while the state still travels with the caller.

**3. `CueText` cannot live in `packages/maps` as a type.** `evaluateCues` is typed against
it and the dependency runs `maps -> engine`. The interface is in `engine`; the data is in
`maps`, which is what the obligation actually requires.

**4. `AnchorControl.offer()` returns one offer, but the camp chip needs one per camp.**
The design also makes the rail entries themselves the camp buttons, so a single-offer
signature cannot express the input surface it specifies. `offer` returns an array; empty
is the old `null`.

**5. `ControlOffer.secondary.action: 'clear' | 'restore'` cannot express "camp is up".**
Those are undo verbs and a `CampUp` anchor is a write. The action union now carries writes.

## Found by reasoning the specification through

**6. The clamp must not apply to the cycle immediately after an anchor.** The design says
`view` clamps with `offsetMin`/`offsetMax` on the event, and `project` puts them on every
event. But the clamp's premise is "the pending resolution has not been reported, so this
cannot happen sooner than now", and for the cycle right after an anchor that resolution
*was* reported. On Braxis with a 130 second offset and an anchor at 5:00, the next spawn
is `Exact` at 7:10 — and the clamp would push it to `now + 130`, moving a green number
forward with the clock. `project` now sets the offsets only on cycles whose predecessor
was projected rather than observed, and `view` skips anything without them.

**7. Rail slots 3 and 4 take camps satisfying `isClaimable`, which excludes `Stale` by
construction** — while the input surface requires a `Stale` camp to keep a chip, "because
decay must not remove the only control that could correct it". Both hold once the chip
lives in the overflow camp list, which the design already provides for camps that do not
win a rail slot. `LiveView` now carries that list.

**8. The two camp-suppression bullets cannot both drive belief.** "Once `now` passes that
`high` with no anchor, every camp becomes `Stale`" and "when suppression lifts, by anchor
or by elapse, every suppressed camp's `availableSince` is reset to that moment" say
opposite things about the elapse case: a reset `availableSince` reads as `Known(true)`.
Resolved as the enumerated tests read it — expiry gives `Stale`, an anchored lift resets
`availableSince` and the camp comes back fresh. In the case the app is designed around,
where the player taps, they agree.

**9. `campsSuppressedDuringObjective` on a map with no objective chain.** The design states
the CI check without its reason. The reason is that the window is derived from the chain's
spawn and resolution band; with no chain there is nothing to derive it from, so the flag
would ask the app to assert a window it cannot compute. Recorded, because Tomb of the
Spider Queen genuinely does remove its camps and still must not carry the flag.

## Found by running it

**10. The wave countdown froze at 0:00.** Generators emit blocks, and a block stays valid
until it ends — that is what stops `validUntil` forcing a projection every thirty seconds.
So the first entry in the block is routinely in the past. `view`, `buildContext` and
`wave-reminder` all read it with `find`. They now take the earliest entry with
`at >= now`, and `AdviceContext` carries `nextWave` so a cue cannot repeat the mistake.

**11. `validUntil` had no candidate for the level estimate changing.** The death timer
reads off the level curve, so it showed a stale death timer until some unrelated candidate
happened to lapse. The next level-curve boundary and the next tier are candidates now.

**12. During a live objective the app counted down to the next one.** The chain advances
past a cycle as soon as `now` passes its `high`, which on a scalar-offset map is the
instant it spawns. So through the whole phase — the moment the app exists for — the
dominant countdown showed the cycle *after* the one being fought, and the re-anchor
button, which the principles call a core interaction, sat unemphasised. `Timeline` now
carries an `objectivePhase` belief derived from the same window the suppression rule uses.

**13. That belief then contradicted the clamp on screen.** "No sooner than two minutes"
above "it is happening now", about one cycle. Advancement and the clamp are deliberately
allowed to disagree because they live in different places; a readout that shows both at
once breaks that. The phase reads the clamp's basis: a clampable pending spawn is never
live. Camp suppression stops claiming on an `Unknown` cycle for the same reason.

**14. A suppressed camp had no way to say "away" rather than "no data".** It rendered as
an em-dash in the exact-confidence colour, which reads as "available". `CampState` carries
`suppressed`, and the chip reads AWAY in the unknown tone.

## Numeric claims

**15. Sky Temple does reach `Unknown`.** The design says it and Hanamura "never reach
`Unknown` at all". With `stepSpread` pinned to the 8 second floor, `spread(n)` crosses the
120 second band at n = 13, about thirty-five minutes after the last anchor. That is past
the end of any real match, so the product claim holds and the absolute one does not. Both
are asserted separately now.

**16. Hanamura is not a `spreadSeconds: 0` map.** Its final barrage is a fixed fifteen
seconds, but the phase is *pushing a payload*, which is exactly the human variable the
fight spread exists to price. Sky Temple is the only map `minStepSpread` carries.

The rest of the numeric claims held. The published worked example — bands of 50, 81, 110
and 138 seconds for `stepSpread` 25 and `r` 0.3 — reproduces exactly, the clamp translates
without narrowing at every point across a match on every map, and the per-map degradation
sits on the documented curve.

## Found by playing it

**18. "Objective ended" could be pressed before any objective existed**, one second into
a match, and could be pressed repeatedly for the same one. The control asked only whether
a phase was live, and a phase is live for a fraction of the time the tap is wanted.
`ObjectivePhase` gains an `unreported` state, and the control is offered when — and only
when — something has spawned that no anchor accounts for. An `Unknown` cycle falls through
to `unreported` rather than `idle`, because when timing is lost the tap is the only way
back.

**19. The resolution band used the spawn's spread rather than the fight's.** A cycle whose
spawn is exactly known — the first objective of every match, and any recorded spawn —
therefore resolved at an exact instant. That band closes the camp suppression window and
bounds the live readout, so both were claiming a phase ends at a precise moment. It is the
spawn spread combined with this cycle's fight spread, which are independent.

**20. The wake lock fallback was not a video.** The inlined base64 decoded to something
with no `moov` box, `play()` rejected, the rejection was swallowed. Screen Wake Lock needs
a secure context, so any plain-http address — a phone on the LAN, which is how this is
tested before deployment — was relying entirely on that fallback. The deeper fault was the
silence, so the service reports which mechanism is actually holding the screen.

**21. The footer read as unexplained numbers**, and the talent tier row had no label at
all. The numbers were right — a test asserts the death timer and the level estimate agree
at every second of a match — but "death" beside "level" does not say that one is the cost
of dying. The app now carries a guide, because a dense readout in the game's own idiom of
bare numerals needs somewhere to be learned once.

## A gap the design did not have

`ObjectiveEnded` taps give cycle length, and cycle length is fight plus offset. When a
countdown is wrong there was no way to tell which of the two guesses was wrong, so no
amount of playing could promote a map to `verified` — and `verified` is what unlocks every
exact number in the app.

`ObjectiveSpawned` closes it. Spawn to end is the fight; end to next spawn is the offset.
It passes the input gate on its own merits rather than as an export hook: it states a
fact, forgetting it degrades to exactly the previous behaviour, and the engine reads it,
walking the chain from the newer of the two anchors so a spawn observation pins its cycle
outright instead of predicting it from an offset.

**22. The level readout rendered as `~13`, and the tilde reads as a minus** at that size.
It was also redundant: colour and label already carry whether a number is estimated. The
value is bare and the label says `team level (est.)` when it is one.

## The level curve, challenged

Asked directly whether the level estimate is reliable enough to keep, the answer turned out
to be better than expected and still not good enough.

The curve's one free parameter is soak efficiency, and sweeping it across its whole
plausible range moves level 10 only between 6:38 and 8:13 — a half-width of 48 seconds
against the 53 seconds authored, so the band is honestly priced for a normal game. What it
cannot price is a blowout: a team far ahead or far behind is off the curve entirely and the
app has no way to know.

That alone would be survivable. What is not is that **team level is the one number the app
shows which the player can also read off their own screen**. A visible mismatch there costs
trust in every number they cannot check, which is the objective timings — the part that is
actually worth having.

So the tier row became the input. `TierReached` re-phases the whole curve from an
observation, exactly as `ObjectiveEnded` re-phases the objective chain: one tap, overwritten
rather than accumulated, and forgetting it leaves precisely the previous estimate. While the
observed tier still holds, the level is `Exact` and so is the death timer that reads off it.

**23. Team level and the talent tier row were both duplication.** Both are on the
player's own screen, so showing them is at best redundant and at worst — when the derived
curve disagrees with what they can see — corrosive to the numbers they *cannot* check,
which is the part worth having. They are gone. What replaced them is what the game does
not show: how long the death timer is right now, and when the next tier lands. The level
is still estimated internally, because those two are computed from it, and both inherit
its confidence and are never `Exact`.

A `TierReached` anchor was built to let the player correct that estimate, and then
removed. The design's own input gate had already ruled on it — "passes, narrowly… worth
having only if a cue needs the current tier" — and no cue does: `tier-spike` reads the
next tier from the curve, not from an anchor. With nothing displaying the level there is
also no signal that would ever prompt someone to correct it, so it was a control with no
trigger. Recorded because the reasoning is the useful part: an input has to be reachable
*and* prompted, and the gate's four rules only test the first.

**24. The rail could degenerate to four identical wave countdowns.** The fixed slot
allocation exists so a map with four camps up still shows upcoming events; the same
degeneracy is reachable from the other side — no objective, no tiers left, every camp
`Stale` — and nothing caught it, because the engine test asserts the *timeline* is never
all waves and this was the *view*. The fallback order now prefers a `Stale` camp chip over
a second wave, since that chip is the control that corrects it, and those chips are
tappable, which they had not been.

**25. The phase belief leaked straight past the provenance clamp.** On a `published` map
the first objective's spawn is `Exact` from map data, so the live readout rendered green
and said "Exact" about a number the map is not allowed to claim — the exact failure the
clamp exists to prevent, reached through a field added after it was written. The clamp now
covers it, and a sweep asserts that across a whole match on an unverified map the only
green thing anywhere in the view is a minion wave.

**26. Prompts were visible for exactly one second.** `evaluateCues` reports what fired
*this* second and correctly drops a key once it is in `fired`. That is right for speech and
wrong for the screen, and the view treated one as the other, so a prompt flashed and
vanished. The web layer holds a fired prompt for eight seconds.

**27. Cue evaluation ran more than once per second.** It is not idempotent — recording what
fired is the point — so a second call within the same second finds every key already fired
and returns nothing, blanking a prompt mid-display. StrictMode does that on mount, and in
production so does changing a setting while a prompt is up.

## Found by a phone, in a real match

**28. The screen slept, and there was never anything preventing it.** Screen Wake Lock
requires a secure context, so on the `http://192.168.x.x` address a phone reaches the dev
server on, the API is not restricted — it is absent. The looping-video fallback cannot
cover that: Chrome pauses video-only media in the background outright, and a 1px invisible
video does not hold the screen while visible either. The dev server can now serve TLS, and
an insecure origin is reported as exactly that rather than as a hold the app cannot verify.

**29. A discarded tab lost the match to the setup screen.** Android Chrome discards a
backgrounded tab freely, and on a locked phone that is the ordinary case rather than an
edge one. A cold start showed setup with a resume banner, so every screen-off cost a
detour. A save younger than three minutes now resumes automatically, because at that age a
cold start is the browser having killed the tab rather than the player returning. A match
is only stored while live — `MATCH_ENDED` clears it — so there is no stale match to be
thrown back into.

**30. The stored save went stale exactly when it mattered.** It was written only when the
anchor set changed, and a match can run for minutes without a tap — which is precisely when
a phone kills the tab. It is now written on a heartbeat and, the one that counts, on
`visibilitychange` to hidden, which is the last code that runs before a discard.

**31. The wake lock status claimed a hold it had lost.** The browser releases the lock
whenever the page stops being visible, and nothing updated the status, so the settings
panel reported the screen was held while the phone was asleep.

## Data

**17. Camps are removed during the objective on seven maps, not two.** Alterac Pass,
Battlefield of Eternity, Braxis Holdout, Dragon Shire, Garden of Terror, Tomb of the
Spider Queen and Volskaya Foundry. On Dragon Shire, Garden of Terror and Volskaya the
camps leave partway through the phase rather than at its start, so the window opens early
and the app is briefly quiet about camps that are still there. That costs an opportunity;
the other direction advises starting a camp that is not on the map.

Camp spawn and respawn figures come from the wiki's per-map pages, which disagree with its
general mercenary page on several maps. Collected in `docs/camp-data.md` with the gaps
marked rather than filled.
