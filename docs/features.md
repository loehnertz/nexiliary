# Feature catalogue

Every feature discovered during the design session, whether or not it made v1. The point of
this document is that nothing explored gets lost, and that the architecture can be built
with the deferred items in view.

Status values:

- `v1` - in scope for the first release
- `deferred` - wanted later, architecture must keep the door open
- `rejected` - deliberately excluded, with the reason recorded

See `spec.md` for the design these are drawn from.

## Live timing

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 1 | Objective timers per battleground | v1 | First spawn is exact; later cycles need an anchor or fall back to a band |
| 2 | Mercenary camp timers | v1 | Initial spawn exact; respawn needs a `CampTaken` anchor |
| 3 | Boss camp timers | v1 | Same anchor model as camps |
| 4 | Minion wave timers | v1 | 30s cadence, always exact, no input |
| 5 | Death timer length readout | v1 | Current cost of dying, from the game-time curve. Always exact |
| 6 | Talent tier and level estimate | v1 | Always `Estimated`; depends on soak quality |
| 7 | Confidence-tiered display | v1 | Exact / Estimated / Unknown, colour-coded throughout |
| 8 | Re-anchor tap | v1 | Overwrites rather than accumulates, so it cannot drift |
| 9 | Graceful degradation on unknown maps | v1 | Falls back to waves, tiers and the death timer instead of failing |

## Coaching

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 10 | Conditional prompts on clock events | v1 | Phrased as conditions, never assertions about game state |
| 11 | Pre-objective preparation prompts | v1 | Regen, position, reset before the spawn window |
| 12 | Camp and objective synchronisation prompts | v1 | Stall a camp so mercenaries land during the objective fight |
| 13 | Talent tier spike warnings | v1 | Levels 10, 16, 20 |
| 14 | Prompt verbosity tiers | v1 | Objectives and level 10 on by default; waves off |
| 15 | Per-map playbooks as pull-up reference | deferred | Considered and not chosen for the live surface; would suit a between-matches screen |
| 16 | Review-driven prompt priority | deferred | Promote the prompts a given player keeps failing. Depends on the review |
| 17 | Drill and quiz mode between matches | deferred | Was a candidate product shape of its own; useful once the map data is verified |

## Audio

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 18 | Spoken prompts via Web Speech API | v1 | Free, built in, no key. iOS needs a gesture to unlock and a wake lock to stay alive |
| 19 | Voice and verbosity settings | v1 | Voice selection needs a fallback for Safari's unreliable `getVoices()` |
| 20 | Speech routed into Discord voice chat | deferred | Two routes: virtual audio cable (no code, per-user setup) or a Discord bot (clean, needs the relay) |

## Sessions and multiplayer

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 21 | Shared session over the relay | v1 | One clock for the whole team |
| 22 | Any teammate's anchor corrects everyone | v1 | The practical answer to one person forgetting to tap |
| 23 | Join by short code or QR | v1 | No accounts |
| 24 | Discord bot as a session subscriber | deferred | Speaks prompts in the team voice channel. A subscriber on the existing relay channel |

## Desktop companion

All deferred. The relay protocol treats anchors as source-agnostic specifically so these
become publishers on an existing channel rather than an engine change.

Platform note: the game is played on Linux under Proton, not Windows. That changes what each
of these entails and should not be assumed away. Folder watching has to handle a Wine prefix
path. Global hotkeys are straightforward on X11 and awkward on Wayland. Screen capture for
OCR needs portals under Wayland. None of this is blocking, but a companion designed for
Windows would need rework.

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 25 | Screen OCR of the in-game clock | deferred | Removes the start tap and clock drift entirely. The single highest-value deferred item |
| 26 | Global hotkey re-anchoring | deferred | A browser tab cannot receive keys while the game has focus; a desktop process can |
| 27 | Replay folder watching and auto-import | deferred | Removes file picking from the review flow |
| 28 | Speech emitted from the desktop | deferred | Sidesteps every iOS restriction and makes Discord routing trivial |
| 29 | Announcer audio cue detection | deferred | Alternative auto-sync path. Fragile against music and voice comms |

## Post-game review

All deferred. v1 ends when the match does. The design is kept in `spec.md` because the live
prompts are chosen to match these grading dimensions, and because the parser's output shape
is fixed by them.

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 30 | Client-side replay parsing | deferred | Would run `heroprotocol` in a Web Worker so replays never leave the machine. Distinct from the offline tool in row 40 |
| 31 | Objective readiness grading | deferred | Alive and in position at spawn |
| 32 | Costly death grading | deferred | Deaths inside the pre-objective window |
| 33 | Camp timing grading | deferred | Captures in dead time vs synced to objectives |
| 34 | Soak grading | deferred | XP lost to unattended lanes |
| 35 | Tier window grading | deferred | Periods with a talent tier lead and what was done with them |
| 36 | Conversion grading | deferred | Structures taken inside a won fight's death timers |
| 37 | Ranked findings with clock times | deferred | Three to five per match, scrubbable in the replay |
| 38 | Trend across recent matches | deferred | Shows whether a habit is actually shifting |

## Data pipeline

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 39 | Map definitions as data files | v1 | Adding a battleground is a data change, never a logic change |
| 40 | Offline replay tool for timing verification | v1 | Node tool, no UI, not in the app bundle. On the critical path for the live feature: without it there are no trustworthy numbers to display |
| 41 | Estimation band calibration from a corpus | v1 | Real cycle-length distributions rather than guessed bands. Same offline tool as row 40 |
| 42 | Aggregate cross-user statistics | rejected | Needs accounts and storage; v1 is deliberately account-free |

## Rejected

| # | Feature | Reason |
| --- | --- | --- |
| 43 | Draft assistant (bans, counters, synergy, map win rates) | Well served by HOTS GG, hotspatchnotes and heroescounters. Needs a different input model |
| 44 | Full prescriptive decision tree | Would have to assert team levels, who is alive and enemy positions. Violates principle 1 |
| 45 | Enemy heroic cooldown tracker | Requires per-event logging that accumulates state and drifts. Violates principle 2 |
| 46 | Per-death punish window tracker | Same as above. The death timer *length* is kept because it needs no input |
| 47 | Lane assignment and rotation planner | Depends on draft input, which is out of scope |
| 48 | Accounts, profiles, cloud replay storage | Not needed for anything in v1 and adds privacy surface |
| 49 | Native Overwolf overlay | A different product. The deferred desktop companion covers the same ground without replacing the web app |

## Architectural obligations these create

The deferred items are not free. To keep them cheap, the following must hold from the start:

1. `engine` has zero dependencies, so the desktop companion can reuse it verbatim (25-28).
2. Anchors carry a `source` field that the engine never branches on, so new publishers need
   no engine change (25, 26, 29).
3. The relay fans out to subscribers without knowing what they are, so the Discord bot is
   additive (24).
4. Cue text, priorities and thresholds are data, so review-driven promotion and wording
   changes are value edits rather than control-flow changes (16).
5. Map definitions are data validated by schema, so drills and playbooks can be authored
   against the same source (15, 17).
6. Replay parsing produces a neutral match timeline rather than review-shaped output, so the
   same parse feeds timing verification and band calibration now, and grading later
   (30, 40, 41).
7. The live view is built without assuming a review exists. Nothing in v1 may depend on
   post-match data being available (31-38).
