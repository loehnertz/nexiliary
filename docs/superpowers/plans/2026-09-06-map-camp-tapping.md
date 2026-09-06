# Map-Image Camp Tapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the compass-named camp rail with a tappable battleground image, so a camp is addressed by where it is rather than by what it is called, and name the camp when its respawn is announced.

**Architecture:** Camp positions become a field on `CampDefinition` in `engine`, normalised against the battleground's playable bounding box, with the shipped image cropped to that box. A new `MapPanel` in the web app is a second renderer for the existing `CampChip[]`, so belief semantics cannot drift between the two views; `CampPanel` is retained as the degraded path. Two contained changes to the cue layer name the camp and rank boss respawns above siege ones.

**Tech Stack:** TypeScript strict, pnpm workspaces, Vitest, React + Vite, Tailwind as tokens only.

**Spec:** `docs/superpowers/specs/2026-09-06-map-camp-tapping-design.md`

## Global Constraints

- `packages/engine` has **zero dependencies**. Never add one.
- TypeScript `strict` throughout. No `any`, no non-null assertions added.
- Map definitions are data validated by schema, never code.
- Confidence colours: green for known, amber for estimated. Team blue and enemy crimson are never reused for confidence.
- Never assert what cannot be derived. A camp whose belief is not `Known` must not render as a solid assertion.
- Anchors overwrite, never accumulate. No feature may introduce an event log.
- Branch is `feat/map-camp-tapping`. Do not commit to `master`.
- Tests run with `pnpm test` at the root, or `pnpm --filter @nexiliary/engine test` for one package.
- Web tests are pure logic tests in Vitest. There is no React Testing Library and no Playwright installed — **do not add them**. Test logic, not chrome.

---

### Task 1: Name the camp in spoken and displayed prompts

`renderSpoken` in `arbitrate.ts` substitutes `{time}` and nothing else, and `display` is passed through with no substitution at all. Both need `{camp}`, resolved from the match's existing `subject` field. Without the `display` half, the screen would read "Camp is up." while the voice named which one.

**Files:**
- Modify: `packages/engine/src/cues/arbitrate.ts:120-127` (`renderSpoken`) and `:180-186` (where `active` is built)
- Modify: `packages/engine/src/cues/types.ts:40-42` (the `display` and `spoken` doc comments)
- Test: `packages/engine/test/cues.test.ts`

**Interfaces:**
- Consumes: `CueMatch.subject` (already exists), `AdviceContext.camps` — `CampState` already carries `label` at `packages/engine/src/types.ts:132`.
- Produces: `renderText(template: string, match: CueMatch, ctx: AdviceContext): string`, replacing the private `renderSpoken`. Used by Task 2's cue text.

- [ ] **Step 1: Write the failing test**

Add to `packages/engine/test/cues.test.ts`:

```ts
describe('prompt text substitution', () => {
  it('names the camp in both the spoken line and the display line', () => {
    const map = cursedHollow
    // 6:00 is after the 5:00 boss spawn, so the boss is standing and Known.
    const timeline = project(map, new Map(), 360)
    const ctx = buildContext(map, timeline, 360)
    const text: Record<string, CueText> = {
      'camp-available': {
        ...cueTextFixture['camp-available'],
        display: '{camp} is up.',
        spoken: '{camp} is up.',
      },
    }
    const out = evaluateCues(
      cues.filter((c) => c.id === 'camp-available'),
      text,
      { maxTier: 'verbose', speechEnabled: true },
      ctx,
      newCueState('m1'),
    )
    expect(out.speak?.spoken).toMatch(/^(siege|knights|boss) (nw|ne|sw|se) is up\.$/)
    expect(out.speak?.display).toBe(out.speak?.spoken)
  })

  it('leaves a template with no placeholder untouched', () => {
    const map = cursedHollow
    const timeline = project(map, new Map(), 360)
    const ctx = buildContext(map, timeline, 360)
    const text: Record<string, CueText> = {
      'camp-available': { ...cueTextFixture['camp-available'], display: 'Camp is up.', spoken: 'Camp is up.' },
    }
    const out = evaluateCues(
      cues.filter((c) => c.id === 'camp-available'),
      text,
      { maxTier: 'verbose', speechEnabled: true },
      ctx,
      newCueState('m1'),
    )
    expect(out.speak?.spoken).toBe('Camp is up.')
  })
})
```

The fixture at `packages/engine/test/cue-text.fixture.ts` exports its table as `cueText`, which collides with the maps package's export of the same name, so import it aliased:

```ts
import { cueText as cueTextFixture } from './cue-text.fixture.js'
import { cursedHollow } from '@nexiliary/maps'
import type { CueText } from '../src/index.js'
```

Check the existing imports at the top of `cues.test.ts` first and add only what is missing.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nexiliary/engine test -- cues`
Expected: FAIL — the spoken line is the literal `{camp} is up.`

- [ ] **Step 3: Write minimal implementation**

In `packages/engine/src/cues/arbitrate.ts`, replace `renderSpoken` with:

```ts
/**
 * `{time}` reads the confidence of the fact the prompt rests on; `{camp}` names the
 * subject. Applied to `display` as well as `spoken`, because a screen reading "Camp is
 * up." beside a voice naming which one is worse than either alone.
 */
function renderText(template: string, match: CueMatch, ctx: AdviceContext): string {
  let out = template
  if (out.includes('{time}')) {
    const id = match.timeFrom ?? match.basedOn[0]
    const event = id === undefined ? undefined : ctx.timeline.events.find((e) => e.id === id)
    out = out.replace('{time}', event === undefined ? '' : describeTime(event.confidence, event.at, ctx.now))
  }
  if (out.includes('{camp}')) {
    const camp = ctx.camps.find((c) => c.id === match.subject)
    out = out.replace('{camp}', camp?.label ?? '')
  }
  return out.replace(/\s{2,}/g, ' ').trim()
}
```

Then in `evaluateCues`, change the `active` mapping to run both fields through it:

```ts
  const active = candidates.slice(0, 2).map(({ cue, match, text: cueText }) => ({
    cueId: cue.id,
    key: match.key,
    display: renderText(cueText.display, match, ctx),
    spoken: renderText(cueText.spoken, match, ctx),
    band: cueText.basePriority,
  }))
```

Update the doc comments in `packages/engine/src/cues/types.ts`:

```ts
  /** May contain `{camp}`, substituted from the match's subject at render time. */
  readonly display: string
  /** May contain `{time}` and `{camp}`, substituted at render time. */
  readonly spoken: string
```

- [ ] **Step 4: Run the full engine suite**

Run: `pnpm --filter @nexiliary/engine test`
Expected: PASS, including the two new tests. `display` is now trimmed where it was not before; if an existing assertion fails on leading or trailing whitespace, fix the expectation, not the trim.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/cues/arbitrate.ts packages/engine/src/cues/types.ts packages/engine/test/cues.test.ts
git commit -m "Say which camp is up"
```

---

### Task 2: Rank camp respawns, and stop one camp muting the rest

`camp-available` returns the first matching camp in map order, and its `cooldownSeconds: 120` is keyed on `lastFiredByCue[cue.id]` — per cue, not per camp. So one siege camp silences a boss for two minutes. Per-window deduplication is already handled by `fired[match.key]`, whose key contains the camp id and `availableSince`, so the cooldown only ever needed to be a burst limiter.

**Files:**
- Modify: `packages/engine/src/cues/camp-available.ts`
- Modify: `packages/maps/src/cue-text.ts:43-54`
- Test: `packages/engine/test/cues.test.ts`

**Interfaces:**
- Consumes: `CampState.pressureValue` — `packages/engine/src/types.ts:143` documents it as "the raw value for `now`", so no cycle lookup is needed.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

```ts
it('announces the boss rather than a siege camp when both come up together', () => {
  const map = cursedHollow
  // Camps first spawn at 60 (siege, knights) and 300 (boss). At 300 the boss has just
  // become available and the others are long since standing, so all are candidates.
  const timeline = project(map, new Map(), 300)
  const ctx = buildContext(map, timeline, 300)
  const match = cues.find((c) => c.id === 'camp-available')?.evaluate(ctx, { freshSeconds: 15 }, undefined)
  expect(match).not.toBeNull()
  expect(match?.subject).toMatch(/^golem-/)
  expect(match?.score).toBe(9)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nexiliary/engine test -- cues`
Expected: FAIL — `subject` is whichever camp comes first in the map file, and `score` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `evaluate` in `packages/engine/src/cues/camp-available.ts`:

```ts
  evaluate(ctx, t) {
    const fresh = t.freshSeconds ?? 20
    // Collect rather than return the first match: several camps can come up in the same
    // tick, and which one is worth interrupting a fight for is a question about the camp,
    // not about the order it happens to sit in the map file.
    let best: CampState | null = null
    for (const camp of ctx.camps) {
      if (camp.standing.kind !== 'Known' || !isAvailable(camp.standing)) continue
      if (camp.availableSince === undefined) continue
      if (ctx.now - camp.availableSince > fresh) continue
      if (best === null || camp.pressureValue > best.pressureValue) best = camp
    }
    if (best === null || best.availableSince === undefined) return null
    return {
      key: `camp-available:${best.id}:${Math.round(best.availableSince)}`,
      basedOn: [best.id],
      subject: best.id,
      // A boss (9) outranks a bruiser (7) outranks a siege camp (6). Mistiming a boss is
      // the expensive case, so it is the one that gets the sentence.
      score: best.pressureValue,
    }
  },
```

Add `import type { CampState } from '../types.js'` at the top.

Then in `packages/maps/src/cue-text.ts`, update the `camp-available` entry:

```ts
  'camp-available': {
    id: 'camp-available',
    display: '{camp} is up.',
    spoken: '{camp} is up.',
    tier: 'standard',
    basePriority: 'normal',
    priorityWithinBand: 40,
    // `fired[match.key]` already dedupes per availability window, keyed on the camp and
    // when it came up. This is only a burst limiter: at the old 120 one siege camp muted
    // every other camp, a boss included, for two minutes.
    cooldownSeconds: 30,
    thresholds: { freshSeconds: 15 },
  },
```

- [ ] **Step 4: Run both suites**

Run: `pnpm --filter @nexiliary/engine test && pnpm --filter @nexiliary/maps test`
Expected: PASS. `validateCueText` cross-checks cue text against registered cues and declared thresholds; neither changed, so it should stay green.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/cues/camp-available.ts packages/maps/src/cue-text.ts packages/engine/test/cues.test.ts
git commit -m "Announce the camp worth walking to"
```

---

### Task 3: Fetch, crop and commit the battleground renders

**Files:**
- Create: `apps/web/public/maps/<map-id>.webp` — up to fifteen files
- Create: `docs/map-images.md`
- Modify: `apps/web/vite.config.ts` (PWA precache globs)

**Interfaces:**
- Produces: image files at `/maps/<map-id>.webp`, cropped to the playable extent, ~800 px wide. Task 4 and Task 6 read coordinates against these crops; Task 5 declares their dimensions.

This task has no unit test — it produces assets. Its deliverable is checked by Task 5's test, which asserts every declared image exists on disk at its declared size.

- [ ] **Step 1: List the available sources**

```bash
curl -s -A "Mozilla/5.0" --get "https://heroesofthestorm.fandom.com/api.php" \
  --data-urlencode "action=query" --data-urlencode "list=categorymembers" \
  --data-urlencode "cmtitle=Category:Battleground maps" \
  --data-urlencode "cmlimit=100" --data-urlencode "format=json" | python3 -m json.tool
```

Expected: 16 files covering all fifteen battlegrounds. Haunted Mines has two — take `Haunted Mines map top.png`, the surface, because the camps are there.

- [ ] **Step 2: Resolve each file to a URL and download it**

For each title, the direct URL comes from:

```bash
curl -s -A "Mozilla/5.0" --get "https://heroesofthestorm.fandom.com/api.php" \
  --data-urlencode "action=query" --data-urlencode "titles=File:<TITLE>" \
  --data-urlencode "prop=imageinfo" --data-urlencode "iiprop=url|size" \
  --data-urlencode "format=json"
```

Download into the scratchpad, not the repo. Fandom serves WebP regardless of the `.png` or `.jpg` extension in the title, so check with `file` before converting.

- [ ] **Step 3: Handle the five annotated maps**

Battlefield of Eternity, Blackheart's Bay, Cursed Hollow, Dragon Shire and Sky Temple exist in that category **only** as "areas of interest" or "points of interest" renders, with markers burned into the pixels. Those must not ship: the app's own state dots would sit on top of a permanently-green marker, showing six camps as twelve with half of them never changing, which is exactly the assertion principle 1 forbids.

For each of the five, search the wiki for an unmarked render:

```bash
curl -s -A "Mozilla/5.0" --get "https://heroesofthestorm.fandom.com/api.php" \
  --data-urlencode "action=query" --data-urlencode "list=search" \
  --data-urlencode "srsearch=<Map Name> map" --data-urlencode "srnamespace=6" \
  --data-urlencode "srlimit=20" --data-urlencode "format=json"
```

**If no unmarked render exists for a map, ship no image for that map.** It keeps the rail via Task 8's fallback, and that is a correct outcome rather than a failure. Record which maps these are in `docs/map-images.md`. Do not attempt to paint markers out.

- [ ] **Step 4: Crop to the playable extent and convert**

The crop defines the coordinate frame for Tasks 4 and 6, so it must be done before any coordinate is read. Crop away the black or decorative surround so the image edges touch the outermost playable terrain, then resize to 800 px wide and convert:

```bash
# macOS, no extra tooling. Replace the crop numbers per image.
sips --cropOffset <top> <left> --cropToHeightWidth <h> <w> in.png --out cropped.png
sips --resampleWidth 800 cropped.png --out resized.png
cwebp -q 82 resized.png -o apps/web/public/maps/<map-id>.webp
```

If `cwebp` is unavailable, `sips -s format jpeg -s formatOptions 80` and a `.jpg` extension is an acceptable substitute; keep the extension consistent with what Task 5 declares.

- [ ] **Step 5: Write the provenance note**

Create `docs/map-images.md` recording, per map: the source file title, the crop applied, the output dimensions, and — for any map with no image — why. The repo documents where its data came from for timings; images get the same treatment.

- [ ] **Step 6: Precache the images**

In `apps/web/vite.config.ts`, find the `VitePWA` call and extend its `workbox.globPatterns` to include the new assets, for example `'**/*.{js,css,html,woff2,webp}'`. Read the existing value first and extend it rather than replacing it. Mid-match offline resilience is a stack requirement; a map that blanks when signal drops is worse than the rail it replaced.

- [ ] **Step 7: Verify the build still passes**

Run: `pnpm --filter @nexiliary/web build`
Expected: PASS, with the map images listed among the precached assets in the PWA output.

- [ ] **Step 8: Commit**

```bash
git add apps/web/public/maps docs/map-images.md apps/web/vite.config.ts
git commit -m "Add the battleground renders the map view draws on"
```

---

### Task 4: Add camp positions, cross-checked against bearing

**Files:**
- Modify: `packages/engine/src/map-types.ts:76-102` (`CampDefinition`)
- Modify: `packages/maps/src/camp-presets.ts` (`CampSpec` and `camp()`)
- Modify: `packages/maps/src/schema.ts` (`validateCamp`)
- Modify: `packages/maps/src/battlegrounds/cursed-hollow.ts`
- Test: `packages/maps/test/schema.test.ts`

**Interfaces:**
- Produces: `CampDefinition.position: { readonly x: number; readonly y: number }`, and `CampSpec.position` of the same shape. Tasks 6, 7 and 8 all read it.

- [ ] **Step 1: Write the failing test**

Add to `packages/maps/test/schema.test.ts`:

```ts
describe('camp positions', () => {
  const at = (x: number, y: number) => ({ x, y })

  it('rejects a position outside the unit box', () => {
    const camps = [camp({ id: 'a', label: 'siege nw', type: 'siege', bearing: 'nw', position: at(-0.1, 0.2), firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] })]
    expect(validateMap(bad({ camps })).some((i) => i.problem.includes('position'))).toBe(true)
  })

  it('rejects a bearing that contradicts its position', () => {
    // Declared north-west, sitting south-east. The transposed pair is the likely
    // authoring error across ninety hand-read coordinates.
    const camps = [camp({ id: 'a', label: 'siege nw', type: 'siege', bearing: 'nw', position: at(0.8, 0.9), firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] })]
    expect(validateMap(bad({ camps })).some((i) => i.problem.includes('bearing nw'))).toBe(true)
  })

  it('constrains only the axes the bearing names', () => {
    // `n` says nothing about east or west, so any x is legal.
    const camps = [camp({ id: 'a', label: 'siege n', type: 'siege', bearing: 'n', position: at(0.92, 0.2), firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] })]
    expect(validateMap(bad({ camps })).filter((i) => i.problem.includes('bearing'))).toEqual([])
  })

  it('exempts a central camp', () => {
    const camps = [camp({ id: 'a', label: 'siege c', type: 'siege', bearing: 'c', position: at(0.05, 0.95), firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] })]
    expect(validateMap(bad({ camps })).filter((i) => i.problem.includes('bearing'))).toEqual([])
  })
})
```

`bad()` already exists in that file at line 108, but it is scoped **inside** another `describe` block and is not reachable from a new one. Declare a local copy at the top of this `describe`:

```ts
  const bad = (over: Partial<MapDefinition>): MapDefinition => ({ ...battlegrounds[0]!, ...over })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nexiliary/maps test`
Expected: FAIL — TypeScript rejects `position` on `CampSpec` before the assertions even run.

- [ ] **Step 3: Add the field to the engine type**

In `packages/engine/src/map-types.ts`, inside `CampDefinition`, after `bearing`:

```ts
  /**
   * The camp's marker, normalised 0..1 within the battleground's playable bounding box.
   *
   * The image is cropped to that box, so coordinates are frame-independent: a later
   * re-crop changes the asset, never the fifteen map files. This is a tap target rather
   * than a survey pin, so it may sit slightly off the literal location to keep two
   * adjacent camps separately tappable.
   */
  readonly position: { readonly x: number; readonly y: number }
```

- [ ] **Step 4: Thread it through the preset helper**

In `packages/maps/src/camp-presets.ts`, add to `CampSpec` beside `bearing`:

```ts
  /** Normalised 0..1 within the battleground's playable bounding box. */
  readonly position: { readonly x: number; readonly y: number }
```

and add `position: spec.position,` to the object returned by `camp()`.

- [ ] **Step 5: Write the validation**

In `packages/maps/src/schema.ts`, inside `validateCamp`, after the bearing check:

```ts
  const { x, y } = camp.position
  if (!inUnit(x) || !inUnit(y)) {
    issues.push({ where, problem: 'position must be within the unit box, 0 to 1' })
  } else {
    // A half-plane test, not a derived-bearing equality: the point is to catch a
    // transposed or mistyped pair, not to relitigate whether a camp near the middle is
    // `n` or `ne`. An axis the bearing does not name is unconstrained.
    const b = camp.bearing
    const wrong =
      (b.includes('n') && y > 0.5) ||
      (b.includes('s') && y < 0.5) ||
      (b.includes('w') && x > 0.5) ||
      (b.includes('e') && x < 0.5)
    if (wrong) {
      issues.push({ where, problem: `bearing ${b} contradicts position ${x}, ${y}` })
    }
  }
```

and beside the existing `positive` / `nonNegative` helpers at the top of the file:

```ts
const inUnit = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1
```

- [ ] **Step 6: Give Cursed Hollow real coordinates**

Open the reference image with the camps already marked — `Cursed Hollow map areas of interest.png` from the wiki, or `https://static.icy-veins.com/images/heroes/maps/cursed-hollow-camps-small.jpg` — read each of the six camp marker centres, and convert to the frame of the **cropped** image committed in Task 3. Then edit `packages/maps/src/battlegrounds/cursed-hollow.ts` so each `camp({...})` carries its `position`.

Sanity-check every value against the label before moving on: `siege-nw` must have `x < 0.5` and `y < 0.5`; `golem-sw` must have `x < 0.5` and `y > 0.5`. The validation in Step 5 enforces exactly this, so a failure here is a misread coordinate, not a bad rule.

- [ ] **Step 7: Make the other fourteen maps compile**

TypeScript now requires `position` on every camp. Give the remaining fourteen battlegrounds a **temporary** placeholder derived from their bearing, so the tree compiles while Task 6 does the real reading:

```ts
// Temporary. Task 6 replaces these with coordinates read off the reference images.
position: { x: 0.5, y: 0.5 },
```

Use `{ x: 0.5, y: 0.5 }` — `c`-like and exempt from the bearing check, so it will not produce a false green. **Task 6 is not optional**; a camp left at the centre stacks every dot in one place.

- [ ] **Step 8: Run the tests**

Run: `pnpm test`
Expected: PASS. The whole-battleground `validates` loop now exercises the new checks against Cursed Hollow's real values.

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/map-types.ts packages/maps/src packages/maps/test/schema.test.ts
git commit -m "Give a camp a position, and make its bearing check it"
```

---

### Task 5: Declare the images, and keep camps separately tappable

**Files:**
- Create: `packages/maps/src/map-images.ts`
- Modify: `packages/maps/src/index.ts`
- Modify: `packages/maps/src/schema.ts`
- Test: `packages/maps/test/schema.test.ts`

**Interfaces:**
- Produces: `MapImage { src: string; width: number; height: number }`, `mapImages: Readonly<Record<string, MapImage>>`, and `validateMapImage(map: MapDefinition, image: MapImage): ValidationIssue[]`. Tasks 7 and 8 consume `mapImages`.

- [ ] **Step 1: Write the failing test**

```ts
describe('map images', () => {
  // Same scoping caveat as the positions block: `bad()` at line 108 lives inside another
  // `describe` and is not reachable here.
  const bad = (over: Partial<MapDefinition>): MapDefinition => ({ ...battlegrounds[0]!, ...over })

  it('declares dimensions matching the file actually committed', async () => {
    const { statSync } = await import('node:fs')
    for (const [id, image] of Object.entries(mapImages)) {
      const path = new URL(`../../../apps/web/public${image.src}`, import.meta.url)
      expect({ id, exists: statSync(path).isFile() }).toEqual({ id, exists: true })
      expect({ id, ok: image.width > 0 && image.height > 0 }).toEqual({ id, ok: true })
    }
  })

  it('keeps every pair of camps separately tappable', () => {
    for (const map of battlegrounds) {
      const image = mapImages[map.id]
      if (image === undefined) continue
      expect({ map: map.id, issues: validateMapImage(map, image) }).toEqual({ map: map.id, issues: [] })
    }
  })

  it('rejects two camps closer than a thumb', () => {
    const image = { src: '/maps/x.webp', width: 800, height: 600 }
    const camps = [
      camp({ id: 'a', label: 'siege nw', type: 'siege', bearing: 'nw', position: { x: 0.30, y: 0.30 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
      camp({ id: 'b', label: 'boss nw', type: 'boss', bearing: 'nw', position: { x: 0.34, y: 0.32 }, firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [60] }),
    ]
    expect(validateMapImage(bad({ camps }), image).some((i) => i.problem.includes('too close'))).toBe(true)
  })

  it('accepts a pair just far enough apart', () => {
    const image = { src: '/maps/x.webp', width: 800, height: 600 }
    const camps = [
      camp({ id: 'a', label: 'siege nw', type: 'siege', bearing: 'nw', position: { x: 0.20, y: 0.30 }, firstSpawnSeconds: 60, respawnSeconds: 180, travelSeconds: [45] }),
      camp({ id: 'b', label: 'boss nw', type: 'boss', bearing: 'nw', position: { x: 0.36, y: 0.30 }, firstSpawnSeconds: 300, respawnSeconds: 300, travelSeconds: [60] }),
    ]
    expect(validateMapImage(bad({ camps }), image).filter((i) => i.problem.includes('too close'))).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nexiliary/maps test`
Expected: FAIL — `mapImages` and `validateMapImage` are not exported.

- [ ] **Step 3: Create the image declarations**

`packages/maps/src/map-images.ts`:

```ts
/**
 * Where the battleground renders live and how big they are.
 *
 * Deliberately not on `MapDefinition`: `engine` must stay free of presentation concerns
 * so the deferred desktop companion can reuse it verbatim. Intrinsic dimensions are
 * declared so the frame can reserve the aspect ratio before the image loads, which stops
 * the panel jumping mid-match.
 *
 * A map with no entry keeps the camp rail. That is a supported outcome, not a gap: some
 * battlegrounds have no unmarked render published. See `docs/map-images.md`.
 */
export interface MapImage {
  readonly src: string
  readonly width: number
  readonly height: number
}

export const mapImages: Readonly<Record<string, MapImage>> = {
  'cursed-hollow': { src: '/maps/cursed-hollow.webp', width: 800, height: 517 },
  // …one line per map committed in Task 3, with its real cropped dimensions.
}
```

Replace the dimensions with the actual output of `sips -g pixelWidth -g pixelHeight` on each committed file. Do not guess them; Step 1's test compares against the files on disk.

- [ ] **Step 4: Write the separation check**

Append to `packages/maps/src/schema.ts`:

```ts
/**
 * Two camps must stay separately tappable.
 *
 * A 44 pt target on a 370 pt-wide panel is 0.119 of the width, so 0.13 guarantees no
 * overlap with a small margin. Measured in units of rendered *width*, since the images
 * are 1.33:1 to 1.55:1 and equal normalised distances are not equal physical ones.
 *
 * Boss and bruiser camps sharing a corner is common in this game, so some maps are
 * expected to need a marker nudged. That is the check working, not a false positive:
 * a marker is a tap target, not a survey pin.
 */
export const minCampSeparation = 0.13

export function validateMapImage(map: MapDefinition, image: MapImage): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const aspect = image.height / image.width
  for (let i = 0; i < map.camps.length; i++) {
    for (let j = i + 1; j < map.camps.length; j++) {
      const a = map.camps[i]
      const b = map.camps[j]
      if (a === undefined || b === undefined) continue
      const dx = a.position.x - b.position.x
      const dy = (a.position.y - b.position.y) * aspect
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance < minCampSeparation) {
        issues.push({
          where: map.id,
          problem: `${a.id} and ${b.id} are too close to tap apart (${distance.toFixed(3)} < ${minCampSeparation})`,
        })
      }
    }
  }
  return issues
}
```

Add `import type { MapImage } from './map-images.js'` to the file's imports.

- [ ] **Step 5: Export from the package**

In `packages/maps/src/index.ts`, beside the other re-exports:

```ts
export { mapImages } from './map-images.js'
export type { MapImage } from './map-images.js'
```

`export * from './schema.js'` already carries `validateMapImage` and `minCampSeparation`.

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @nexiliary/maps test`
Expected: PASS. If Cursed Hollow fails the separation check, nudge the offending marker in `cursed-hollow.ts` until it passes — that is the intended repair.

- [ ] **Step 7: Commit**

```bash
git add packages/maps/src/map-images.ts packages/maps/src/schema.ts packages/maps/src/index.ts packages/maps/test/schema.test.ts
git commit -m "Declare the map renders and keep two camps a thumb apart"
```

---

### Task 6: Read the remaining fourteen maps' coordinates

**Files:**
- Modify: the fourteen files in `packages/maps/src/battlegrounds/` other than `cursed-hollow.ts`

**Interfaces:**
- Consumes: `CampSpec.position` from Task 4, `validateMapImage` and `mapImages` from Task 5.
- Produces: no new exports. Removes every `{ x: 0.5, y: 0.5 }` placeholder.

- [ ] **Step 1: Confirm the placeholders are visible**

```bash
grep -rn "x: 0.5, y: 0.5" packages/maps/src/battlegrounds/
```
Expected: every camp on the fourteen maps not yet done. This list is the task.

- [ ] **Step 2: Work one map at a time**

For each battleground, in this order — `alterac-pass`, `battlefield-of-eternity`, `blackhearts-bay`, `braxis-holdout`, `dragon-shire`, `garden-of-terror`, `hanamura-temple`, `haunted-mines`, `infernal-shrines`, `sky-temple`, `tomb-of-the-spider-queen`, `towers-of-doom`, `volskaya-foundry`, `warhead-junction`:

1. Open a reference image that marks the camps. Icy Veins publishes one per map at `https://static.icy-veins.com/images/heroes/maps/<map-slug>-camps-small.jpg`; the wiki's "areas of interest" renders are the alternative where that 404s.
2. Read each camp marker's centre as a fraction of the **cropped** image committed in Task 3.
3. Match markers to the camps in the map file by bearing and by count. If a map's marker count disagrees with its camp count, stop and report it — the discrepancy is either a data error in `docs/camp-data.md` or a marker for something that is not a camp, and guessing would put a dot where no camp is.
4. Replace the placeholder.
5. Run `pnpm --filter @nexiliary/maps test` before moving to the next map.

- [ ] **Step 3: Verify no placeholder survives**

```bash
grep -rn "x: 0.5, y: 0.5" packages/maps/src/battlegrounds/ && echo "PLACEHOLDERS REMAIN" || echo "clean"
```
Expected: `clean`. A camp left at the centre stacks every dot on one point, which looks like a rendering fault rather than missing data.

- [ ] **Step 4: Run the whole suite**

Run: `pnpm test`
Expected: PASS, with the bearing cross-check and the separation check green for all fifteen.

- [ ] **Step 5: Commit**

```bash
git add packages/maps/src/battlegrounds
git commit -m "Place every camp on its battleground"
```

---

### Task 7: The map panel

**Files:**
- Create: `apps/web/src/components/map-panel.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `CampChip` from `@nexiliary/engine`, `MapImage` from `@nexiliary/maps`.
- Produces: `CampPositions`, an id-keyed `{ x, y }` lookup, and `MapPanel({ camps, image, positions, onCampTaken, onCampUp })` taking `camps: readonly CampChip[]`, `image: MapImage`, `positions: CampPositions`, and both handlers as `(campId: string) => void`. Task 8 builds the lookup and renders the panel.

There is no test step here. The web package has no DOM testing tooling and the global constraints forbid adding it; the logic worth testing — which camp, which state, which action — is already covered by Tasks 1–6. This component is chrome over data those tasks validated.

- [ ] **Step 1: Write the component**

`CampChip` carries no position, and adding one would make the engine's view type know about images. So the panel takes positions as a separate prop, keyed by camp id, assembled by Task 8 from the map definition.

```tsx
import type { CampChip } from '@nexiliary/engine'
import type { MapImage } from '@nexiliary/maps'
import { toneClass } from './chrome.js'

export interface CampPositions {
  readonly [campId: string]: { readonly x: number; readonly y: number }
}

/**
 * The battleground, with a dot per camp where the camp actually is.
 *
 * A second renderer for the same `CampChip[]` the rail consumes, never a second model:
 * `state` and `tone` are passed through untouched so the two views cannot disagree about
 * belief. What the map adds is that one tap needs no disambiguation — `offerTaken` and
 * `offerUp` are mutually exclusive by construction, so the dot performs whichever the app
 * is actually asking about.
 */
export function MapPanel({
  camps,
  image,
  positions,
  onCampTaken,
  onCampUp,
}: {
  camps: readonly CampChip[]
  image: MapImage
  positions: CampPositions
  onCampTaken: (campId: string) => void
  onCampUp: (campId: string) => void
}) {
  if (camps.length === 0) return null
  return (
    <section className="mt-4">
      <div className="label-tight mb-1.5">camps</div>
      <div className="map-frame" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
        <img className="map-ground" src={image.src} alt="" aria-hidden="true" />
        {camps.map((camp) => {
          const at = positions[camp.id]
          if (at === undefined) return null
          const action = camp.offerTaken ? onCampTaken : camp.offerUp ? onCampUp : null
          const label = camp.offerTaken
            ? `${camp.label} taken`
            : camp.offerUp
              ? `${camp.label} is up`
              : `${camp.label}, ${camp.text}`
          return (
            <button
              key={camp.id}
              type="button"
              disabled={action === null}
              onClick={action === null ? undefined : () => action(camp.id)}
              aria-label={label}
              style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
              className={`map-dot map-dot-${camp.state} ${toneClass(camp.tone)}`}
            >
              <span className="numerals">{camp.text}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Add the styles**

Append to `apps/web/src/styles.css`, near the `.camp-grid` rules so the two renderers sit together:

```css
/* ------------------------------------------------------------- map view ---- */

.map-frame {
  position: relative;
  width: 100%;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgb(150 136 224 / 0.22);
}

.map-ground {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 44px is the smallest reliable thumb target, and `minCampSeparation` in the maps
   package is derived from exactly this number. Changing one without the other puts two
   dots on top of each other. */
.map-dot {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  border-radius: 50%;
  font-weight: 700;
  font-size: 0.72rem;
  cursor: pointer;
  background: rgb(23 19 49 / 0.82);
  box-shadow: 0 0 0 2px rgb(23 19 49 / 0.75), inset 0 0 0 2px currentColor;
}

.map-dot-up {
  background: rgb(63 191 120 / 0.9);
  color: rgb(8 33 15);
  box-shadow: 0 0 0 2px rgb(23 19 49 / 0.75), 0 0 10px rgb(63 191 120 / 0.55);
}

/* Belief has decayed, so the dot must not read as an assertion. Hollow, not filled. */
.map-dot-unconfirmed {
  background: rgb(23 19 49 / 0.82);
}

.map-dot-down {
  background: rgb(90 79 158 / 0.85);
}

.map-dot-away {
  background: rgb(23 19 49 / 0.6);
  box-shadow: 0 0 0 2px rgb(23 19 49 / 0.75);
  outline: 2px dashed currentColor;
  outline-offset: -4px;
}

.map-dot:disabled {
  cursor: default;
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm --filter @nexiliary/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/map-panel.tsx apps/web/src/styles.css
git commit -m "Draw the camps where they are"
```

---

### Task 8: Wire the map in, keeping the rail as the degraded path

**Files:**
- Modify: `apps/web/src/app.tsx:41` (import) and `:248-252` (the rail slot)
- Test: `apps/web/test/match.test.ts`

**Interfaces:**
- Consumes: `MapPanel` and `CampPositions` from Task 7, `mapImages` from Task 5.
- Produces: nothing new. This is the last task.

- [ ] **Step 1: Write the failing test**

The reducer is where the self-healing tap is observable, and it is testable without a DOM. Add to `apps/web/test/match.test.ts`:

```ts
it('lets a mis-tapped camp be corrected without growing the anchor set', () => {
  // Principle 2: anchors overwrite rather than accumulate. Tapping "taken" by mistake
  // flips the offered action to "it's up", and tapping the same dot again corrects it.
  // Neither tap may leave a log entry behind.
  let state = started('cursed-hollow')
  const taken: Anchor = anchor('CampTaken', 'golem-ne#1', 300, START + 300_000)
  state = matchReducer(state, { type: 'ANCHOR_SET', key: 'CampTaken:golem-ne#1', anchor: taken })
  const afterFirst = state.anchors.size

  const up: Anchor = anchor('CampUp', 'golem-ne#1', 320, START + 320_000)
  state = matchReducer(state, { type: 'ANCHOR_SET', key: 'CampUp:golem-ne#1', anchor: up })

  // One anchor per distinct claim, and re-asserting either one overwrites rather than appends.
  state = matchReducer(state, { type: 'ANCHOR_SET', key: 'CampUp:golem-ne#1', anchor: up })
  expect(state.anchors.size).toBe(afterFirst + 1)
})
```

Read the existing `anchor()` and `started()` helpers at the top of that file; they are already defined and the snippet above uses them as written.

- [ ] **Step 2: Run test to verify it passes or fails honestly**

Run: `pnpm --filter @nexiliary/web test`
Expected: PASS. This is a characterisation test — it pins behaviour the reducer already has, so that the map's single-tap flip cannot silently regress it later. If it FAILS, stop: the self-healing tap in the spec does not hold and the design needs revisiting before the UI is wired.

- [ ] **Step 3: Wire the panel in**

In `apps/web/src/app.tsx`, extend the import at line 41 and add the maps import:

```ts
import { CampPanel, Footer, Header, ObjectivePanel, PromptBar, Rule } from './components/live-panel.js'
import { MapPanel } from './components/map-panel.js'
import type { CampPositions } from './components/map-panel.js'
import { mapImages } from '@nexiliary/maps'
```

Near the other derived values before the `return`, build the position lookup:

```ts
  const mapImage = mapImages[map.id]
  const campPositions: CampPositions = useMemo(
    () => Object.fromEntries(map.camps.map((c) => [c.id, c.position])),
    [map],
  )
```

Add `useMemo` to the existing `react` import if it is not already there.

Then replace the rail slot at lines 248-252:

```tsx
            <div className="area-rail">
              {settings.showCamps &&
                (mapImage === undefined ? (
                  <CampPanel camps={liveView.camps} onCampTaken={onCampTaken} onCampUp={onCampUp} />
                ) : (
                  <MapPanel
                    camps={liveView.camps}
                    image={mapImage}
                    positions={campPositions}
                    onCampTaken={onCampTaken}
                    onCampUp={onCampUp}
                  />
                ))}
            </div>
```

`CampPanel` is kept, not deleted. It is the path for any battleground with no unmarked render published (Task 3, Step 3), and for `fallbackMap`, whose unknown battlegrounds have no camps at all.

- [ ] **Step 4: Verify the build**

Run: `pnpm typecheck && pnpm test && pnpm --filter @nexiliary/web build`
Expected: PASS on all three.

- [ ] **Step 5: Look at it**

Run: `pnpm dev`

Start a match on Cursed Hollow and confirm, in the browser at a phone width: the map fills the rail slot without the panel jumping as the image loads; six dots sit on the six camps; tapping a green dot sends it down with a countdown; tapping it again brings it back. Then check a map that has no image, if Task 3 produced one, and confirm it still shows the rail.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app.tsx apps/web/test/match.test.ts
git commit -m "Put the map where the camp rail was"
```

---

## Notes for the executor

- **Task 6 is the long one.** Fourteen maps, roughly six camps each, each read off a reference image. It is mechanical but it is not optional, and its Step 2.3 stop condition is real: report a marker-count mismatch rather than guessing a position.
- **Do not add a dependency to `engine`.** If a task seems to need one, the task is wrong.
- **`minCampSeparation` and the 44px dot are the same number.** They live in different packages. Changing one without the other is the bug this plan is most likely to grow.
