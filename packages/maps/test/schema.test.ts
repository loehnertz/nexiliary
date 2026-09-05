import { describe, expect, it } from 'vitest'
import { cues, project } from '@nexiliary/engine'
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

  it('has a unique id', () => {
    expect(new Set(battlegrounds.map((m) => m.id)).size).toBe(battlegrounds.length)
  })

  it('never claims verified without a note', () => {
    for (const map of battlegrounds) {
      if (map.provenance === 'verified') expect((map.provenanceNote ?? '').length).toBeGreaterThan(10)
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
