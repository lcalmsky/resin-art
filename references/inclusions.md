# Inclusions

three.js renders transmissive objects by first drawing all **opaque** objects into a
texture and refracting it. Anything with `transparent: true` is not in that texture
and vanishes inside the resin. So:

- sheets (pressed flowers, foam, photos, labels): `flat(texture)` — `alphaTest: 0.45`,
  double-sided, opaque
- solids (shells, roses, figures, pearls): ordinary opaque materials
- bubbles: `beads(..., { bubble: true })` — tiny mirror spheres; real bubbles read as
  bright rims, and a mirror sphere gives exactly that
- glitter and mica: `glitter()` — metallic hexagons with a little emissive so they
  never go black

## Pressed flowers

`pressed({ kind, petal, center, count, seed })` draws into a 512 canvas:

| kind | for |
|---|---|
| `daisy` | cornflower, daisy, aster: many notched petals, dotted disc |
| `five` | geranium, cosmos, viola: five broad round petals |
| `hydrangea` | single hydrangea floret: four petals |
| `lace` | Queen Anne's lace, moss: umbel of dots on thin rays |
| `sprig` | gypsophila, statice: branching stem with clusters |
| `leaf` | any leaf: pointed blade with midrib |

After drawing, every texture is mottled with noise so it reads as dried tissue. Add
new kinds by drawing with the local `petal()` helper (length, width, angle, tip).

## Sand and foam

- `sandMaterial(colour)` computes grains from world position in the shader, so walls
  and tops share one grain without UV stretching.
- `foamTexture({ band, coords, cellScale })` is lacing the way it forms in a real
  pour: a white sheet where `band` is 1, with holes that grow seaward until only
  threads are left between them, then the threads thin out and stop. Not a net of
  even cells: that reads as chicken wire. Pass `coords` in world units, [across the
  wave, along it], so cells have a real size (about 20 per unit, 1.5 mm) and stretch
  across the wave. Measure along the shore at a fixed radius or offset, or moving
  across the wave also slides along it and the holes shear sideways.
- Put the colour under the foam, not in the clear coat. A tinted resin body tints
  everything under it, the lace included, which then reads cyan instead of white.
  Keep the body nearly clear and pigment the floor sheet, as in a real layered pour.

## Shells, starfish, stones

Use real scans for shells (`scan()` in `lib/assets.ts`, see `references/assets.md`).
They carry the irregular ribs, worn edges and mottled colour that make a shell read
as real at a glance. The procedural ones are the fallback:

- `shell()`: a ribbed valve with thickness, scalloped margin, growth lines and hinge
  ears (`ears: false` for a cockle). Colour follows the ribs and growth bands.
- `snail()`: a spiral shell grown along a logarithmic helix. `growth` near 1.2 and a
  large `height` give a slender turritella; `growth` near 1.9 and a small `height` a
  squat top shell.
- `starfish()`: tapering domed arms with rows of tubercles, lighter on the bumps,
  darker in the grooves. Prefer the `linckia-laevigata` scan with a `tint`; a
  procedural star looks moulded next to scanned shells.
- `pebbles()`: matte, irregular stones and shell grit. Keep them matte: glossy ones
  read as water drops under the resin.

Sink everything a little into the sand (`sandTop(x, z) - 0.02..0.04`) and keep it a
quarter of the radius away from the rim.

## Rose

`rose({ color, petals, open })` builds each petal as a strip of a cylinder around the
stem axis: inner petals wrap almost fully and stand upright, outer ones get wider,
flare and roll back. Petal outline is round-tipped; colour darkens toward the base.
Petals are placed by the golden angle. `open` 0.6 is a bud, 1.2 a blown rose.
