import type { Anchor, MapDefinition, Seconds } from '@nexiliary/engine'
import { mmss } from '@nexiliary/engine'

/**
 * What the match actually looked like, against what the app predicted.
 *
 * This is the whole point of the `ObjectiveSpawned` tap. A cycle's recorded spawn and
 * its recorded end give the fight duration; one cycle's end and the next cycle's spawn
 * give the respawn offset. Those are the two numbers a map file guesses, and until they
 * are measured no map may be marked `verified` and nothing renders `Exact`.
 *
 * Deliberately plain text: it is pasted into a note or a commit message, not parsed.
 */
export interface LoggedCycle {
  readonly cycle: number
  readonly spawnedAt?: Seconds
  readonly endedAt?: Seconds
  /** Recorded spawn minus recorded end of the previous cycle. */
  readonly offsetSeconds?: Seconds
  /** Recorded end minus recorded spawn of the same cycle. */
  readonly fightSeconds?: Seconds
}

function cyclesFrom(anchors: readonly Anchor[]): LoggedCycle[] {
  const spawned = new Map<number, Seconds>()
  const ended = new Map<number, Seconds>()
  for (const a of anchors) {
    const cycle = Number(a.subject)
    if (!Number.isFinite(cycle)) continue
    if (a.type === 'ObjectiveSpawned') spawned.set(cycle, a.gameTimeSeconds)
    if (a.type === 'ObjectiveEnded') ended.set(cycle, a.gameTimeSeconds)
  }

  const indices = [...new Set([...spawned.keys(), ...ended.keys()])].sort((a, b) => a - b)
  return indices.map((cycle) => {
    const spawnedAt = spawned.get(cycle)
    const endedAt = ended.get(cycle)
    const previousEnd = ended.get(cycle - 1)
    return {
      cycle,
      ...(spawnedAt !== undefined ? { spawnedAt } : {}),
      ...(endedAt !== undefined ? { endedAt } : {}),
      ...(spawnedAt !== undefined && previousEnd !== undefined
        ? { offsetSeconds: Math.round(spawnedAt - previousEnd) }
        : {}),
      ...(spawnedAt !== undefined && endedAt !== undefined
        ? { fightSeconds: Math.round(endedAt - spawnedAt) }
        : {}),
    }
  })
}

export function buildMatchLog(map: MapDefinition, anchors: readonly Anchor[], now: Seconds): string {
  const lines: string[] = []
  lines.push(`${map.name} (${map.id}) — provenance ${map.provenance}`)
  lines.push(`match length ${mmss(now)}`)

  if (map.objective.kind === 'timed') {
    const o = map.objective
    lines.push(
      `authored: first spawn ${mmss(o.firstSpawnSeconds)}, ` +
        `fight ${o.fight.medianSeconds}s ±${o.fight.spreadSeconds}s`,
    )
  }
  lines.push('')

  const cycles = cyclesFrom(anchors)
  if (cycles.length === 0) {
    lines.push('No objective anchors recorded.')
  } else {
    lines.push('cycle  spawned  ended    fight   offset from previous end')
    for (const c of cycles) {
      lines.push(
        [
          String(c.cycle).padEnd(6),
          (c.spawnedAt === undefined ? '—' : mmss(c.spawnedAt)).padEnd(8),
          (c.endedAt === undefined ? '—' : mmss(c.endedAt)).padEnd(8),
          (c.fightSeconds === undefined ? '—' : `${c.fightSeconds}s`).padEnd(7),
          c.offsetSeconds === undefined ? '—' : `${c.offsetSeconds}s`,
        ].join(' '),
      )
    }
  }

  const camps = anchors
    .filter((a) => a.type === 'CampTaken' || a.type === 'CampUp')
    .sort((a, b) => a.gameTimeSeconds - b.gameTimeSeconds)
  if (camps.length > 0) {
    lines.push('')
    lines.push('camps')
    for (const a of camps) {
      lines.push(`  ${mmss(a.gameTimeSeconds)}  ${a.type === 'CampTaken' ? 'taken' : 'up'}  ${a.subject}`)
    }
  }

  lines.push('')
  lines.push('A map may be promoted to `verified` once its fight and offset columns agree')
  lines.push('across a handful of matches. Until then nothing on it renders as exact.')
  return lines.join('\n')
}
