# resin-art

A Claude skill and a small TypeScript library for epoxy-resin art rendered with
three.js. Ask for a piece in plain words, or hand over a photo of one, and you get a
real-time 3D piece of cured resin: water you can see through, sand and shells set
inside, white foam lacing, highlights that slide across the glassy top as it turns.

<p align="center"><img src="media/seashore.gif" width="420" alt="A round resin piece with a beach inside, turning on a marble table"></p>

The shells and the sea star are real: CC0 photogrammetry scans of museum specimens
from Smithsonian Open Access, set into procedural sand, water and foam lacing. One piece definition then becomes
whatever you need: a web page or embeddable
component, a PNG, a cutout PNG with no background, a sprite sheet, a turntable
video (with or without alpha), or a 3D file (GLB, USDZ, STL, OBJ).

<p align="center"><img src="media/seashore-photo.png" width="420" alt="Path-traced still of the seashore piece: a domed resin coaster with sand, scanned shells, a sea star and three stacked foam waves on white marble"></p>
<p align="center"><sub>The same piece path traced in Blender Cycles (<code>blender/seashore.py</code>, about 40 s on an M-series GPU).</sub></p>

| Seashore | Shells up close | Foam lacing |
|---|---|---|
| ![Seashore](media/seashore.png) | ![Scanned scallop, cone and olive shells and a sea star in the sand](media/seashore-closeup.png) | ![White lacing torn open into cells where the wave meets the sand](media/seashore-foam.png) |

| Ocean slab | Rose cube | Flower coaster |
|---|---|---|
| ![Ocean slab](media/ocean-slab.png) | ![Rose cube](media/rose-cube.png) | ![Flower coaster](media/flower-coaster.png) |

## Use the skill

Clone it straight into your Claude Code skills folder and install the dependencies
(three.js, Vite and TypeScript; the export script also uses ffmpeg and a local
Chrome):

```sh
git clone https://github.com/lcalmsky/resin-art ~/.claude/skills/resin-art
cd ~/.claude/skills/resin-art && npm install
```

If you keep the repo somewhere else, link it instead:
`ln -s /path/to/resin-art ~/.claude/skills/resin-art`. Claude Code opened inside the
repo also picks the skill up from `.claude/skills/resin-art/`.

Then just ask. A sentence is enough, a reference photo is enough, and both together
work best:

- "바다 한조각 같은 레진 키링 만들어줘. 모래에 조개 하나 박혀 있게."
- "Cast a dandelion head in a clear cube and give me a 10-second video for reels."
- "Here's a photo of my coaster. Make it as a cutout PNG for our product page."
- "Same tray, but as a GLB I can drop into Unity."

The skill reads what the result is for and picks the format itself: a product page
gets a PNG, "누끼" or "for Figma" gets a cutout, "for Unity" gets a GLB, "릴스" gets a
1080x1920 MP4. It asks only when nothing in the request points to a format (for
example "make it an asset", which could be 2D or 3D), and then only once.

Before building, it looks at photos of real pieces of the same kind and uses real
scans for shells and coral instead of modelling them (`references/assets.md`). It
builds one piece first, shows you a still, and waits for a yes before making a set or
exporting.

## What makes it read as real resin

Side by side with photos of real ocean pours, three things gave a render away, and
the library now does each the way a real pour does:

- **A flat, glassy top.** Resin levels itself before it cures. The waves are in the
  white lacing under the top, not in a crumpled surface.
- **Lacing, not a net.** White resin torn open by a heat gun: a solid sheet at the
  shore with holes that grow seaward until only threads are left, stretched across
  the wave.
- **Colour under the foam.** The clear coat is barely tinted and the turquoise is in
  the layer below, so the lace stays white instead of cyan.

## Real shells from free scans

Procedural shells give themselves away: too smooth, too even, too symmetric. So the
pieces use photogrammetry scans of real shells and a sea star from
[Smithsonian Open Access](https://3d.si.edu), which are CC0, in the web GLB packaging
of [codepawl/smithsonian-3d-glb](https://huggingface.co/datasets/codepawl/smithsonian-3d-glb).
A script searches and downloads them:

```sh
npm run scans -- search scallop conus oliva cypraea coral
npm run scans -- fetch conus-textile-c29a9ede     # 20% LOD → assets/scans/, credit added to CREDITS.md
```

```ts
import { scan, ready } from './lib/assets.ts';
const cone = scan(new URL('./assets/scans/conus-textile-c29a9ede.glb', import.meta.url).href, { size: 0.5 });
cone.position.set(x, sandTop(x, z) - 0.03, z);  // placed at once, fills in when loaded
return { update, ready: ready(cone) };           // exports wait for it
```

Museum specimens can be grey or faded; `tint` multiplies a scan's colour, so the
grey Linckia sea star becomes a sun-bleached tan. `references/assets.md` lists other
free sources (Poly Haven, ambientCG, Sketchfab CC0) and where to look at real pieces
for reference.

## What you can get

| Use | Format | Notes |
|---|---|---|
| Website, landing page, React | web page, `mountPiece()` component, static build | drag to turn, slow idle spin |
| Product photo, thumbnail | PNG | any size; marble, wood, linen or plain table |
| Figma, slides, stickers, 2D games | cutout PNG, sprite sheet | clear resin keeps its partial transparency |
| Reels, shorts, posts | MP4, GIF | one seamless full turn |
| Video editing, web overlays | MOV (ProRes 4444), WebM (VP9), APNG | with alpha |
| Blender, Unity, three.js | GLB | transmission, IOR and pigment kept; real size |
| iPhone AR | USDZ | resin becomes tinted see-through (USD has no refraction) |
| 3D printing, mould masters | STL | resin body only, in millimetres |

<p align="center"><img src="media/cutouts.png" alt="Three cutout PNGs over a dark background: the clear resin lets the background through"></p>

The cutouts above sit on a dark colour they were never rendered against. A cutout is
rendered once over black and once over white; how much the two differ is how much
background shows through, so resin stays glassy instead of turning into a white
sticker.

## Run it yourself

Requires Node 22.18 or newer (TypeScript runs natively), ffmpeg for video, and a local
Chrome or Chromium for exports.

```sh
npm install
npm run dev        # http://localhost:5173, one page per example
npm run typecheck
npm run build
```

Every example page has an export bar under the card (table surface, PNG, cutout,
GLB, USDZ, STL, OBJ) and takes URL flags: `?surface=marble|wood|linen|plain|none`,
`?bg=%23eef0f2`, `?spin=0.3`, `?yaw=30`, `?still`, `?capture` (hides the hint and
bar), `?debug` (step time by hand with `__step(seconds)`), `?t=2.5` (freeze time).

## Photoreal stills with Blender

The three.js pieces are real time, so their refraction is a screen-space approximation.
For a still that should pass as a photograph, `blender/` rebuilds the seashore piece in
Blender Cycles and path traces it: real refraction and dispersion through the resin,
depth of field from a 100 mm lens, AgX tone mapping, a studio HDRI and softbox, and CC0
photo-scanned sand and marble from Poly Haven.

```sh
brew install --cask blender          # Blender 5.3 or newer
sh blender/fetch_assets.sh           # sand, marble, wood, HDRI (about 60 MB, CC0)
blender -b -P blender/seashore.py -- --out exports/photo/seashore.png
#   [--scale 0.5] [--samples 256] [--table marble|wood] [--yaw -20] [--elev 48] [--dist 0.34] [--exposure -1] [--save]  (--save also writes blender/cache/seashore.blend)
```

It is built the way a real pour is: sand on the bottom (wet and darker under the
water), water colour in the layer over it, three white waves stacked at different depths
with clear resin between them (`blender/lace.py` makes the lacing: a solid crest, holes of
mixed sizes growing seaward until only threads are left), the shell scans pressed into the
sand, and a domed clear coat. Rendering uses the Mac's GPU through Metal; the first run
also compiles shaders and builds the lace masks (cached in `blender/cache/`).

## Export from the command line

```sh
npm run export -- seashore --formats mp4 --size 1080x1350 --seconds 10 --bob 9
npm run export -- rose-cube --formats cutout,sprite --angles 12 --size 1200x1200
npm run export -- flower-coaster --formats mov,webm --surface none
npm run export -- ocean-slab --formats glb,usdz,stl
npm run export -- seashore --formats all
```

Files land in `exports/<piece>/`. Formats: `page` `png` `cutout` `sprite` `mp4`
`gif` `webm` `mov` `apng` `glb` `usdz` `stl` `obj` `web`. Options: `--size WxH`,
`--seconds`, `--fps`, `--angles`, `--surface`, `--bg '#hex'`, `--yaw`, `--tilt`,
`--bob` (the camera rises and dips over the turn), `--out`. The script starts its own dev server and a headless Chrome with GPU WebGL,
steps time exactly, and encodes with ffmpeg. 3D files are real size: 1 unit = 3 cm.

## Embed a piece

```ts
import { mountPiece } from './lib/piece.ts';
import { seashore } from './examples/seashore/seashore.ts';

const c = mountPiece(document.querySelector('#hero')!, seashore, { surface: 'none', backdrop: '#ffffff' });
c.pose(30);
const png = await c.snapshot({ width: 1080, height: 1080, matte: true }); // cutout
c.dispose();
```

In React, mount in `useEffect` and return `c.dispose`. The host element needs a size.
With `surface: 'none'`, set `backdrop` to the colour of the page behind it: the canvas
itself stays opaque because the resin refracts what is behind it.

## Write a new piece

A piece is a `PieceDef`: a name, camera framing, and a `build()` that adds meshes to
the turntable.

```ts
import * as THREE from 'three';
import type { PieceDef } from './lib/piece.ts';
import { resin, block } from './lib/resin.ts';
import { rose } from './lib/inclusions.ts';
import { contactShadow } from './lib/light.ts';

export const roseInACube: PieceDef = {
  name: 'rose-in-a-cube',
  studio: { elevation: 20, yaw: 32 },
  build(s) {
    s.turntable.add(new THREE.Mesh(block(1.7, 1.7, 1.7), resin({ tint: '#ffd9d4', depth: 14, thickness: 0.85 })));
    const r = rose({ color: '#ee6f6c' });
    r.scale.setScalar(1.6); r.position.y = 0.7;
    s.turntable.add(r, contactShadow(1.7, 1.7, { color: '#c98d88' }));
  },
};
```

What the library gives you:

| module | |
|---|---|
| `lib/resin.ts` | `resin()` material (transmissive, IOR 1.54); forms `block`, `pour`, `freeformOutline`, `slab`, `disc`, `rippleField`; `pigment()` for tint that deepens and swirls; `scatter()` |
| `lib/inclusions.ts` | `sandMaterial`, `foamTexture` (lace), `flat`, `shell` (ribbed valve), `snail` (spiral shell), `starfish`, `pebbles`, `beads` (pearls, bubbles), `glitter`, `pressed` flowers (daisy, five, hydrangea, lace, sprig, leaf), `rose` |
| `lib/assets.ts` | `scan()` loads a scanned GLB (meshopt, WebP) sized and resting on the sand; `ready()` |
| `lib/light.ts` | tinted `contactShadow` and animated `caustics` on the table |
| `lib/studio.ts`, `lib/surfaces.ts` | softbox light, tables, drag turntable with momentum, light sweep, `?debug` stepping |
| `lib/piece.ts`, `lib/export.ts` | `mountPiece()` and its controller; PNG, cutout and 3D export |
| `lib/noise.ts` | seeded `rng`, `noise2`, `fbm`, `cells` |

Three rules do most of the work, and `SKILL.md` has the rest:

- **Transmission, not opacity.** Resin is a `MeshPhysicalMaterial` with `transmission: 1`; low opacity looks like game glass.
- **Inclusions are opaque.** three.js only refracts opaque objects through transmissive ones, so flowers and foam are alpha-tested sheets and shells are solid meshes.
- **A patterned table.** Clear resin is only visible through what it bends; on a plain table it looks milky.

## Repo layout

| | |
|---|---|
| `SKILL.md`, `references/` | the skill: workflow, rules, and guides for style, pieces, inclusions, outputs, verification and video |
| `lib/` | the library above, nine TypeScript files, only dependency `three` |
| `assets/scans/` | CC0 shell and sea star scans used by the examples, with `CREDITS.md` |
| `examples/` | `seashore`, `ocean-slab`, `rose-cube`, `flower-coaster` |
| `blender/` | photoreal stills in Cycles: `seashore.py` (scene), `lace.py` (foam masks), `fetch_assets.sh` (CC0 textures and HDRI) |
| `scripts/` | `export.ts` (every deliverable), `scans.ts` (find and fetch CC0 scans), `capture.ts` (page screenshots), `cdp.ts` (headless Chrome driver) |
| `media/` | the images in this README |

## License

Code: MIT. Scans in `assets/scans/`: CC0, Smithsonian Institution (see
`assets/scans/CREDITS.md`); not endorsed by the Smithsonian.
