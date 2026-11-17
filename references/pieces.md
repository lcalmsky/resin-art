# Pieces

Every piece is a `PieceDef` (`lib/piece.ts`): a name, studio framing, and a
`build(s)` that adds the piece to `s.turntable` and returns an optional `update`.
Each example is one such module plus a two-line `main.ts` that calls
`examples/page.ts`. Pieces are built bottom-up in layers. Positions are world units
(1 unit = 3 cm) with the table at y = 0 and the footprint centred on the origin.

## Seashore — `examples/seashore`

The round version of the ocean piece and the showcase example. `disc()` gives a
wandering circular footprint with a wave top and a rolled rim. The sea axis is the
distance from a point beyond the rim on the beach side, so the shoreline curves like
a bay instead of running straight across. Keep the water pigment clear until the sand
has run out, or thin sand under teal reads green. Washed-up things (shells, a
starfish, pearls, sand-coloured pebbles) sit on `sandTop(x, z)` and stay inside
`discRadius()` with a margin, so nothing pokes through the rim. Portrait framing
(1080x1350) needs a longer camera distance than landscape, since the fov is vertical.

## Ocean slab (바다 한조각) — `examples/ocean-slab`

1. Define `sea(x, z)` → 0 at the beach corner, 1 out at sea, with fbm noise so the
   shoreline wanders. Everything below keys off this one function.
2. **Pigment floor**: a plane just above y = 0, `pigment()` from sand-beige to deep
   blue along `sea`. This is what makes deep water read as deep.
3. **Sand**: `slab({ height: 0.5, relief: 1, surface: sandTop })` — the trick is
   `height 0.5, relief 1` makes the top exactly `surface(x, z)`. Fill to ~½ of the
   resin height at the beach, thinning to zero under the sea. `sandMaterial()`.
4. **Shells** half-buried at `sandTop(x, z) + small`, tilted, one large and one small.
5. **Foam lace**: two `flat(foamTexture({ band }))` sheets at 0.72 H and 0.56 H.
   `band(u, v)` maps texture UV back to world and peaks just seaward of the shore.
6. **Water body**: `slab({ relief: 0.16, surface: rippleField(seed, 0.75) })` with
   `calm` lower over the beach; `pigment()` clear → teal → blue along `sea`;
   `resin({ vertexColors: true })`.
7. Table: `contactShadow` tinted blue-grey, `caustics` offset back-right.

Keychain variants are the same build with a smaller footprint (0.8 × 1.4), the shore
across the short side, and a metal ring (`TorusGeometry`, metalness 1).

## Clear block with an object — `examples/rose-cube`

1. `block(S, S, S, radius)` with `resin({ tint, depth, thickness: S * 0.5 })`.
2. Hero object a little below centre, tilted toward the camera (`rose()`, or any
   opaque mesh — a dolphin figure, a dandelion head built from instanced stalks).
3. Two or three secondary pieces (leaves via `flat(pressed({ kind: 'leaf' }))`).
4. 20–30 bubbles with `beads(points, r, { bubble: true })`, kept away from the hero
   with `scatter(..., keep)`.
5. `studio({ elevation: 20, yaw: 32 })` so two faces show.

## Pressed-flower coaster — `examples/flower-coaster`

1. `pour(freeformOutline(R, { lobes, lobeDepth, wander }), H)` — the meniscus bevel
   is what makes it look poured rather than cut.
2. Flowers as `flat(pressed(...))` at one height, each 0.0025 above the last so they
   overlap without z-fighting. Order: leaves, sprigs, small flowers, hero flowers.
3. A ring of `glitter()` flakes near the rim.
4. `studio({ elevation: 56 })` looks down onto it; `contactShadow({ round: true })`.

## Photo tray with shells and pearls

Not an example yet; build it from the same parts:

1. `pour(outline, 0.18)` with a rectangular or arched outline (`THREE.Shape`).
2. The photo: `new THREE.TextureLoader().load(url)` with `colorSpace = SRGBColorSpace`
   on a `flat()` sheet with a white border drawn into a canvas, slightly rotated.
3. A beach strip along one edge: sand slab + crushed-glass `beads` in sea colours.
4. Shells (`shell()`), a conch (lathe a spiral profile), pearls (`beads`), dried
   gypsophila (`pressed({ kind: 'sprig' })`), moss (`pressed({ kind: 'lace' })`).
5. Flower petals scattered loose with random rotation, a few seeds as dark `beads`.
