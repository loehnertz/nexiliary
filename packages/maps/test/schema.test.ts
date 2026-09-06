import { describe, expect, it } from 'vitest'
import { cues, project, view, walkChain } from '@nexiliary/engine'
import type { MapDefinition } from '@nexiliary/engine'
import { appliesToBudget, battlegrounds, camp, cueText, fallbackMap, mapById, mapImages, validateCueText, validateMap, validateMapImage } from '../src/index.js'
import type { MapImage } from '../src/index.js'

describe('every battleground', () => {
  it('validates', () => {
    for (const map of battlegrounds) {
      expect({ map: map.id, issues: validateMap(map) }).toEqual({ map: map.id, issues: [] })
    }
  })

  it('projects without throwing across a whole match', () => {
    for (const map of [...battlegrounds, fallbackMap]) {
      for (let now = 0; now <= 2400; now += 5) {
        const t = project(map, new Map(), now)
        expect(t.validUntil).toBeGreaterThan(now)
      }
    }
  })

  it('covers all fifteen battlegrounds in rotation', () => {
    expect(battlegrounds).toHaveLength(15)
  })

  it('chains every objective off a resolution, with no unused variant carried', () => {
    // `architecture.md` has a `fixedInterval` variant for Blackheart's Bay. The wiki says
    // twice that its chests spawn three minutes after the final chest of the previous
    // event is captured, which is the same shape as every other map — so the variant had
    // no users and was removed rather than kept speculatively.
    const timed = battlegrounds.filter((m) => m.objective.kind === 'timed')
    expect(timed).toHaveLength(14)
    expect(battlegrounds.filter((m) => m.objective.kind === 'none')).toHaveLength(1)

    // Three maps have a ranged offset and therefore never collapse to Exact after an
    // anchor; two of those carry a second outcome gated by `possibleFromCycle`.
    const ranged = timed.filter(
      (m) =>
        m.objective.kind === 'timed' &&
        Object.values(m.objective.respawn.outcomes).some((o) => o.maxSeconds !== o.minSeconds),
    )
    expect(ranged.map((m) => m.id).sort()).toEqual(['alterac-pass', 'cursed-hollow', 'garden-of-terror'])

    const gated = timed.filter(
      (m) =>
        m.objective.kind === 'timed' &&
        Object.values(m.objective.respawn.outcomes).some((o) => o.possibleFromCycle !== undefined),
    )
    expect(gated.map((m) => m.id).sort()).toEqual(['cursed-hollow', 'garden-of-terror'])

    // And exactly one map scales its offset with game time.
    const scaled = timed.filter(
      (m) => m.objective.kind === 'timed' && m.objective.respawn.scalePerMinuteSeconds !== undefined,
    )
    expect(scaled.map((m) => m.id)).toEqual(['alterac-pass'])
  })

  it('renders exact only where two sources agree', () => {
    // Corroboration is the bar, not who did the measuring. The two hold-outs are the two
    // where the sources genuinely do not agree or do not exist.
    const published = battlegrounds.filter((m) => m.provenance !== 'verified').map((m) => m.id)
    expect(published.sort()).toEqual(['haunted-mines', 'warhead-junction'])
    for (const map of battlegrounds) {
      if (map.provenance !== 'verified') continue
      expect((map.provenanceNote ?? '').length, map.id).toBeGreaterThan(30)
    }
  })

  it('has a unique id', () => {
    expect(new Set(battlegrounds.map((m) => m.id)).size).toBe(battlegrounds.length)
  })

  it('never claims verified without a note', () => {
    for (const map of battlegrounds) {
      if (map.provenance === 'verified') expect((map.provenanceNote ?? '').length).toBeGreaterThan(10)
    }
  })
})

describe('camp chips read the way the map does', () => {
  const rank: Record<string, number> = { nw: 0, w: 1, sw: 2, n: 3, c: 4, s: 5, ne: 6, e: 7, se: 8 }

  it('lays every camp out west to east', () => {
    for (const map of battlegrounds) {
      if (map.camps.length < 2) continue
      const order = view(project(map, new Map(), 400), map, 400).camps.map((c) => c.id)
      const bearingOf = (id: string) => map.camps.find((c) => c.id === id)!.bearing
      for (let i = 1; i < order.length; i += 1) {
        expect(
          rank[bearingOf(order[i - 1]!)]!,
          `${map.id}: ${order[i - 1]} before ${order[i]}`,
        ).toBeLessThanOrEqual(rank[bearingOf(order[i]!)]!)
      }
    }
  })

  it('shows all of them, on every battleground', () => {
    // Camp state is the thing a player cannot track in their head, and the tap that
    // happens most often. None of it belongs behind a menu.
    for (const map of battlegrounds) {
      const shown = view(project(map, new Map(), 400), map, 400).camps
      expect(shown.length, map.id).toBe(map.camps.length)
    }
  })
})

describe('the schema', () => {
  const bad = (over: Partial<MapDefinition>): MapDefinition => ({ ...battlegrounds[0]!, ...over })

  it('rejects campsSuppressedDuringObjective on a map with no objective chain', () => {
    const issues = validateMap(bad({ objective: { kind: 'none' }, campsSuppressedDuringObjective: true }))
    expect(issues.some((i) => i.problem.includes('objective chain'))).toBe(true)
  })

  it('rejects a scaled offset with no floor', () => {
    const issues = validateMap(
      bad({
        objective: {
          kind: 'timed',
          label: 'x',
          firstSpawnSeconds: 180,
          fight: { medianSeconds: 60, spreadSeconds: 20 },
          endedLabel: 'x done',
          respawn: { kind: 'afterResolution', scalePerMinuteSeconds: 2, outcomes: { a: { label: 'x', minSeconds: 110, maxSeconds: 150 } } },
        },
      }),
    )
    expect(issues.some((i) => i.problem.includes('minOffsetSeconds'))).toBe(true)
  })

  it('rejects an outcome set with nothing reachable at cycle 1', () => {
    const issues = validateMap(
      bad({
        objective: {
          kind: 'timed',
          label: 'x',
          firstSpawnSeconds: 180,
          fight: { medianSeconds: 60, spreadSeconds: 20 },
          endedLabel: 'x done',
          respawn: { kind: 'afterResolution', outcomes: { a: { label: 'x', minSeconds: 50, maxSeconds: 90, possibleFromCycle: 3 } } },
        },
      }),
    )
    expect(issues.some((i) => i.problem.includes('reachable at cycle 1'))).toBe(true)
  })

  it('rejects a boss whose staleSeconds would kill its timer late in a match', () => {
    const camps = battlegrounds[0]!.camps.map((c) => (c.type === 'boss' ? { ...c, staleSeconds: 600 } : c))
    expect(validateMap(bad({ camps })).some((i) => i.problem.includes('staleSeconds >= 900'))).toBe(true)
  })

  it('falls back for an unrecognised map id', () => {
    const m = mapById('some-new-aram-map')
    expect(m.provenance).toBe('unknown')
    expect(m.objective.kind).toBe('none')
  })
})

describe('cue text', () => {
  it('cross-references the registered cues and their declared thresholds', () => {
    const declared = Object.fromEntries(cues.map((c) => [c.id, c.thresholds]))
    expect(validateCueText(cueText, cues.map((c) => c.id), declared)).toEqual([])
  })

  it('keeps appliesTo under budget, so it does not become the fork it prevents', () => {
    expect(cues.filter((c) => c.appliesTo !== undefined).length).toBeLessThanOrEqual(appliesToBudget)
  })

  it('phrases every prompt as a condition rather than an assertion', () => {
    // A crude guard, but it catches the failure mode that removed two cues from the
    // starting set. `wave-soak` fired on "an unattended lane" and `camp-pressure` on
    // "pushing is safe", which are hero positions and enemy locations: exactly what the
    // app is forbidden to know. Both survive rephrased, so the test is not that the
    // words are absent but that the player, not the app, evaluates them.
    const claimsWorldState = /\b(they are down|nobody is|enemy is|is alive|is dead|is safe|unattended)\b/i
    for (const entry of Object.values(cueText)) {
      for (const sentence of `${entry.display} ${entry.spoken}`.split(/(?<=[.!?])\s+/)) {
        if (!claimsWorldState.test(sentence)) continue
        expect(sentence, 'states world state without a condition').toMatch(/\bif\b/i)
      }
    }
  })
})

describe('degradation matches the documented per-map behaviour', () => {
  /** The projected cycle index at which the chain first reports `Unknown`. */
  function cyclesFromAnchor(mapId: string, anchorAt: number): number | null {
    const map = battlegrounds.find((m) => m.id === mapId)!
    const anchors = new Map([
      [
        'ObjectiveEnded:1',
        { type: 'ObjectiveEnded', subject: '1', gameTimeSeconds: anchorAt, wallClock: 0, source: 'test', schema: 1 },
      ],
    ])
    for (let now = anchorAt; now < 4000; now += 2) {
      const walk = walkChain(map, anchors, now)
      if (walk !== null && walk.pending.confidence.kind === 'Unknown') return walk.pending.n
    }
    return null
  }

  it('does not lose the thread on a near-deterministic map within a match', () => {
    // Sky Temple's phase duration and offset are both deterministic, so only
    // `minStepSpread` widens it. Staying Estimated for a whole match is the honest
    // answer for a cadence that genuinely is near-deterministic.
    //
    // `architecture.md` says this map "never reaches Unknown at all". It does, at cycle
    // 13 — about thirty-five minutes after the last anchor, which is past the end of any
    // real match. The product claim holds; the absolute one does not.
    const map = battlegrounds.find((m) => m.id === 'sky-temple')!
    const anchors = new Map([
      [
        'ObjectiveEnded:1',
        { type: 'ObjectiveEnded', subject: '1', gameTimeSeconds: 300, wallClock: 0, source: 'test', schema: 1 },
      ],
    ])
    for (let now = 300; now <= 1800; now += 5) {
      expect(walkChain(map, anchors, now)!.pending.confidence.kind).not.toBe('Unknown')
    }
    expect(cyclesFromAnchor('sky-temple', 300)).toBe(13)
  })

  it('degrades soonest on the map with a fast cadence and a wide union', () => {
    // Cursed Hollow is the worst case on both counts at once: past cycle 3 its union
    // offset is 0:50 to 2:40, which alone is a 110 second band.
    const cursed = cyclesFromAnchor('cursed-hollow', 300)
    expect(cursed).not.toBeNull()
    expect(cursed!).toBeLessThanOrEqual(3)
  })

  it('sits between the two on a scalar-offset map with a real fight', () => {
    const braxis = cyclesFromAnchor('braxis-holdout', 300)
    expect(braxis).not.toBeNull()
    expect(braxis!).toBeGreaterThan(cyclesFromAnchor('cursed-hollow', 300)!)
  })
})

describe('camp positions', () => {
  // `bad()` above is scoped to another describe block, so this one needs its own.
  const bad = (over: Partial<MapDefinition>): MapDefinition => ({ ...battlegrounds[0]!, ...over })
  const spec = (over: Partial<Parameters<typeof camp>[0]>) =>
    camp({
      id: 'a',
      label: 'siege nw',
      type: 'siege',
      bearing: 'nw',
      position: { x: 0.3, y: 0.3 },
      firstSpawnSeconds: 60,
      respawnSeconds: 180,
      travelSeconds: [45],
      ...over,
    })

  it('rejects a position outside the unit box', () => {
    const issues = validateMap(bad({ camps: [spec({ position: { x: -0.1, y: 0.2 } })] }))
    expect(issues.some((i) => i.problem.includes('unit box'))).toBe(true)
  })

  it('rejects a bearing that contradicts its position', () => {
    // Declared north-west, sitting south-east: the transposed pair is the likely error
    // across seventy-odd hand-read coordinates.
    const issues = validateMap(bad({ camps: [spec({ position: { x: 0.8, y: 0.9 } })] }))
    expect(issues.some((i) => i.problem.includes('bearing nw'))).toBe(true)
  })

  it('constrains only the axes the bearing names', () => {
    // `n` says nothing about east or west, so any x is legal.
    const issues = validateMap(bad({ camps: [spec({ bearing: 'n', position: { x: 0.92, y: 0.2 } })] }))
    expect(issues.filter((i) => i.problem.includes('bearing'))).toEqual([])
  })

  it('exempts a central camp', () => {
    const issues = validateMap(bad({ camps: [spec({ bearing: 'c', position: { x: 0.05, y: 0.95 } })] }))
    expect(issues.filter((i) => i.problem.includes('bearing'))).toEqual([])
  })
})

describe('map images', () => {
  const bad = (over: Partial<MapDefinition>): MapDefinition => ({ ...battlegrounds[0]!, ...over })
  const image: MapImage = { src: '/maps/x.webp', width: 800, height: 600 }
  const at = (id: string, x: number, y: number) =>
    camp({
      id,
      label: id,
      type: 'siege',
      bearing: 'nw',
      position: { x, y },
      firstSpawnSeconds: 60,
      respawnSeconds: 180,
      travelSeconds: [45],
    })

  it('declares an image matching the file actually committed', async () => {
    const { statSync } = await import('node:fs')
    for (const [id, img] of Object.entries(mapImages)) {
      const path = new URL(`../../../apps/web/public${img.src}`, import.meta.url)
      expect({ id, exists: statSync(path).isFile() }).toEqual({ id, exists: true })
    }
  })

  // Blackheart's Bay is the one battleground with no image, and deliberately so. The wiki
  // records four Skeletal Pirate camps where the map file carries two `doubloon` entries,
  // so a dot would have to sit between two real camps and point at neither. The rail can
  // say "doubloons n" without claiming a location; a dot on a map cannot.
  const railOnly = ['blackhearts-bay']

  it('covers every battleground except the one that cannot be drawn honestly', () => {
    for (const map of battlegrounds) {
      expect({ map: map.id, hasImage: mapImages[map.id] !== undefined }).toEqual({
        map: map.id,
        hasImage: !railOnly.includes(map.id),
      })
    }
  })

  it('keeps every mapped battleground separately tappable', () => {
    for (const map of battlegrounds) {
      const img = mapImages[map.id]
      if (img === undefined) continue
      expect({ map: map.id, issues: validateMapImage(map, img) }).toEqual({ map: map.id, issues: [] })
    }
  })

  it('places every camp on a mapped battleground away from the centre placeholder', () => {
    // A camp left at 0.5, 0.5 passes the bearing check but stacks every dot on one point,
    // which reads as a rendering fault rather than as missing data.
    for (const map of battlegrounds) {
      if (mapImages[map.id] === undefined) continue
      const stuck = map.camps.filter((c) => c.position.x === 0.5 && c.position.y === 0.5)
      expect({ map: map.id, stuck: stuck.map((c) => c.id) }).toEqual({ map: map.id, stuck: [] })
    }
  })

  it('rejects two camps closer than a thumb', () => {
    const map = bad({ camps: [at('a', 0.3, 0.3), at('b', 0.34, 0.32)] })
    expect(validateMapImage(map, image).some((i) => i.problem.includes('too close'))).toBe(true)
  })

  it('accepts a pair just far enough apart', () => {
    const map = bad({ camps: [at('a', 0.2, 0.3), at('b', 0.36, 0.3)] })
    expect(validateMapImage(map, image).filter((i) => i.problem.includes('too close'))).toEqual([])
  })

  it('keeps Cursed Hollow separately tappable, boss beside bruiser included', () => {
    // The one map with real coordinates so far. Its boss and knight camps share the
    // north-east and south-west corners and needed nudging apart to clear the threshold.
    const map = battlegrounds.find((m) => m.id === 'cursed-hollow')!
    expect(validateMapImage(map, mapImages['cursed-hollow']!)).toEqual([])
  })
})

describe('camp labels', () => {
  it('spells directions out, because a voice reads "ne" as letters', () => {
    // The label is what `{camp}` substitutes into the spoken prompt, so an abbreviation
    // here comes out of the speaker as nonsense rather than as a direction.
    const abbreviated = /(^|\s)(n|s|e|w|ne|nw|se|sw|c|mid)(\s|$)/i
    for (const map of battlegrounds) {
      for (const camp of map.camps) {
        expect({ camp: camp.id, label: camp.label, abbreviated: abbreviated.test(camp.label) }).toEqual({
          camp: camp.id,
          label: camp.label,
          abbreviated: false,
        })
      }
    }
  })

  it('capitalises every camp label', () => {
    for (const map of battlegrounds) {
      for (const camp of map.camps) {
        const first = camp.label[0] ?? ''
        expect({ camp: camp.id, capitalised: first === first.toUpperCase() && first !== '' }).toEqual({
          camp: camp.id,
          capitalised: true,
        })
      }
    }
  })
})
