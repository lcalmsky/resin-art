# Style

The look in one sentence: water-clear cast epoxy on a pale marble table under soft
studio light, with colour that deepens where the resin is thick, inclusions that sit
in distinct layers, and sharp glints that move as the piece turns.

## Resin

| | value | why |
|---|---|---|
| IOR | `1.54` | casting epoxy; glass is 1.5, water 1.33 |
| roughness | `0.02` polished, `0.15+` sanded or matte | a hint above zero keeps highlights soft-edged |
| thickness | ≈ real thickness for slabs and pours, ≈ ½ for cubes | it is screen-space refraction; too much duplicates inclusions per face |
| attenuation | `tint` + `depth` 5–15 units | an even body tint (blush pink, smoky amber) |
| topcoat | `1` on domed pours, `0` on blocks | a second gloss layer; on blocks it doubles reflections into haze |
| tone mapping | `NeutralToneMapping`, exposure ≈ 0.9 | ACES turns ocean blue into violet |

## Colour

- **Ocean**: clear `#ffffff` at the shore → `#f2fdfb` → teal `#8fe8e4` → `#2cc0dc`
  → deep `#0a86d8`. Pigment floor under the deep part `#4fc3d8` → `#1a8fd0`.
- **Sand**: `#d4b98a` base with world-space grains (`sandMaterial`), a few dark specks.
- **Flowers** keep their real colours but slightly desaturated and mottled, the way
  pressed flowers dry. Daisy centres green or ochre, not black.
- **Shells**: cream `#f4ede2` with orange-brown growth bands, white ribs.
- One family of tint per piece. Colour accents come from inclusions, not from the
  resin changing hue in several directions.

## Table and light

- Backdrop `#f3f1ee` (warm white) or `#ebe6df` (linen) — the CSS card uses the same.
- Marble veins soft grey, about 1 vein per piece width, low contrast. They exist to
  show refraction, not to be looked at.
- Key light from the upper left-front, so caustics fall back-right.
- The environment's key sweeps ±25° slowly so glints travel across a wavy top.

## Composition

- Off-centre. The shore runs diagonally; the flower bouquet sits in one half with
  stems pointing to an edge; a rose in a cube sits slightly below centre and tilts.
- Sizes vary within a piece: one large hero inclusion, two or three medium, many
  small (sprigs, glitter, bubbles).
- Leave clear resin around the edges. A rim of clear makes the piece read as cast.
