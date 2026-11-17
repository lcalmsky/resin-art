# Verifying

Check what the person will check — the piece next to a real photo, from more than one
side — before showing anything.

## 1. Types and build

```sh
npm run typecheck
npm run build
```

## 2. Stills

```sh
npm run dev
node scripts/capture.ts "http://localhost:5173/examples/ocean-slab/?debug&capture&still" captures/ocean 1 30 1600 900
```

`capture.ts` runs headless Chrome with Metal ANGLE so WebGL works; it exits non-zero
and prints page errors if the page threw. Look at the PNG with these questions:

- Is the resin clear? Marble veins must be visible and bent through it.
- Does the deepest tint stay blue/teal, not violet?
- Do inclusions sit in layers, with nothing floating or poking out of the top?
- Is any shadow black or square under a round piece?
- Are flowers textured, not flat colour?

## 3. Turntable strip

```sh
node scripts/capture.ts "http://localhost:5173/examples/rose-cube/?debug&capture" captures/turn 8 1 960 540
ffmpeg -i captures/turn/f%04d.png -vf "scale=320:-1,tile=4x2" -frames:v 1 -update 1 strip.png
```

One frame per second of idle spin. Check every side: duplicated inclusions through
two faces (lower `thickness`), walls that go milky at grazing angles, glints moving.

## 4. Interaction

Drag in a real tab: the piece follows, keeps momentum, tilt springs back, idle spin
resumes. The canvas needs `touch-action: none` (the studio sets it).

## 5. Exports

After `npm run export`, check each file the person will use:

- cutout: composite over a dark and a light colour
  (`ffmpeg -f lavfi -i color=c=0x1d2a3a:s=1600x900 -i x-cutout.png -filter_complex overlay -frames:v 1 dark.png`);
  the table must be gone and clear resin must show the colour through it
- video: a contact sheet (`ffmpeg -i x.mp4 -vf "fps=1,scale=320:-1,tile=4x2" -frames:v 1 sheet.png`);
  `ffprobe` shows `yuva444p12le` for MOV and `alpha_mode=1` for WebM
- GLB: load it back with `GLTFLoader` in the dev page and check mesh count, that the
  resin material still has `transmission`, and that the bounding box is the real size
- STL: triangle count is non-zero and size is in millimetres

## 6. Frame rate

In a foreground tab, count rAF callbacks for 3 s; expect ~60 at 1080p. Transmission
renders the scene twice; if it drops, lower slab `segments` before anything else.
