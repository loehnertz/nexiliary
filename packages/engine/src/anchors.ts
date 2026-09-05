import type { Anchor, AnchorSet, AnchorType, Seconds } from './types.js'

export function anchorKey(type: AnchorType | (string & {}), subject: string): string {
  return `${type}:${subject}`
}

export function campSubject(campId: string, occurrence: number): string {
  return `${campId}:${occurrence}`
}

/**
 * The occurrence index is derived from the anchor set, never from the projection's
 * belief about the current cycle. That belief comes from the same widening bands, so
 * when bands overlap the projection does not know which cycle is in progress either;
 * baking it into a persistent key and broadcasting it would let two clients write two
 * inconsistent statements about one occurrence.
 *
 * Counting entries is monotone, independent of band arithmetic and converges across
 * peers through the state sync on join.
 */
export function nextObjectiveCycle(anchors: AnchorSet): number {
  return objectiveEndedAnchors(anchors).length + 1
}

export function nextCampOccurrence(anchors: AnchorSet, type: string, campId: string): number {
  let count = 0
  for (const key of anchors.keys()) {
    if (key.startsWith(`${type}:${campId}:`)) count += 1
  }
  return count + 1
}

export function objectiveSpawnedAnchors(anchors: AnchorSet): Anchor[] {
  const out: Anchor[] = []
  for (const [key, anchor] of anchors) {
    if (key.startsWith('ObjectiveSpawned:')) out.push(anchor)
  }
  return out.sort((a, b) => a.gameTimeSeconds - b.gameTimeSeconds)
}

export function objectiveEndedAnchors(anchors: AnchorSet): Anchor[] {
  const out: Anchor[] = []
  for (const [key, anchor] of anchors) {
    if (key.startsWith('ObjectiveEnded:')) out.push(anchor)
  }
  return out.sort((a, b) => a.gameTimeSeconds - b.gameTimeSeconds)
}

/** The latest anchor of `type` for `campId`, by game time. */
export function latestCampAnchor(
  anchors: AnchorSet,
  type: 'CampTaken' | 'CampUp',
  campId: string,
): Anchor | null {
  let best: Anchor | null = null
  for (const [key, anchor] of anchors) {
    if (!key.startsWith(`${type}:${campId}:`)) continue
    if (best === null || anchor.gameTimeSeconds > best.gameTimeSeconds) best = anchor
  }
  return best
}

export function matchStartAnchor(anchors: AnchorSet): Anchor | null {
  return anchors.get('MatchStart:') ?? null
}

/**
 * A near-simultaneous second tap overwrites rather than opening a cycle. Two
 * teammates tapping the same objective a couple of seconds apart, with the second
 * computing its index against a set that already contains the first, would otherwise
 * write two entries for one occurrence and inflate every later cycle.
 *
 * Returns the key the anchor should be written under.
 */
export function objectiveEndedKeyFor(
  anchors: AnchorSet,
  gameTimeSeconds: Seconds,
  coalesceWithinSeconds: Seconds,
): string {
  let newest: { key: string; anchor: Anchor } | null = null
  for (const [key, anchor] of anchors) {
    if (!key.startsWith('ObjectiveEnded:')) continue
    if (newest === null || anchor.gameTimeSeconds > newest.anchor.gameTimeSeconds) {
      newest = { key, anchor }
    }
  }
  if (
    newest !== null &&
    Math.abs(gameTimeSeconds - newest.anchor.gameTimeSeconds) < coalesceWithinSeconds
  ) {
    return newest.key
  }
  return anchorKey('ObjectiveEnded', String(nextObjectiveCycle(anchors)))
}

/**
 * Last-write-wins on `wallClock`, the same rule the relay uses, so a late-delivered
 * peer anchor cannot overwrite a newer local one.
 */
export function writeAnchor(anchors: AnchorSet, key: string, anchor: Anchor): AnchorSet {
  const existing = anchors.get(key)
  if (existing !== undefined && existing.wallClock > anchor.wallClock) return anchors
  const next = new Map(anchors)
  next.set(key, anchor)
  return next
}

/** Removal is the third legal operation on the anchor set: undo of a first write. */
export function clearAnchor(anchors: AnchorSet, key: string): AnchorSet {
  if (!anchors.has(key)) return anchors
  const next = new Map(anchors)
  next.delete(key)
  return next
}

/** `revert` bypasses last-write-wins: a restore carries an older `wallClock`. */
export function restoreAnchor(anchors: AnchorSet, key: string, anchor: Anchor | null): AnchorSet {
  const next = new Map(anchors)
  if (anchor === null) next.delete(key)
  else next.set(key, anchor)
  return next
}
