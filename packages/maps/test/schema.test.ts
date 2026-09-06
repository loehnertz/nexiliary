import { describe, expect, it } from 'vitest'
import { cues, project, view, walkChain } from '@nexiliary/engine'
import type { MapDefinition } from '@nexiliary/engine'
import { appliesToBudget, battlegrounds, cueText, fallbackMap, mapById, validateCueText, validateMap } from '../src/index.js'

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

  it('exercises every RespawnRule variant, so no variant is dead code', () => {
    const timed = battlegrounds.filter((m) => m.objective.kind === 'timed')
    const kinds = timed.map((m) => (m.objective.kind === 'timed' ? m.objective.respawn.kind : ''))
    expect(kinds.filter((k) => k === 'fixedInterval')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'afterResolution')).toHaveLength(13)
    expect(battlegrounds.filter((m) => m.objective.kind === 'none')).toHaveLength(1)

    // Three maps have a ranged offset and therefore never collapse to Exact after an
    // anchor; two of those carry a second outcome gated by `possibleFromCycle`.
    const ranged = timed.filter(
      (m) =>
        m.objective.kind === 'timed' &&
        m.objective.respawn.kind === 'afterResolution' &&
        Object.values(m.objective.respawn.outcomes).some((o) => o.maxSeconds !== o.minSeconds),
    )
    expect(ranged.map((m) => m.id).sort()).toEqual(['alterac-pass', 'cursed-hollow', 'garden-of-terror'])

    const gated = timed.filter(
      (m) =>
        m.objective.kind === 'timed' &&
        m.objective.respawn.kind === 'afterResolution' &&
        Object.values(m.objective.respawn.outcomes).some((o) => o.possibleFromCycle !== undefined),
    )
    expect(gated.map((m) => m.id).sort()).toEqual(['cursed-hollow', 'garden-of-terror'])

    // And exactly one map scales its offset with game time.
    const scaled = timed.filter(
      (m) =>
        m.objective.kind === 'timed' &&
        m.objective.respawn.kind === 'afterResolution' &&
        m.objective.respawn.scalePerMinuteSeconds !== undefined,
    )
    expect(scaled.map((m) => m.id)).toEqual(['alterac-pass'])
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
          respawn: { kind: 'afterResolution', scalePerMinuteSeconds: 2, outcomes: { a: { minSeconds: 110, maxSeconds: 150 } } },
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
          respawn: { kind: 'afterResolution', outcomes: { a: { minSeconds: 50, maxSeconds: 90, possibleFromCycle: 3 } } },
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
