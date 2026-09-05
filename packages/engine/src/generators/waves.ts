import type { Seconds, TimedEvent } from '../types.js'
import { exact } from '../confidence.js'
import { firstWaveSeconds, waveIntervalSeconds } from '../game-constants.js'

/**
 * A pure function of game time, always `Exact`, needing no input and no map data.
 *
 * Truncation is per generator. A single global horizon over an `at`-sorted list would
 * be four waves and nothing else, evicting everything the cues depend on.
 */
export function waves(now: Seconds, count = 4): TimedEvent[] {
  const firstIndex = Math.max(0, Math.ceil((now - firstWaveSeconds) / waveIntervalSeconds))
  const out: TimedEvent[] = []
  for (let i = 0; i < count; i += 1) {
    const index = firstIndex + i
    out.push({
      id: `wave:${index}`,
      kind: 'wave',
      label: 'Wave',
      at: firstWaveSeconds + index * waveIntervalSeconds,
      confidence: exact,
    })
  }
  return out
}
