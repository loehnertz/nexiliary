import type { Seconds, TimedEvent } from '../types.js'
import type { MapDefinition, ObjectiveModel } from '../map-types.js'
import type { ChainStep, ChainWalk } from '../objective-chain.js'

function spawnEvent(label: string, step: ChainStep): TimedEvent {
  return {
    id: `objective:spawn:${step.cycle}`,
    kind: 'objective',
    role: 'spawn',
    label,
    at: step.at,
    confidence: step.confidence,
    cycle: step.cycle,
    ...(step.offset !== null
      ? { offsetMin: step.offset.min, offsetMax: step.offset.max, spread: step.spread }
      : { spread: step.spread }),
  }
}

/**
 * The resolution is emitted as an event so that camp suppression and `validUntil` can
 * name a quantity that exists rather than gesture at one.
 */
function resolutionEvent(label: string, step: ChainStep): TimedEvent {
  return {
    id: `objective:resolution:${step.cycle}`,
    kind: 'objective',
    role: 'resolution',
    label: `${label} resolved`,
    at: step.resolutionAt,
    confidence:
      step.confidence.kind === 'Unknown'
        ? step.confidence
        : step.resolutionHigh > step.resolutionLow
          ? { kind: 'Estimated', low: step.resolutionLow, high: step.resolutionHigh }
          : { kind: 'Exact' },
    cycle: step.cycle,
    spread: step.spread,
  }
}

/** The objective chain emits the next two cycles. */
export function objectives(
  map: MapDefinition,
  walk: ChainWalk | null,
  now: Seconds,
): TimedEvent[] {
  const objective: ObjectiveModel = map.objective
  if (objective.kind !== 'timed' || walk === null) return []
  const label = objective.label

  const out: TimedEvent[] = [
    spawnEvent(label, walk.pending),
    resolutionEvent(label, walk.pending),
    spawnEvent(label, walk.following),
  ]
  if (walk.elapsed !== null && now <= walk.elapsed.resolutionHigh) {
    out.push(resolutionEvent(label, walk.elapsed))
  }
  return out
}
