import { describe, expect, it } from 'vitest'
import type { Anchor } from '@nexiliary/engine'
import { braxisHoldout } from '@nexiliary/maps'
import { buildMatchLog } from '../src/services/match-log.js'

function anchor(type: string, subject: string, gameTimeSeconds: number): Anchor {
  return { type, subject, gameTimeSeconds, wallClock: gameTimeSeconds * 1000, source: 'local', schema: 1 }
}

describe('the match log', () => {
  it('separates the fight from the respawn offset, which is the whole point', () => {
    // A cycle's spawn and end give the fight. One cycle's end and the next cycle's spawn
    // give the offset. Neither is recoverable from `ObjectiveEnded` taps alone, which is
    // why the spawn tap exists.
    const log = buildMatchLog(
      braxisHoldout,
      [
        anchor('ObjectiveSpawned', '1', 97),
        anchor('ObjectiveEnded', '1', 214),
        anchor('ObjectiveSpawned', '2', 341),
        anchor('ObjectiveEnded', '2', 452),
      ],
      600,
    )
    expect(log).toContain('117s')   // fight on cycle 1: 214 - 97
    expect(log).toContain('111s')   // fight on cycle 2: 452 - 341
    expect(log).toContain('127s')   // offset into cycle 2: 341 - 214
  })

  it('shows what the map file currently guesses, to compare against', () => {
    const log = buildMatchLog(braxisHoldout, [], 300)
    expect(log).toContain('fight 110s ±30s')
    expect(log).toContain('provenance published')
  })

  it('says so plainly when nothing was recorded', () => {
    expect(buildMatchLog(braxisHoldout, [], 300)).toContain('No objective anchors recorded')
  })

  it('leaves a column blank rather than inventing it when only one tap was made', () => {
    const log = buildMatchLog(braxisHoldout, [anchor('ObjectiveEnded', '1', 214)], 300)
    expect(log).toContain('—')
    expect(log).not.toMatch(/\bNaN\b/)
  })

  it('lists camp taps in the order they happened', () => {
    const log = buildMatchLog(
      braxisHoldout,
      [anchor('CampTaken', 'raven-nw:1', 300), anchor('CampTaken', 'hellbat-ne:1', 180)],
      400,
    )
    expect(log.indexOf('hellbat-ne')).toBeLessThan(log.indexOf('raven-nw'))
  })
})
