# Battleground renders

The map view draws camp dots on a render of the battleground. This records where each
render came from and how it was prepared, the way `docs/camp-data.md` records where the
camp timings came from.

## Source

Fifteen renders from the Heroes of the Storm wiki, `Category:Battleground maps` and the
plain `<Battleground> map` files, fetched 2026-09-06 via the MediaWiki API at
`https://heroesofthestorm.fandom.com/api.php`.

**Unmarked renders only.** The wiki also publishes "areas of interest" and "points of
interest" versions for five battlegrounds, and Icy Veins publishes camp maps for all
fifteen. Those have their markers burned into the pixels, so shipping one would put a
permanently-green marker under every state dot: six camps drawn as twelve, half of them
never changing. Principle 1 forbids a display asserting what it cannot derive. They are
used as the authoring reference for camp positions and then discarded.

Five battlegrounds — Battlefield of Eternity, Blackheart's Bay, Cursed Hollow, Dragon
Shire and Sky Temple — appear in the map category only in annotated form. Each has a
plain `<Battleground> map` file outside that category, at 5000-6900 px wide, and that is
what ships.

## Preparation

Each render is cropped to the playable extent, resized to 800 px wide and saved as WebP
at quality 82. The crop matters: `CampDefinition.position` is normalised against the
playable bounding box, so the image conforms to the coordinates rather than the reverse.

The crop is found by local texture rather than brightness. The battleground is detailed
and the background behind it is smooth, while their luminances overlap — a brightness
threshold puts the box in the wrong place on roughly half the maps.

Total 980 KB across fifteen files, precached by `vite-plugin-pwa`.

## Per map

| Map | Source file | Shipped |
| --- | --- | --- |
| alterac-pass | Alterac-pass-map.jpg | 800x665 |
| battlefield-of-eternity | Battlefield of Eternity map.jpg | 800x467 |
| blackhearts-bay | — | none, see below |
| braxis-holdout | Braxis Holdout map.png | 800x566 |
| cursed-hollow | Cursed Hollow map.jpg | 800x570 |
| dragon-shire | Dragon Shire Map.jpg | 800x598 |
| garden-of-terror | Garden of Terror map.jpg | 800x479 |
| hanamura-temple | Hanamura Temple map.jpg | 800x556 |
| haunted-mines | Haunted Mines map top.png | 800x346 |
| infernal-shrines | Infernal Shrines map.jpg | 800x574 |
| sky-temple | Sky Temple map.jpeg | 800x600 |
| tomb-of-the-spider-queen | Tomb of the Spider Queen map.png | 800x455 |
| towers-of-doom | Towers of Doom map.jpg | 800x627 |
| volskaya-foundry | Volskaya-map.jpg | 800x567 |
| warhead-junction | Warhead Junction Map.jpg | 800x664 |

Haunted Mines has two renders, surface and mine. The camps are on the surface, so
`Haunted Mines map top.png` ships and the mine render is unused.

## Blackheart's Bay ships no image

The wiki records four Skeletal Pirate camps where `blackhearts-bay.ts` carries two
`doubloon` entries, and the Icy Veins reference shows all four as separate markers. One
dot for two camps would have to sit between them and point at neither.

The rail can say "doubloons n" without claiming a location. A dot on a map cannot, so
Blackheart's Bay keeps the rail. Splitting the camp data into four entries would fix it
and is a change to the timing model, not to this feature.

## Corrections found by checking

Every map's coordinates were checked by drawing them back onto the shipped render.

- **hanamura-temple** — the wiki's `Hanamura map.png` is the original 2017 payload
  version, snowy and a different layout. Replaced with `Hanamura Temple map.jpg`, which
  matches the current battleground.
- **battlefield-of-eternity** — the bright heaven half was mistaken for the terrain edge,
  which shifted every camp left. Renormalised against the true extent.
- **towers-of-doom** — the northern camp landed in the background above the map, because
  the shipped crop carries more vertical margin than the reference. Moved onto the
  northern structure.
