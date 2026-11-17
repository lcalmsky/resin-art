// Deterministic page capture: every frame is a screenshot of the whole page (card,
// page background and all), advanced by exactly 1/fps with ?debug stepping.
// For assets of the piece itself, use scripts/export.ts.
//
//   node scripts/capture.ts <url?debug> <outDir> <frames> <fps> [width] [height] [setupJs] [perFrameJs]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './cdp.ts';

const [url, outDir, framesArg, fpsArg, wArg, hArg, setupJs = '', frameJs = ''] = process.argv.slice(2);
if (!url || !outDir || !framesArg) { console.error('usage: capture.ts <url?debug> <outDir> <frames> <fps> [w] [h] [setupJs] [perFrameJs]'); process.exit(1); }
const FRAMES = +framesArg, FPS = +(fpsArg || 30), W = +(wArg || 1920), H = +(hArg || 1080);

mkdirSync(outDir, { recursive: true });
const b = await launch(W, H);
try {
  await b.open(url, 'typeof __step === "function"');
  if (setupJs) await b.evalJs(setupJs);
  const t0 = Date.now();
  for (let i = 0; i < FRAMES; i++) {
    if (i > 0) await b.evalJs(`__step(${1 / FPS})`);
    if (frameJs) await b.evalJs(frameJs);
    writeFileSync(join(outDir, `f${String(i).padStart(4, '0')}.png`), await b.screenshot());
    if (i % 60 === 0) process.stdout.write(`frame ${i}/${FRAMES}  ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  }
  console.log(`done: ${FRAMES} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (b.errors.length) { console.error('page errors:\n' + [...new Set(b.errors)].join('\n')); process.exitCode = 2; }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  b.close();
}
