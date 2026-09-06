import type { Bearing, CampDefinition, CueText, MapDefinition } from '@nexiliary/engine'
import type { MapImage } from './map-images.js'

/**
 * Maps are data, not code. This validates more than shape, because the failures that
 * matter are semantic: a missing field silently disables a cue in play, so it fails
 * the build instead.
 */
export interface ValidationIssue {
  readonly where: string
  readonly problem: string
}

const positive = (n: number) => Number.isFinite(n) && n > 0
const nonNegative = (n: number) => Number.isFinite(n) && n >= 0
const inUnit = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1

function validateCamp(mapId: string, camp: CampDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const where = `${mapId}/${camp.id}`
  if (camp.id.trim() === '') issues.push({ where, problem: 'camp id is empty' })
  if (camp.label.trim() === '') issues.push({ where, problem: 'camp label is empty' })
  const bearings: Bearing[] = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se']
  if (!bearings.includes(camp.bearing)) issues.push({ where, problem: `unknown bearing ${camp.bearing}` })
  const { x, y } = camp.position
  if (!inUnit(x) || !inUnit(y)) {
    issues.push({ where, problem: 'position must be within the unit box, 0 to 1' })
  } else {
    // A half-plane test, not a derived-bearing equality: the point is to catch a
    // transposed or mistyped pair, not to relitigate whether a camp near the middle is
    // `n` or `ne`. An axis the bearing does not name is left unconstrained.
    const b = camp.bearing
    if (
      (b.includes('n') && y > 0.5) ||
      (b.includes('s') && y < 0.5) ||
      (b.includes('w') && x > 0.5) ||
      (b.includes('e') && x < 0.5)
    ) {
      issues.push({ where, problem: `bearing ${b} contradicts position ${x}, ${y}` })
    }
  }
  if (!nonNegative(camp.firstSpawnSeconds)) issues.push({ where, problem: 'firstSpawnSeconds must be >= 0' })
  if (!positive(camp.respawnSeconds)) issues.push({ where, problem: 'respawnSeconds must be > 0' })
  if (!positive(camp.decaySeconds)) issues.push({ where, problem: 'decaySeconds must be > 0' })
  if (!positive(camp.staleSeconds)) issues.push({ where, problem: 'staleSeconds must be > 0' })
  if (camp.staleSeconds <= camp.decaySeconds) {
    issues.push({ where, problem: 'staleSeconds must exceed decaySeconds' })
  }
  if (!positive(camp.clearSeconds)) issues.push({ where, problem: 'clearSeconds must be > 0' })
  if (!nonNegative(camp.approachSeconds)) issues.push({ where, problem: 'approachSeconds must be >= 0' })
  // `stall-camp` reads both by cycle. An empty table would make it silently late.
  if (camp.travelSeconds.length === 0) issues.push({ where, problem: 'travelSeconds is empty' })
  if (camp.pressureValue.length === 0) issues.push({ where, problem: 'pressureValue is empty' })
  // A boss standing untaken for a whole match is normal, so its staleSeconds has to
  // exceed the typical remaining match length after it first spawns, or boss
  // availability goes Stale in the last third of every game.
  if (camp.type === 'boss' && camp.staleSeconds < 900) {
    issues.push({ where, problem: 'a boss needs staleSeconds >= 900, or its timer dies late in every match' })
  }
  return issues
}

export function validateMap(map: MapDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const where = map.id

  if (map.id.trim() === '') issues.push({ where, problem: 'map id is empty' })
  if (map.name.trim() === '') issues.push({ where, problem: 'map name is empty' })
  // `verified` is what unlocks the exact display path, exact spoken wording and any
  // cue requiring an exact objective, so it needs evidence rather than optimism.
  if (map.provenance === 'verified' && (map.provenanceNote ?? '').trim() === '') {
    issues.push({ where, problem: 'verified requires a corpus reference or a hand-timing note' })
  }

  if (map.objective.kind === 'none') {
    if (map.campsSuppressedDuringObjective === true) {
      // Suppression is derived from the objective chain's spawn and resolution band.
      // With no chain there is nothing to derive it from, so setting the flag would
      // ask the app to assert a window it cannot compute.
      issues.push({
        where,
        problem: 'campsSuppressedDuringObjective needs an objective chain to derive its window from',
      })
    }
  } else {
    const o = map.objective
    if (o.label.trim() === '') issues.push({ where, problem: 'objective label is empty' })
    // A generic "<objective> ended" invites the tap at the wrong stage: most objectives
    // resolve twice and the respawn keys off the second, so the button has to name the
    // event rather than the objective.
    if (o.endedLabel.trim() === '') issues.push({ where, problem: 'endedLabel is empty' })
    if (o.endedLabel.trim().toLowerCase() === `${o.label.trim().toLowerCase()} ended`) {
      issues.push({ where, problem: 'endedLabel must name the event the respawn runs from' })
    }
    if (!nonNegative(o.firstSpawnSeconds)) issues.push({ where, problem: 'firstSpawnSeconds must be >= 0' })
    if (!positive(o.fight.medianSeconds)) issues.push({ where, problem: 'fight.medianSeconds must be > 0' })
    if (!nonNegative(o.fight.spreadSeconds)) issues.push({ where, problem: 'fight.spreadSeconds must be >= 0' })

    const rule = o.respawn
    {
      const names = Object.keys(rule.outcomes)
      if (names.length === 0) issues.push({ where, problem: 'afterResolution needs at least one outcome' })
      for (const [name, outcome] of Object.entries(rule.outcomes)) {
        // Two resolutions need two buttons, and a button needs words.
        if (outcome.label.trim() === '') issues.push({ where: `${where}/${name}`, problem: 'outcome label is empty' })
        if (!positive(outcome.minSeconds)) issues.push({ where: `${where}/${name}`, problem: 'minSeconds must be > 0' })
        if (!positive(outcome.maxSeconds)) issues.push({ where: `${where}/${name}`, problem: 'maxSeconds must be > 0' })
        if (outcome.maxSeconds < outcome.minSeconds) {
          issues.push({ where: `${where}/${name}`, problem: 'maxSeconds is below minSeconds' })
        }
        if (outcome.possibleFromCycle !== undefined && outcome.possibleFromCycle < 1) {
          issues.push({ where: `${where}/${name}`, problem: 'possibleFromCycle is 1-based' })
        }
      }
      // At least one branch has to be reachable from the first cycle, or the union is
      // empty exactly when the app needs it most.
      const labels = new Set(Object.values(rule.outcomes).map((o2) => o2.label))
      if (labels.size !== names.length) issues.push({ where, problem: 'two outcomes share a label' })
      const fromFirst = Object.values(rule.outcomes).some((o2) => (o2.possibleFromCycle ?? 1) <= 1)
      if (names.length > 0 && !fromFirst) {
        issues.push({ where, problem: 'no outcome is reachable at cycle 1' })
      }
      if (rule.scalePerMinuteSeconds !== undefined && rule.minOffsetSeconds === undefined) {
        // Without a floor, a per-minute reduction reaches zero and then goes negative,
        // and matches do run long.
        issues.push({ where, problem: 'scalePerMinuteSeconds requires minOffsetSeconds as a floor' })
      }
    }
  }

  const seen = new Set<string>()
  const labels = new Set<string>()
  for (const camp of map.camps) {
    if (seen.has(camp.id)) issues.push({ where, problem: `duplicate camp id ${camp.id}` })
    seen.add(camp.id)
    // Two chips reading "boss" on the same rail is not a control, it is a coin flip.
    // The player is tapping these without looking, mid-game.
    if (labels.has(camp.label)) {
      issues.push({ where, problem: `two camps labelled "${camp.label}" cannot be told apart on the rail` })
    }
    labels.add(camp.label)
    issues.push(...validateCamp(map.id, camp))
  }

  return issues
}

/** Cross-references cue text against the registered cues. */
export function validateCueText(
  text: Readonly<Record<string, CueText>>,
  cueIds: readonly string[],
  declaredThresholds: Readonly<Record<string, readonly string[]>>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const [id, entry] of Object.entries(text)) {
    if (id !== entry.id) issues.push({ where: id, problem: `key does not match id ${entry.id}` })
    if (!cueIds.includes(id)) issues.push({ where: id, problem: 'no cue is registered under this id' })
    if (entry.display.trim() === '') issues.push({ where: id, problem: 'display is empty' })
    if (entry.spoken.trim() === '') issues.push({ where: id, problem: 'spoken is empty' })
    // Reading thresholds by string key inside arbitrary TypeScript would leave this as
    // a note someone has to remember. The declaration is what makes it checkable.
    for (const key of declaredThresholds[id] ?? []) {
      if (!(key in entry.thresholds)) {
        issues.push({ where: id, problem: `declared threshold "${key}" has no value` })
      }
    }
  }
  for (const id of cueIds) {
    if (!(id in text)) issues.push({ where: id, problem: 'registered cue has no CueText entry' })
  }
  return issues
}

/**
 * Two camps must stay separately tappable.
 *
 * A 44 pt target on a 370 pt-wide panel is 0.119 of the width, so 0.13 guarantees no
 * overlap with a small margin. Measured in units of rendered *width*, because the renders
 * run 1.2:1 to 2.3:1 and equal normalised distances are not equal physical ones.
 *
 * A boss and a bruiser sharing a corner is common in this game, so some maps need a
 * marker nudged apart. That is the check working rather than a false positive: the
 * position is a tap target, not a survey pin.
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

/** `appliesTo` is a sanctioned escape hatch, kept under budget so it is not a fork. */
export const appliesToBudget = 2
