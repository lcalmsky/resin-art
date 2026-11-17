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
- `foamTexture({ band })` is cellular noise (F2 − F1) masked by a band function; the
  band is solid at its peak and breaks into rings at its edges.

## Rose

`rose({ color, petals, open })` builds each petal as a strip of a cylinder around the
stem axis: inner petals wrap almost fully and stand upright, outer ones get wider,
flare and roll back. Petal outline is round-tipped; colour darkens toward the base.
Petals are placed by the golden angle. `open` 0.6 is a bud, 1.2 a blown rose.
