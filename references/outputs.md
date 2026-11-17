# Outputs

Every piece is a `PieceDef` (see `lib/piece.ts`), so the same code produces all of
these. Pick the deliverables at the start of the job, since they change framing
(square for cutouts and sprites, 9:16 for reels, real size for 3D files).

## What the request implies

Read the request for the use, not just a format name. If the use implies the
deliverable, make it without asking. Ask only when nothing in the request points to
one.

| The request says | Deliver |
|---|---|
| a page, a component, "put it on our site", embed | `web` + the `PieceDef` module (mount with `mountPiece`) |
| product photo, thumbnail, 상세페이지, Instagram post | `png` (with table), size to the platform: 1080x1080, 1080x1350, 1600x900 |
| 누끼, cutout, transparent background, sticker, "as an asset" in a 2D context (Figma, slides, 2D game) | `cutout`; add `sprite` if it should turn or be shown from several sides |
| video, reel, shorts, 영상 | `mp4`; reels and shorts at 1080x1920 |
| footage to composite, for Premiere/After Effects/Final Cut | `mov` (ProRes 4444 with alpha) |
| an animated element on a web page over other content | `webm` (VP9 alpha); `apng` where WebM alpha isn't supported (Safari) |
| GIF for a README, chat, a quick share | `gif` |
| Blender, Unity, Unreal, three.js scene, a 3D asset | `glb` |
| iPhone/iPad AR, "view in my room" | `usdz` (plus `glb` for Android) |
| 3D printing, a mould master | `stl` (resin body only, in mm) |
| "an asset" with no hint whether 2D or 3D | ask (see below) |

## Asking

When the deliverable can't be inferred, ask once, before building, with
`AskUserQuestion` (multi-select), in the user's language:

- Web page / component (recommended default)
- Image: PNG with table, or cutout without background
- Video: MP4, or with transparency (MOV / WebM)
- 3D file: GLB (Blender, Unity, web), USDZ (iPhone AR), STL (3D print)

If the user says "anything" or doesn't answer the format part, deliver web + png +
cutout. Never ask about something the request already answered.

## Producing them

```sh
npm run export -- <piece> --formats png,cutout,glb [--size 1600x900] [--out dir]
npm run export -- <piece> --formats all
```

`<piece>` is a folder in `examples/` (the script starts its own dev server) or a URL
to any page that calls `examples/page.ts`. Files go to `exports/<piece>/`.

| format | file | notes |
|---|---|---|
| `page` | `<piece>-page.png` | screenshot of the card as framed on the page |
| `png` | `<piece>.png` | 3D scene at `--size`, table and backdrop included |
| `cutout` | `<piece>-cutout.png` | piece alone; resin keeps partial transparency and tint |
| `sprite` | `<piece>-sprite/aNNN.png`, `<piece>-sprite.png` | `--angles` square cutouts around the turntable, and a sheet |
| `mp4`, `gif` | `<piece>.mp4`, `.gif` | one full turn in `--seconds` at `--fps`, with table |
| `webm`, `mov`, `apng` | `<piece>-alpha.*` | the same turn with alpha |
| `glb` | `<piece>.glb` | glTF with transmission, IOR, volume, vertex-colour pigment; metres |
| `usdz` | `<piece>.usdz` | AR Quick Look; resin becomes a tinted see-through surface (no transmission in USD preview surfaces) |
| `stl` | `<piece>.stl` | resin body only, millimetres |
| `obj` | `<piece>.obj` | all geometry, centimetres, no materials |
| `web` | `web/` | static build of the site with relative paths |

Options: `--surface marble|wood|linen|plain|none`, `--bg '#hex'`, `--yaw deg`,
`--tilt deg` (camera elevation offset; it stays between 12° and 80°), `--bob deg` (the camera rises and dips by this much once over a video's turn, which reads less flat than a plain spin), `--angles N`, `--seconds S`, `--fps N`, `--size WxH`.

Real size: 1 world unit = 3 cm (`CM_PER_UNIT` in `lib/export.ts`). Build pieces at
that scale when the size matters (a 4 cm keychain is 1.33 units wide).

## How the cutout works

Resin isn't an object with a hard edge, so the matte is computed, not masked: the
frame is rendered once over black and once over white, with the table, shadow and
caustics hidden. Where the two agree the pixel is opaque; how far they differ is how
much background shows through. Clear resin comes out mostly transparent with its
highlights and tint kept, so it sits naturally on any background.

## Using the component

```ts
import { mountPiece } from './lib/piece.ts';
import { oceanSlab } from './examples/ocean-slab/ocean.ts';

const c = mountPiece(document.querySelector('#hero')!, oceanSlab, { surface: 'none', backdrop: '#eef3f5' });
c.pose(30); c.setSpin(0.3);
const png = await c.snapshot({ width: 1080, height: 1080, matte: true });
c.dispose();
```

React: `useEffect(() => { const c = mountPiece(ref.current!, oceanSlab); return () => c.dispose(); }, [])`.
The host element needs a size. With `surface: 'none'`, set `backdrop` to the colour
of the page behind it; the canvas itself can't be transparent (the resin samples it).

## In the example pages

Each example has an export bar under the card (surface, PNG, cutout, GLB, USDZ, STL,
OBJ) and URL flags: `?surface=wood`, `?bg=%23eef0f2`, `?spin=0.3`, `?yaw=30`,
`?still`, `?capture` (hides hint and bar), `?debug` (step time with `__step(s)`).
