# Research notes

Findings from the design session, kept so the timing data can be re-verified and the
technical constraints do not have to be rediscovered.

## The central constraint: only the first objective is on a fixed clock

Every battleground chains subsequent objective spawns off the *resolution* of the previous
cycle, not off the match clock. Mercenary camp respawns key off capture time the same way.
Verified across four maps:

| Map | First objective | Subsequent |
| --- | --- | --- |
| Battlefield of Eternity | 3:00 | +1:45 after the Immortal dies |
| Towers of Doom | 3:00 | +1:50 after all Altars are captured |
| Infernal Shrines | 3:00 | +3:00 after the Punisher dies |
| Braxis Holdout | 1:30 | +2:10 after the Zerg waves die |

This is why the confidence model exists. A zero-input app would be exact for roughly the
first three to four minutes and blind for the remaining fifteen.

## Timing seed data, all unverified

Sources conflict and predate patches. One guide gives siege camps as first spawn 2:00 with
a 3:00 respawn; the wiki gives mercenaries at 0:30 and bosses at 5:00. Treat everything
below as a starting hypothesis to be confirmed against a replay corpus.

| Map | First objective | Subsequent |
| --- | --- | --- |
| Battlefield of Eternity | 3:00 | +1:45 after Immortal dies |
| Towers of Doom | 3:00 | +1:50 after all Altars captured |
| Infernal Shrines | 3:00 | +3:00 after Punisher dies |
| Braxis Holdout | 1:30 | +2:10 after Zerg waves die |
| Sky Temple | 1:30 | +2:00 after last shot |
| Garden of Terror | 1:30 | +3:20 after plants killed |
| Dragon Shire | 1:15 | +2:00 after Dragon Knight dies |
| Haunted Mines | 2:00 | +2:00 after last grave golem dies |
| Cursed Hollow | 1:30 | +0:50-1:40, or +3:00-4:00 if cursed |
| Blackheart's Bay | 0:50 (chests) | +2:30-3:15 |
| Alterac Pass | unknown | unknown |
| Hanamura Temple | unknown | unknown |
| Tomb of the Spider Queen | unknown | unknown |
| Volskaya Foundry | unknown | unknown |
| Warhead Junction | unknown | unknown |

Other constants, same caveat:

- Minion waves spawn every 30 seconds. The ranged/mage minion carries the regeneration globe.
- Regeneration globe restores 9% health and 7% mana over 5 seconds, lives 6 seconds, and
  becomes neutral to both teams after 3.
- Talent tiers at levels 1, 4, 7, 10, 13, 16, 20. Level 10 is the largest power spike.
- Death timers scale from roughly 10 seconds early to roughly 60 seconds after level 20.
  Exact curve to be derived from replays.
- Heroic ability cooldowns are around 90 seconds.
- Camp seed values: siege 2:00 initial / +3:00 respawn, bruiser 2:00 / +4:00, boss 3:00 /
  +5:00. Contradicted by the wiki; needs verification.
- Towers of Doom sappers: 0:30 initial, +2:30 after capture.

## Replay corpus

Two sources, for two different jobs.

**Archive, for building and testing the parser.** Roughly 1000 `.StormReplay` files exist in
a Google Drive backup of an old Windows machine, covering all 15 battlegrounds with between
12 and 70 each. They span May 2015 to July 2019, so they cannot verify current timings: the
patches in that gap are the reason the published numbers are unreliable in the first place.
What they are good for is developing the parser against real files, and the wide spread of
replay protocol versions stress-tests version handling better than a clean modern sample.

Two practical notes for the tool: some of these sit in `GameLogs` desync folders and may be
truncated, and map identity must come from parsed replay content rather than filenames,
because the archive mixes German and English client locales (`Drachengärten` and
`Dragon Shire` are the same map).

Archive-derived timings are acceptable as development placeholders. They must be recorded
with `provenance: 'archive'` in the map definition, which prevents the app from presenting
them as `Exact`. See "Map definitions" in `spec.md`.

The archive is a Google Drive backup mounted under `~/Library/CloudStorage` on the
development machine, under a `Documents/Heroes of the Storm` tree.

### Archive locale mapping

The archive spans a period when the client language changed, so the same battleground appears
under two names. Recorded here for triaging files by hand; the tool itself must take map
identity from parsed replay content, not from filenames.

| German | English |
| --- | --- |
| Drachengärten | Dragon Shire |
| Garten der Ängste | Garden of Terror |
| Geisterminen | Haunted Mines |
| Grabkammer der Spinnenkönigin | Tomb of the Spider Queen |
| Höllenschreine | Infernal Shrines |
| Schlachtfeld der Ewigkeit | Battlefield of Eternity |
| Schwarzherzbucht | Blackheart's Bay |
| Sprengkopfmanufaktur | Warhead Junction |
| Tempel des Himmels | Sky Temple |
| Türme des Unheils | Towers of Doom |
| Verfluchtes Tal | Cursed Hollow |
| Volskaya-Fertigung | Volskaya Foundry |

Alterac Pass, Braxis Holdout and Hanamura Temple appear only in English, since they released
after the client had been switched.

### Non-battleground content in the archive

Not every file is a standard 5v5 match, and a run that assumes otherwise will derive garbage.
Observed and to be filtered out:

- `Escape From Braxis` / `Endstation Braxis`, a co-op event map with no objective cycle.
- `Silver City`, a brawl map.
- `Kein Limit #1`, a brawl.
- `Tutorial02`.
- Filenames containing a machine name and `Desync` or `Disconnect`, which come from the
  `GameLogs` folders and are frequently truncated.

Filtering belongs on parsed content (game mode and map id) rather than on these names, which
are only listed so the cases are known to exist.

**Current replays, for verification.** The primary source. Matches are played several times
a week on Linux under Proton, so fresh replays accrue continuously. Since the fixed
constants need only a handful of replays per map, this covers the critical numbers within a
few weeks of ordinary play, with Quick Match providing map variety.

Under Proton the replay directory lives inside a Wine prefix rather than at the native
Windows path, something like
`<prefix>/drive_c/users/steamuser/Documents/Heroes of the Storm/Accounts/<id>/<hero id>/Replays/Multiplayer/`.

**Heroes Profile, optional.** Now a fallback rather than a requirement. Worth using only if
the bands need more volume than ordinary play provides, or for maps that rarely come up.
Using it means checking their terms for bulk access.

## Data availability

- Blizzard never shipped a Heroes of the Storm API and the game is in maintenance mode, so
  there is no live data path. This is settled, not a gap to keep researching.
- Overwolf's Game Events Provider is a native SDK and does not meaningfully cover this game.
- Replay files are MPQ archives. `heroprotocol` (JS port of Blizzard's own tool) decodes
  them. `hots-parser` builds on it. `storm-replay` wraps StormLib for Node and is faster but
  native.
- Heroes Profile exposes parsed replay data, an upload endpoint and an archive, which is a
  route to a corpus without collecting thousands of games by hand.

## Browser constraints

- A browser tab cannot receive keystrokes while the game has focus. No global hotkeys. This
  is the reason the phone is the primary surface and the reason the desktop companion is
  worth building later.
- Clicking a second-monitor browser window steals OS focus from the game.
- iOS Safari silently drops `speechSynthesis` utterances not triggered by a user gesture,
  stops speech entirely when backgrounded or locked, and returns nothing from `getVoices()`.
- Screen Wake Lock requires a secure context, which is one reason the app is served over
  HTTPS and talks to a relay rather than to a plain-HTTP process on the LAN.

## Pro play concepts worth encoding

- Arrive at objectives already full health and mana. The 30 to 45 seconds before a spawn is
  where the preparation happens.
- The skill in camps is not taking them, it is stalling them so mercenaries arrive during
  the objective fight and the enemy cannot answer both. Blizzard's own "Midgame Moves"
  article gives per-map prescriptions.
- A talent tier advantage matters far more than a level advantage. Never take an even fight
  into a tier deficit.
- Structures are the only permanent advantage. Kills are valuable because the death timer
  creates a window to take them.
- Missing minion waves is the most common macro failure below high ranks.

## Sources

- Icy Veins map guides: https://www.icy-veins.com/heroes/heroes-of-the-storm-map-guides
- Blizzard, "Midgame Moves: Camp Timings and Map Pressure":
  https://news.blizzard.com/en-gb/heroes-of-the-storm/21966705/midgame-moves-camp-timings-and-map-pressure
- HotS macro guide (djspiewak): https://gist.github.com/djspiewak/688a4098dc18b7d4acbb
- heroesfire map timings: https://www.heroesfire.com/hots/guide/map-timings-2508
- Heroes of the Storm wiki: https://heroesofthestorm.fandom.com/
- Heroes Profile API: https://api.heroesprofile.com/Api
- heroprotocol: https://github.com/nydus/heroprotocol
- partyserver: https://github.com/cloudflare/partykit/tree/main/packages/partyserver
- UI reference screenshots: https://interfaceingame.com/games/heroes-of-the-storm/
  (talent screen and in-match panels; not redistributed in this repo)
