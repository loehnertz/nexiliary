import { useRef } from 'react'
import type { AnchorSet, MapDefinition, Seconds, Timeline } from '@nexiliary/engine'
import { project } from '@nexiliary/engine'

interface Cache {
  timeline: Timeline
  anchors: AnchorSet
  mapId: string
}

/**
 * Event times do not move as the clock advances; only remaining time does, and that is
 * subtraction. So the projection is memoised and recomputed only when the anchor set
 * changes or when `now` passes `validUntil`.
 *
 * Keying on `(mapId, anchorSet)` alone would never change when a projection expires,
 * so a naive `useMemo` yields a permanently stale timeline. `validUntil` has to be part
 * of the condition, which is why it is guaranteed strictly greater than `now`.
 *
 * `project` is pure, so caching in a ref during render is safe under concurrent
 * rendering: a discarded render simply recomputes.
 */
export function useTimeline(map: MapDefinition, anchors: AnchorSet, now: Seconds): Timeline {
  const cache = useRef<Cache | null>(null)
  const current = cache.current
  if (
    current === null ||
    current.mapId !== map.id ||
    current.anchors !== anchors ||
    now > current.timeline.validUntil
  ) {
    cache.current = { timeline: project(map, anchors, now), anchors, mapId: map.id }
  }
  return cache.current!.timeline
}
