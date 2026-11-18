# References and free assets

A piece looks real when its parts look like the real thing. Before building, look at
real resin pieces, and use real scanned objects for anything a maker would set in
the resin by hand (shells, coral, stones). Build procedurally only what no scan
exists for, or what has to follow the piece's shape (sand, water, foam, pigment).

## Look at real pieces first

Search the web for photos of real pieces of the same kind before writing code, with
whatever web search tool the session has. Describe the page you want, for example
"close-up photo of an epoxy resin ocean coaster with real seashells and white lacing".
Look at three to five and write down, layer by layer, what you see: how thick the
sand is, where the lacing sits, how big the shells are next to the piece, how the
colour deepens, what the rim looks like.

| where | what it is good for | use |
|---|---|---|
| Etsy, Instagram, Pinterest, YouTube Shorts (resin art, 레진아트, 바다 레진) | how makers actually compose pieces, what sells | look only; never copy a specific piece |
| Unsplash, Pexels | free photos of shells, beaches, water, flowers | reference, or textures under their licence |
| Wikimedia Commons | photos of specific species (a scallop, a starfish) | reference; check each file's licence before using it as a texture |

## Free assets you can ship

| source | what | licence |
|---|---|---|
| Smithsonian Open Access 3D (3d.si.edu), repackaged as web GLB in `codepawl/smithsonian-3d-glb` on Hugging Face | photogrammetry scans: shells (scallops, cones, olives, cowries, murex, cockles), corals, fossils, plants | CC0; credit asked for, not required |
| Poly Haven (polyhaven.com) | scanned models, PBR textures (sand, stone, wood, marble), HDRIs | CC0 |
| ambientCG (ambientcg.com) | PBR textures and HDRIs | CC0 |
| Sketchfab (filter: downloadable, CC0 or CC-BY) | scans of shells, starfish, coral by individuals | per model; CC-BY needs a credit line |

Check the licence on every item, not on the site. Record each shipped file in
`assets/scans/CREDITS.md` (the fetch script below does this for Smithsonian scans).

## Smithsonian scans in this repo

```sh
npm run scans -- search shell scallop conus cypraea coral   # list matching scans
npm run scans -- fetch conus-textile-c29a9ede               # download to assets/scans/ + credit line
```

Search by common words and by genus names (`pecten`, `mimachlamys`, `conus`,
`oliva`, `cypraea`, `murex`, `cardium`, `corallium`, `acropora`): titles are mostly
scientific names. For sea stars search `linckia` and `acanthaster`; `starfish` and
`asteroidea` find nothing. Museum specimens are often grey or faded: `tint` in
`scan()` multiplies the colour, and an `[r, g, b]` above 1 lightens a dark scan
(`[2.0, 1.18, 0.68]` turns the grey Linckia a sun-bleached tan).

Then in the piece:

```ts
import { scan, ready } from '../../lib/assets.ts';

const s1 = scan(new URL('../../assets/scans/conus-textile-c29a9ede.glb', import.meta.url).href,
  { size: 0.5, rotation: [0, 0, 0], roughness: 0.45 });
s1.position.set(x, sandTop(x, z) - 0.03, z);   // sink it a little into the sand
piece.add(s1);
return { update, ready: ready(s1) };             // export and capture wait for this
```

- **Orientation.** Scans come standing as they were photographed. Bivalves (scallops,
  cockles) usually need `rotation: [-Math.PI / 2, 0, 0]` to lie dome-up; long
  gastropods (olive) `[0, 0, Math.PI / 2]` to lie on their side. Render each new scan
  once from above and from low before placing it.
- **Size.** `size` is the largest dimension in units (1 unit = 3 cm). Real shells in
  a 10 cm piece are 1–2.5 cm: 0.35–0.8 units.
- **Keep away from the rim.** Inside a quarter of the radius from the edge, the side
  wall refracts a second copy of the shell.
- **Keep the top flat.** Resin levels before it cures, so a real piece has a glassy
  top with at most a faint swell (`relief` about 0.02). A wavy top melts the shells
  under it and reads as crumpled plastic film.
- **Close-ups.** Frame the whole piece, or crop the bottom off: where the resin runs
  past the frame edge, three.js samples refraction from outside the screen and smears
  the edge pixels into vertical streaks.
- **Weight.** `fetch` takes the 20% LOD (`--tier lod2`, about 30k triangles and
  0.1–0.5 MB), which looks the same as the full scan at shell size and keeps exported
  GLB and USDZ files small. Use `--tier lod1` or `full` only for a shell filling the frame.
