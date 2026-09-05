import type { Anchor, AnchorSet, MapDefinition, CampDefinition } from '../src/index.js'

export function anchor(
  type: string,
  subject: string,
  gameTimeSeconds: number,
  wallClock = gameTimeSeconds * 1000,
  source = 'local',
): Anchor {
  return { type, subject, gameTimeSeconds, wallClock, source, schema: 1 }
}

export function anchorSet(...entries: Anchor[]): AnchorSet {
  const map = new Map<string, Anchor>()
  for (const a of entries) map.set(`${a.type}:${a.subject}`, a)
  return map
}

function camp(over: Partial<CampDefinition> & Pick<CampDefinition, 'id'>): CampDefinition {
  return {
    label: over.id,
    type: 'siege',
    firstSpawnSeconds: 120,
    respawnSeconds: 180,
    decaySeconds: 45,
    staleSeconds: 120,
    clearSeconds: 20,
    approachSeconds: 15,
    travelSeconds: [40],
    pressureValue: [5],
    ...over,
  }
}

export const siegeTop = camp({ id: 'siege-top', label: 'siege', pressureValue: [7] })
export const bruiser = camp({ id: 'bruiser', label: 'bruiser', type: 'bruiser', pressureValue: [5] })
export const boss = camp({
  id: 'boss',
  label: 'boss',
  type: 'boss',
  firstSpawnSeconds: 300,
  respawnSeconds: 300,
  decaySeconds: 300,
  staleSeconds: 900,
  clearSeconds: 45,
  approachSeconds: 20,
  travelSeconds: [60],
  pressureValue: [9],
})

/** Scalar offset, suppressing camps. Modelled on Braxis Holdout. */
export const braxis: MapDefinition = {
  id: 'braxis',
  name: 'Braxis Holdout',
  provenance: 'verified',
  provenanceNote: 'fixture',
  campsSuppressedDuringObjective: true,
  objective: {
    kind: 'timed',
    label: 'Beacons',
    firstSpawnSeconds: 90,
    fight: { medianSeconds: 70, spreadSeconds: 25 },
    respawn: { kind: 'afterResolution', outcomes: { default: { minSeconds: 130, maxSeconds: 130 } } },
    instances: '2 beacons',
  },
  camps: [siegeTop, bruiser, boss],
}

/** Ranged offset that shortens with game time. Modelled on Alterac Pass. */
export const alterac: MapDefinition = {
  id: 'alterac',
  name: 'Alterac Pass',
  provenance: 'verified',
  provenanceNote: 'fixture',
  campsSuppressedDuringObjective: true,
  objective: {
    kind: 'timed',
    label: 'Cavalry',
    firstSpawnSeconds: 180,
    fight: { medianSeconds: 60, spreadSeconds: 25 },
    respawn: {
      kind: 'afterResolution',
      minOffsetSeconds: 60,
      scalePerMinuteSeconds: 2,
      outcomes: { default: { minSeconds: 110, maxSeconds: 150 } },
    },
  },
  camps: [siegeTop, bruiser],
}

/** Two outcomes, the second unreachable before cycle 3. Modelled on Cursed Hollow. */
export const cursed: MapDefinition = {
  id: 'cursed',
  name: 'Cursed Hollow',
  provenance: 'verified',
  provenanceNote: 'fixture',
  objective: {
    kind: 'timed',
    label: 'Tribute',
    firstSpawnSeconds: 180,
    fight: { medianSeconds: 45, spreadSeconds: 20 },
    respawn: {
      kind: 'afterResolution',
      outcomes: {
        tribute: { minSeconds: 50, maxSeconds: 90 },
        curse: { minSeconds: 120, maxSeconds: 160, possibleFromCycle: 3 },
      },
    },
  },
  camps: [siegeTop],
}

/** Deterministic phase, scalar offset: only `minStepSpread` widens it. Sky Temple's shape. */
export const deterministic: MapDefinition = {
  id: 'deterministic',
  name: 'Sky Temple',
  provenance: 'verified',
  provenanceNote: 'fixture',
  objective: {
    kind: 'timed',
    label: 'Temples',
    firstSpawnSeconds: 180,
    fight: { medianSeconds: 40, spreadSeconds: 0 },
    respawn: { kind: 'afterResolution', outcomes: { default: { minSeconds: 120, maxSeconds: 120 } } },
  },
  camps: [siegeTop],
}

/** The one fixed-interval map. Blackheart's Bay. */
export const blackheart: MapDefinition = {
  id: 'blackheart',
  name: "Blackheart's Bay",
  provenance: 'verified',
  provenanceNote: 'fixture',
  objective: {
    kind: 'timed',
    label: 'Chests',
    firstSpawnSeconds: 90,
    fight: { medianSeconds: 50, spreadSeconds: 20 },
    respawn: { kind: 'fixedInterval', minSeconds: 165, maxSeconds: 195 },
  },
  camps: [siegeTop],
}

/** No timed objective at all. Tomb of the Spider Queen. */
export const tomb: MapDefinition = {
  id: 'tomb',
  name: 'Tomb of the Spider Queen',
  provenance: 'verified',
  provenanceNote: 'fixture',
  objective: { kind: 'none' },
  camps: [siegeTop],
}

export const unknownMap: MapDefinition = {
  id: 'unknown',
  name: 'Unrecognised battleground',
  provenance: 'unknown',
  objective: { kind: 'none' },
  camps: [],
}

export function withProvenance(map: MapDefinition, provenance: MapDefinition['provenance']): MapDefinition {
  return { ...map, provenance }
}
