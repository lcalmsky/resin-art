# Rendering to video

Use `scripts/export.ts`: it steps the page by exactly 1/fps, renders each frame at
the requested size, and encodes with ffmpeg. One full turn takes `--seconds`, so the
video loops seamlessly.

```sh
npm run export -- ocean-slab --formats mp4,gif --size 1920x1080 --seconds 8 --fps 30
npm run export -- ocean-slab --formats mp4 --size 1080x1920 --seconds 6     # reels / shorts
npm run export -- rose-cube --formats mov,webm --size 1080x1080            # with alpha, for compositing
```

- `mp4`/`gif` include the table; `mov` (ProRes 4444), `webm` (VP9) and `apng` are the
  piece alone with alpha.
- 1080p, 30 fps, 8 s is 240 frames, roughly 1–2 minutes.
- For a page recording instead (card and page background in frame), use
  `scripts/capture.ts` with a `?debug` URL and encode its frames yourself.
- For a product-shot feel, use `?still` and animate only the light sweep and caustics.
- GIF for a README: `ffmpeg -framerate 20 -i f%04d.png -vf "fps=12,scale=540:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" out.gif`.
