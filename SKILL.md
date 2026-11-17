---
name: resin-art
description: Build epoxy-resin art pieces with three.js and TypeScript — ocean pours with sand, foam lace and a wavy top, clear cubes with a rose or a dandelion inside, pressed-flower coasters, photo trays with shells and pearls — and deliver them as a web page or embeddable component, PNG with or without background (cutout), sprite sheets, turntable video (MP4, GIF, or with alpha as MOV/WebM/APNG), or 3D files (GLB, USDZ for AR, STL for printing). Use this whenever someone asks for resin art, epoxy art, a "bottled ocean"/바다 한조각 piece, a flower or object cast in a clear block, a pressed-flower coaster or tray, a 레진아트 component, render, image asset, 누끼, video or 3D model, or "make it look like this resin photo" — even if they never say "three.js" or "3D".
---

# Resin art

Pieces of cured epoxy, rendered in real time: a transmissive, refractive body with
things set inside it, on a table, under softbox light, turning slowly. The look
comes from what the resin does to light — refraction, glints on a wavy top,
tinted depth, coloured shadow — so most of the work is materials and composition,
not modelling.

This skill ships a small library (`lib/`), four examples (`examples/seashore`,
`examples/ocean-slab`, `examples/rose-cube`, `examples/flower-coaster`) and tools (`scripts/`). Read the
example closest to the request before writing anything.

## Deliverables

One piece definition produces every output: a web page or embeddable component,
PNG with the table, a cutout PNG without background, a sprite sheet of angles, a
turntable video (MP4, GIF, or with alpha as MOV/WebM/APNG), and 3D files (GLB, USDZ,
STL, OBJ). `references/outputs.md` has the full list and how each is made.

- **Infer the deliverable from the request.** "상세페이지 이미지" is a PNG, "누끼" or
  "for Figma" is a cutout, "for Unity" is a GLB, "릴스" is a 1080x1920 MP4. When the
  request says what it is for, don't ask; just make it.
- **Ask only when nothing points to a format**, once, before building, with
  `AskUserQuestion` (multi-select): web page/component, image (PNG or cutout), video
  (MP4 or with transparency), 3D file (GLB, USDZ, STL). "An asset" alone is ambiguous
  between 2D and 3D, so ask which.
- **Deliver with `npm run export`**, then open or list the files for the user.

## How people judge this work

They compare it to photos of real pieces on Instagram or a maker's shop. These read
as fake straight away, and each has a rule below:

- resin that looks milky or like frosted plastic instead of water-clear
- inclusions that are flat vector clip-art, or float in mid-air with no layer
- one uniform tint instead of colour that deepens with thickness and swirls
- a wave top that is a smooth sine bump, or so fine it reads as noise
- a black, opaque shadow under a clear object
- dark purple where the blue resin should be (tone mapping hue shift)
- everything in a piece the same size, centred, symmetric

## Workflow

1. **Pin the piece and the deliverables** before writing code. Read
   `references/style.md` and `references/outputs.md`. Decide the form (slab, block,
   pour), the size (1 unit = 3 cm), the tint, the inclusions, the table it sits on,
   and the outputs (inferred, or asked once if unclear). If there is a reference photo, list what you see in it layer by
   layer from the bottom up.
2. **Set up the project.** Copy `lib/` into the project (eight `.ts` files, only
   dependency is `three`); write the piece as a `PieceDef` like the examples and use Vite + TypeScript (`package.json`, `tsconfig.json`
   and `vite.config.ts` in this repo show the setup). No framework needed.
3. **Build one piece first** and show it (a still from `scripts/capture.ts`, next to
   the reference if there is one). Get a yes before building a set. A set built at
   once comes back as the same piece in different colours.
4. **Compose it in layers** with `references/pieces.md`: base layer (sand, pigment
   floor), mid layer (inclusions), body (resin geometry with pigment), top (waves or
   meniscus), then table effects (shadow, caustics).
5. **Make inclusions** with `references/inclusions.md`: all opaque or alpha-tested,
   because three.js only refracts opaque objects through transmissive ones.
6. **Verify** with `references/verify.md` before showing anything: typecheck, stills
   from several angles, a turntable strip, colour checks at the deepest tint.
7. **Export** what was asked with `npm run export -- <piece> --formats …`
   (`references/outputs.md`), check each file (a cutout over a dark and a light
   colour, a video's contact sheet, a GLB loaded back), then hand over the paths.

## Rules that make it work

- **Transmission, not opacity.** Resin is `resin()`: `MeshPhysicalMaterial` with
  `transmission: 1`, IOR 1.54, roughness ≈ 0.02. Never `transparent: true` with low
  opacity: that is glass in a game, not resin.
- **Inclusions are opaque.** Pressed flowers and foam are alpha-tested sheets
  (`flat()`), shells and roses are solid meshes. A semi-transparent inclusion
  disappears inside the resin.
- **Colour lives in the resin and below it.** Use `pigment()` for vertex-colour tint
  that follows depth (clear at the shore, teal, then blue), plus a pigmented floor
  sheet under deep areas. `attenuationColor` is for an even body tint (a blush pink
  cube), not for gradients.
- **The table shows the clarity.** Clear resin is only visible through what it bends.
  Use a patterned table (`surface: 'marble' | 'wood' | 'linen'`); on a plain table a
  clear piece looks milky. For a cutout the table doesn't matter: it is removed.
- **Background is opaque.** The transmission pass samples `scene.background`; an alpha
  canvas shows up as dark patches inside the resin. The card around the canvas uses
  the same backdrop colour.
- **Thickness is a look knob.** `thickness` sets how far the image behind shifts.
  Use about half the real thickness for cubes, or each face shows its own copy of the
  inclusion.
- **Neutral tone mapping.** ACES pushes saturated blue toward purple; the studio uses
  `NeutralToneMapping`, keep it.
- **Shadows are tinted decals.** `contactShadow()` with the resin's colour, plus
  `caustics()` offset away from the key light for wavy tops. No shadow maps.
- **Interaction is handling the piece.** Drag turns and tilts it on the turntable,
  it keeps a little momentum, then returns to a slow idle spin. The light sweeps a
  little so glints travel. No buttons in the card; one faint hint line.
- **New means new.** If the brief is "like this photo", match the form, tint and
  layering; invent the exact flower arrangement, shells and shoreline.

## Library at a glance

| module | what it gives you |
|---|---|
| `lib/piece.ts` | `PieceDef`, `mountPiece(host, def, opts)` → controller (`snapshot`, `exportModel`, `pose`, `setSpin`, `setSurface`, `setBackdrop`, `dispose`), `download` |
| `lib/studio.ts` | `studio(host, opts)`: softbox env, table, drag turntable, light sweep, `?debug` stepping, `pose` `setSpin` `setSurface` `setBackdrop` `dispose` |
| `lib/surfaces.ts` | table tops: `marble` `wood` `linen` `plain` `none` |
| `lib/export.ts` | `snapshot(studio, { width, height, matte })` → PNG blob; `exportModel(studio, 'glb' \| 'usdz' \| 'stl' \| 'obj')`; `CM_PER_UNIT` |
| `lib/resin.ts` | `resin()` material; forms `block` `pour` `freeformOutline` `slab` `disc` (round pour with a wave top) `rippleField`; `pigment()` vertex tint; `scatter()` |
| `lib/inclusions.ts` | `sandMaterial` `foamTexture` `flat` `shell` `beads` (pearls, bubbles) `glitter` `pressed` (daisy, five, hydrangea, lace, sprig, leaf) `rose` |
| `lib/light.ts` | `contactShadow` (tinted, rect or round) `caustics` (animated, additive); both tagged `userData.table` so cutouts and exports skip them |
| `lib/noise.ts` | seeded `rng` `noise2` `fbm` (ridged for wave creases) `cells` (foam lace) |

`studio().run(draw)` drives everything with `draw(t, dt)`. URL flags for checking:
`?debug` disables rAF and exposes `window.__step(seconds)` for exact stepping
(headless and background tabs throttle rAF); `?t=2.5` freezes time. Example pages
(`examples/page.ts`) also take `?still`, `?capture`, `?surface=`, `?bg=`, `?spin=`,
`?yaw=`, and show an export bar under the card.

## Scripts

- `scripts/export.ts <piece|url> --formats … [--size WxH] [--angles N] [--seconds S] [--fps N] [--surface s] [--bg #hex] [--yaw deg] [--out dir]` —
  every deliverable in one run (`npm run export`)
- `scripts/capture.ts <url?debug> <outDir> <frames> <fps> [w] [h] [setupJs] [frameJs]` —
  deterministic full-page screenshots, for checking layout and motion
- `scripts/cdp.ts` — the headless Chrome driver both use (Metal ANGLE, so WebGL works)

Runs with Node ≥ 22.18 (TypeScript is stripped natively) plus ffmpeg for encoding;
it finds a local Chrome/Chromium or uses `$CHROME`.
