# Game constants and where the numbers came from

Date: 2026-09-05

`architecture.md` names three constants that no document supplied values for:
`firstWaveSeconds`, `levelCurve` and `deathTimerByLevel`. They feed waves, tiers and the
death timer — the floor the app never drops below — and they are exempt from the provenance
clamp, so whatever they contain renders unqualified. This file is the record that closes
that gap.

They are game-wide rules rather than per-map data, which is why the exemption is defensible
at all: a wrong map file cannot make a game-wide rule wrong. The exemption says nothing about
whether these numbers are right, so each one is recorded below with its source and its
weakest point.

## `firstWaveSeconds = 0`, `waveIntervalSeconds = 30`

Source: [Heroes of the Storm wiki, Minion](https://heroesofthestorm.fandom.com/wiki/Minion).

> Minions are released on the Battleground in waves, spawning every 30 seconds from the
> Core.

The same page fixes the *phase* rather than only the cadence, in passing:

> every second wave, starting with the one spawning at the one minute mark, receives better
> stats

A cadence anchored on the one minute mark puts waves on the `:00` and `:30` marks of the
match clock, so the first is at 0:00.

**Weakest point.** One secondary source phrases it as minions spawning "one second into the
game". If that is literal, every wave in the app is one second early. That is below the
resolution of anything the app says out loud, and it is the first value to correct if
hand-timing disagrees. `architecture.md` asserted "waves are not at 0:00" without a source;
that comment is wrong and is corrected here.

## `deathTimerByLevel`

Source: [Heroes of the Storm wiki, Death](https://heroesofthestorm.fandom.com/wiki/Death),
which publishes the whole table. Reproduced verbatim in `game-constants.ts`: 15 seconds at
level 1, rising a second per level to 24 at level 10, then steepening to 65 at level 20 and
above.

This is the only one of the three that is exact rather than derived. It is exact *as a
function of level*, which is precisely why the death timer is not `Exact` in the app: the
level it is read at is an estimate, and near a breakpoint an exact-looking death timer is
simply the wrong number rendered green.

Hero-specific modifiers (Murky's egg, Leoric's trait, several level 20 talents) are out of
scope; the readout is the team's death timer length, not any one hero's.

## `levelCurve`

Derived, not measured, and the weakest of the three. Two published tables and one income
model produce it.

**Published inputs**, from
[Heroes Lounge, "Experience of the Storm"](https://heroeslounge.gg/blog/post/experience-of-the-storm),
which credits Ahli's *Experience of the Storm* report, cross-checked against the wiki:

- XP required per level: 2,010 for level 2; 2,154 for levels 3-6; 3,303 for 7-11; 4,452 for
  12-16; 5,600 for 17-20.
- A minion wave is worth 452 XP at the start and grows by roughly 11.4 XP per game minute
  (the published 11, 11, 10, 11, 14 cycle).
- Passive trickle is 20 XP per second per team, starting at 0:35.

**Model.** Three lanes at two waves a minute gives six enemy waves a minute available to
soak. Minion XP starts landing at about 0:45, when the first waves clash. A single
efficiency factor of **0.80** stands for imperfect soak, contested waves and the modest
contributions of camps, structures and kills, which run in opposite directions and are not
worth modelling separately.

That lands level 10 at 7:19, level 16 at 13:48 and level 20 at 19:03, which is the pacing of
a normal twenty-minute match. The derivation is a short script; the values it produced are
pasted into `game-constants.ts` rather than computed at runtime, because they are constants.

`spreadSeconds` is 12% of the elapsed time with a 20 second floor. A fast-soaking team and a
slow one diverge proportionally rather than by a constant, so the band at level 10 is about a
minute either way and at level 20 a little over two. This is judgement, not measurement.

**Weakest point.** The efficiency factor is a single knob standing in for several effects,
and no published source gives an observed distribution of level-by-time. Tiers are always
rendered `Estimated`, so the app never claims more than this deserves — but the death timer
reads off this curve, so a systematically wrong curve produces a systematically wrong death
timer, rendered amber rather than green. Hand-timing level 10 in a handful of matches is the
cheapest correction and would be worth doing.

## What would replace these

The same offline replay tool that is deferred for map timings. All three fall out of a
parsed match timeline: wave spawns directly, the level curve as an observed distribution
rather than a model, and the death timer as a confirmation. Nothing in v1 depends on that
happening.
