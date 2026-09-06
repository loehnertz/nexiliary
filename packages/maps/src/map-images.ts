/**
 * Where the battleground renders live and how big they are.
 *
 * Deliberately not on `MapDefinition`: `engine` stays free of presentation concerns so
 * the deferred desktop companion can reuse it verbatim. Intrinsic dimensions are declared
 * so the frame can reserve the aspect ratio before the image loads, which stops the panel
 * jumping while the player is looking at it.
 *
 * A map with no entry keeps the camp rail. That is a supported outcome rather than a gap.
 * Provenance and preparation are recorded in `docs/map-images.md`.
 */
export interface MapImage {
  readonly src: string
  readonly width: number
  readonly height: number
}

export const mapImages: Readonly<Record<string, MapImage>> = {
  'alterac-pass': { src: '/maps/alterac-pass.webp', width: 800, height: 665 },
  'battlefield-of-eternity': { src: '/maps/battlefield-of-eternity.webp', width: 800, height: 467 },
  'braxis-holdout': { src: '/maps/braxis-holdout.webp', width: 800, height: 566 },
  'cursed-hollow': { src: '/maps/cursed-hollow.webp', width: 800, height: 570 },
  'dragon-shire': { src: '/maps/dragon-shire.webp', width: 800, height: 598 },
  'garden-of-terror': { src: '/maps/garden-of-terror.webp', width: 800, height: 479 },
  'hanamura-temple': { src: '/maps/hanamura-temple.webp', width: 800, height: 556 },
  'haunted-mines': { src: '/maps/haunted-mines.webp', width: 800, height: 346 },
  'infernal-shrines': { src: '/maps/infernal-shrines.webp', width: 800, height: 574 },
  'sky-temple': { src: '/maps/sky-temple.webp', width: 800, height: 600 },
  'tomb-of-the-spider-queen': { src: '/maps/tomb-of-the-spider-queen.webp', width: 800, height: 455 },
  'towers-of-doom': { src: '/maps/towers-of-doom.webp', width: 800, height: 627 },
  'volskaya-foundry': { src: '/maps/volskaya-foundry.webp', width: 800, height: 567 },
  'warhead-junction': { src: '/maps/warhead-junction.webp', width: 800, height: 664 },
}
