import type { Anchor, AnchorSet, Seconds } from '@nexiliary/engine'

/**
 * `localStorage` for settings, recent maps, and the live match.
 *
 * An earlier design persisted no match state and relied on rejoining the relay session
 * to recover, which is circular while no relay exists and loses the match anyway: iOS
 * routinely evicts a backgrounded PWA on a phone that sits beside a keyboard for twenty
 * minutes. Every read is wrapped, because private windows and cleared site data make
 * these throw rather than return null.
 */

const KEYS = {
  settings: 'nexiliary.settings.v1',
  recentMaps: 'nexiliary.recentMaps.v1',
  match: 'nexiliary.match.v1',
} as const

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // A full or unavailable store must not break a live match.
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* as above */
  }
}

export interface StoredSettings {
  readonly maxTier: 'essential' | 'standard' | 'verbose'
  readonly speechEnabled: boolean
  readonly voiceId?: string
  readonly showRail: boolean
}

export const defaultSettings: StoredSettings = {
  // Objectives and level 10 on by default; wave spawns off, because a voice that talks
  // every thirty seconds gets muted within two games.
  maxTier: 'standard',
  speechEnabled: true,
  showRail: true,
}

export function loadSettings(): StoredSettings {
  return { ...defaultSettings, ...read<Partial<StoredSettings>>(KEYS.settings, {}) }
}

export function saveSettings(settings: StoredSettings): void {
  write(KEYS.settings, settings)
}

export function loadRecentMaps(): string[] {
  const value = read<unknown>(KEYS.recentMaps, [])
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

export function noteMapPlayed(mapId: string): string[] {
  const next = [mapId, ...loadRecentMaps().filter((id) => id !== mapId)].slice(0, 6)
  write(KEYS.recentMaps, next)
  return next
}

export interface StoredMatch {
  readonly matchId: string
  readonly mapId: string
  readonly anchors: readonly Anchor[]
  readonly userAdjustSeconds: Seconds
  readonly savedAtWallClock: number
}

/** A stored match older than this is not offered for resume. */
export const resumeWindowMillis = 45 * 60 * 1000

export function saveMatch(match: StoredMatch): void {
  write(KEYS.match, match)
}

export function clearMatch(): void {
  remove(KEYS.match)
}

export function loadResumableMatch(nowMillis: number): StoredMatch | null {
  const stored = read<StoredMatch | null>(KEYS.match, null)
  if (stored === null || typeof stored.matchId !== 'string' || !Array.isArray(stored.anchors)) return null
  if (nowMillis - stored.savedAtWallClock > resumeWindowMillis) return null
  return stored
}

export function toAnchorList(anchors: AnchorSet): Anchor[] {
  return [...anchors.values()]
}

export function fromAnchorList(list: readonly Anchor[]): AnchorSet {
  const map = new Map<string, Anchor>()
  for (const a of list) map.set(`${a.type}:${a.subject}`, a)
  return map
}
