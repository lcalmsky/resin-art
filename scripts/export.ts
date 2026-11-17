// One command for every deliverable of a piece: images, cutouts, sprite sheets,
// turntable videos (with or without alpha), 3D models and the static web page.
//
//   node scripts/export.ts <piece|url> [--formats png,cutout,glb] [--out exports/<piece>]
//        [--size 1600x900] [--angles 8] [--seconds 6] [--fps 30]
//        [--surface marble|wood|linen|plain|none] [--bg '#f3f1ee'] [--yaw 30] [--tilt 0]
//
// <piece> is a folder in examples/ (a dev server is started for it), or a full URL
// to a page that calls examples/page.ts. `--formats all` exports everything.
//
// formats
//   page      screenshot of the page as framed (card on its background)
//   png       the 3D scene at --size, with table and backdrop
//   cutout    the piece alone on a transparent background
//   sprite    --angles cutouts around the turntable, as frames and one sheet
//   mp4 gif   a full turn in --seconds, with table
//   webm mov apng   a full turn with alpha (VP9, ProRes 4444, animated PNG)
//   glb usdz stl obj   the piece as a 3D file in real size (1 unit = 3 cm)
//   web       static build of the site (vite build) to <out>/web
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { launch } from './cdp.ts';

const ALL = ['page', 'png', 'cutout', 'sprite', 'mp4', 'gif', 'webm', 'mov', 'apng', 'glb', 'usdz', 'stl', 'obj', 'web'] as const;
type Format = (typeof ALL)[number];

const args = process.argv.slice(2);
const USAGE = 'usage: export.ts <piece|url> [--formats png,cutout,glb|all] [--out dir] [--size WxH] [--angles N] [--seconds S] [--fps N] [--surface s] [--bg #hex] [--yaw deg] [--tilt deg]';
const fail = (msg: string): never => { console.error(`${msg}\n${USAGE}`); process.exit(1); };
const opt = (k: string, d?: string) => {
  const i = args.indexOf(`--${k}`);
  if (i < 0) return d;
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) fail(`--${k} needs a value`);
  return v;
};
const num = (k: string, d: string, min: number) => { const v = Number(opt(k, d)); if (!Number.isFinite(v) || v < min) fail(`--${k} must be a number ≥ ${min}`); return v; };
const target: string = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? fail('missing <piece|url>');

const root = resolve(import.meta.dirname, '..');
const fmtArg = opt('formats', 'png,cutout,glb')!;
const formats = (fmtArg === 'all' ? [...ALL] : fmtArg.split(',').map((s) => s.trim())) as Format[];
const bad = formats.filter((f) => !ALL.includes(f));
if (bad.length) { console.error(`unknown format(s): ${bad.join(', ')}. known: ${ALL.join(', ')}`); process.exit(1); }
const name = target.startsWith('http') ? new URL(target).pathname.split('/').filter(Boolean).pop() || 'piece' : target;
const out = resolve(opt('out', join(root, 'exports', name))!);
const sizeArg = opt('size', '1600x900')!;
if (!/^\d+x\d+$/.test(sizeArg)) fail(`--size must look like 1600x900, got ${sizeArg}`);
const [W, H] = sizeArg.split('x').map(Number);
const ANGLES = num('angles', '8', 1), SECONDS = num('seconds', '6', 0.1), FPS = num('fps', '30', 1);
for (const k of ['yaw', 'tilt']) { const v = opt(k); if (v !== undefined && !Number.isFinite(Number(v))) fail(`--${k} must be a number`); }
if (target!.startsWith('http') && formats.includes('web')) fail('--formats web builds this repo\'s site, so it only works with a piece name, not a URL');
mkdirSync(out, { recursive: true });

const ffmpeg = (a: string[]) => {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...a], { stdio: 'inherit' });
  if (r.error) throw new Error(`ffmpeg could not run (${r.error.message}); install ffmpeg for video and sprite formats`);
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${a.join(' ')}`);
};
const done: string[] = [];
const wrote = (p: string) => { done.push(p); console.log(`  ${p}`); };

let server: ChildProcess | null = null;
const freePort = () => new Promise<number>((res, rej) => {
  const s = createServer().once('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); });
});
async function pageUrl(): Promise<string> {
  const flags = new URLSearchParams({ debug: '', capture: '' });
  for (const k of ['surface', 'bg', 'yaw']) { const v = opt(k); if (v) flags.set(k, v); }
  const qs = flags.toString().replace(/=(&|$)/g, '$1');
  if (target!.startsWith('http')) { const u = new URL(target!); return `${u.origin}${u.pathname}?${qs}${u.search ? '&' + u.search.slice(1) : ''}${u.hash}`; }
  if (!existsSync(join(root, 'examples', target!, 'index.html'))) throw new Error(`no examples/${target}/index.html`);
  const port = await freePort();
  server = spawn(join(root, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 150)); }
  return `${base}/examples/${target}/?${qs}`;
}

const needsBrowser = formats.some((f) => f !== 'web');
try {
  if (needsBrowser) {
    const url = await pageUrl();
    console.log(`exporting ${name} from ${url}`);
    const b = await launch(W, H);
    try {
      await b.open(url, 'window.__resin && typeof __step === "function"');
      const tilt = Number(opt('tilt', '0'));
      const yaw0 = Number(opt('yaw', 'NaN'));
      const startYaw = Number.isNaN(yaw0) ? await b.evalJs('__resin.studio.turntable.rotation.y * 180 / Math.PI') : yaw0;
      const pose = (deg: number) => b.evalJs(`__resin.pose(${deg}, ${tilt}); __resin.studio.render(); true`);
      const shot = async (file: string, matte: boolean, w = W, h = H) => writeFileSync(file, Buffer.from(await b.evalJs(`__resin.snapshot64({ width: ${w}, height: ${h}, matte: ${matte} })`), 'base64'));

      if (formats.includes('page')) { await pose(startYaw); writeFileSync(join(out, `${name}-page.png`), await b.screenshot()); wrote(`${name}-page.png`); }
      if (formats.includes('png')) { await pose(startYaw); await shot(join(out, `${name}.png`), false); wrote(`${name}.png`); }
      if (formats.includes('cutout')) { await pose(startYaw); await shot(join(out, `${name}-cutout.png`), true); wrote(`${name}-cutout.png`); }

      if (formats.includes('sprite')) {
        const dir = join(out, `${name}-sprite`); mkdirSync(dir, { recursive: true });
        const side = Math.min(W, H);
        for (let i = 0; i < ANGLES; i++) { await pose(startYaw + (360 * i) / ANGLES); await shot(join(dir, `a${String(i).padStart(3, '0')}.png`), true, side, side); }
        const cols = Math.ceil(Math.sqrt(ANGLES)), rows = Math.ceil(ANGLES / cols);
        ffmpeg(['-i', join(dir, 'a%03d.png'), '-vf', `tile=${cols}x${rows}`, '-frames:v', '1', join(out, `${name}-sprite.png`)]);
        wrote(`${name}-sprite/ (${ANGLES} frames)`); wrote(`${name}-sprite.png (${cols}x${rows})`);
      }

      const turn = async (matte: boolean): Promise<string> => {
        const dir = join(out, `.frames-${matte ? 'alpha' : 'opaque'}`);
        rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
        const n = Math.round(SECONDS * FPS);
        await pose(startYaw);
        await b.evalJs(`__resin.setSpin(${(2 * Math.PI) / SECONDS}); true`);
        for (let i = 0; i < n; i++) {
          if (i > 0) await b.evalJs(`__step(${1 / FPS})`);
          await shot(join(dir, `f${String(i).padStart(4, '0')}.png`), matte);
          if (i % 30 === 0) process.stdout.write(`  ${matte ? 'alpha' : 'opaque'} frame ${i}/${n}\n`);
        }
        return join(dir, 'f%04d.png');
      };
      if (formats.some((f) => f === 'mp4' || f === 'gif')) {
        const seq = await turn(false);
        if (formats.includes('mp4')) { ffmpeg(['-framerate', String(FPS), '-i', seq, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(out, `${name}.mp4`)]); wrote(`${name}.mp4`); }
        if (formats.includes('gif')) { ffmpeg(['-framerate', String(FPS), '-i', seq, '-vf', `fps=${Math.min(FPS, 15)},scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, join(out, `${name}.gif`)]); wrote(`${name}.gif`); }
      }
      if (formats.some((f) => f === 'webm' || f === 'mov' || f === 'apng')) {
        const seq = await turn(true);
        if (formats.includes('webm')) { ffmpeg(['-framerate', String(FPS), '-i', seq, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '26', '-auto-alt-ref', '0', join(out, `${name}-alpha.webm`)]); wrote(`${name}-alpha.webm`); }
        if (formats.includes('mov')) { ffmpeg(['-framerate', String(FPS), '-i', seq, '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', join(out, `${name}-alpha.mov`)]); wrote(`${name}-alpha.mov`); }
        if (formats.includes('apng')) { ffmpeg(['-framerate', String(FPS), '-i', seq, '-vf', `fps=${Math.min(FPS, 15)},scale=${Math.min(W, 720)}:-1:flags=lanczos`, '-plays', '0', '-f', 'apng', join(out, `${name}-alpha.apng`)]); wrote(`${name}-alpha.apng`); }
      }

      for (const f of ['glb', 'usdz', 'stl', 'obj'] as const) {
        if (!formats.includes(f)) continue;
        writeFileSync(join(out, `${name}.${f}`), Buffer.from(await b.evalJs(`__resin.model64('${f}')`), 'base64'));
        wrote(`${name}.${f}`);
      }
      if (b.errors.length) { console.error('page errors:\n' + [...new Set(b.errors)].join('\n')); process.exitCode = 2; }
    } finally {
      b.close();
      for (const d of ['.frames-alpha', '.frames-opaque']) rmSync(join(out, d), { recursive: true, force: true });
    }
  }
  if (formats.includes('web')) {
    const r = spawnSync(join(root, 'node_modules/.bin/vite'), ['build', '--outDir', join(out, 'web'), '--emptyOutDir', '--base', './'], { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) throw new Error('vite build failed');
    wrote('web/ (static site; open web/index.html through any static server)');
  }
  console.log(`done → ${out}`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  (server as ChildProcess | null)?.kill();
}
