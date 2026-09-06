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
    bearing: 'c',
    position: { x: 0.5, y: 0.5 },
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

export const siegeTop = camp({ id: 'siege-top', label: 'siege', bearing: 'n', pressureValue: [7] })
export const bruiser = camp({ id: 'bruiser', label: 'bruiser', type: 'bruiser', bearing: 'w', pressureValue: [5] })
export const boss = camp({
  id: 'boss',
  label: 'boss',
  type: 'boss',
  bearing: 'c',
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
    endedLabel: 'Zerg cleared',
    fight: { medianSeconds: 70, spreadSeconds: 25 },
    respawn: { kind: 'afterResolution', outcomes: { default: { label: 'Zerg cleared', minSeconds: 130, maxSeconds: 130 } } },
    instances: '2 beacons',
  },
  camps: [siegeTop, bruiser, boss],
}

/** Scalar offset, camps stay on the field. Modelled on Dragon Shire. */
export const dragon: MapDefinition = {
  ...braxis,
  id: 'dragon',
  name: 'Dragon Shire',
  campsSuppressedDuringObjective: false,
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
    endedLabel: 'Cavalry gone',
    fight: { medianSeconds: 60, spreadSeconds: 25 },
    respawn: {
      kind: 'afterResolution',
      minOffsetSeconds: 60,
      scalePerMinuteSeconds: 2,
      outcomes: { default: { label: 'Cavalry gone', minSeconds: 110, maxSeconds: 150 } },
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
    endedLabel: 'Tribute taken',
    fight: { medianSeconds: 45, spreadSeconds: 20 },
    respawn: {
      kind: 'afterResolution',
      outcomes: {
        tribute: { label: 'Tribute taken', minSeconds: 50, maxSeconds: 90 },
        curse: { label: 'Curse ended', minSeconds: 120, maxSeconds: 160, possibleFromCycle: 4 },
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
    endedLabel: 'Temples stopped',
    fight: { medianSeconds: 40, spreadSeconds: 0 },
    respawn: { kind: 'afterResolution', outcomes: { default: { label: 'Temples stopped', minSeconds: 120, maxSeconds: 120 } } },
  },
  camps: [siegeTop],
}

/** Blackheart's Bay: a scalar offset off the last chest being taken. */
export const blackheart: MapDefinition = {
  id: 'blackheart',
  name: "Blackheart's Bay",
  provenance: 'verified',
  provenanceNote: 'fixture',
  objective: {
    kind: 'timed',
    label: 'Chests',
    firstSpawnSeconds: 90,
    endedLabel: 'Chests gone',
    fight: { medianSeconds: 50, spreadSeconds: 20 },
    respawn: {
      kind: 'afterResolution',
      outcomes: { lastChestTaken: { label: 'Last chest taken', minSeconds: 180, maxSeconds: 180 } },
    },
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
  camps: [siegeTop, boss],
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
