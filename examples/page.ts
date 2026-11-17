// Shared page shell for the examples: mounts a piece into the card, applies URL
// flags, adds an export bar under the card, and exposes `window.__resin` for
// scripts/export.ts.
//
// URL flags: ?surface=marble|wood|linen|plain|none  ?bg=%23eef0f2  ?spin=0.3  ?yaw=30
//            ?still (no idle spin)  ?capture (hide hint and export bar)  ?debug (step time by hand)
import { mountPiece, download, base64, type PieceDef } from '../lib/piece.ts';
import { SURFACES, type Surface } from '../lib/surfaces.ts';
import type { StudioOptions } from '../lib/studio.ts';
import type { SnapshotOptions, ModelFormat } from '../lib/export.ts';

export function page(def: PieceDef) {
  const q = new URLSearchParams(location.search);
  if (q.has('capture')) document.body.classList.add('capture');
  const o: StudioOptions = {};
  if (q.has('surface')) o.surface = q.get('surface') as Surface;
  if (q.has('bg')) o.backdrop = q.get('bg')!;
  if (q.has('spin')) o.spin = Number(q.get('spin'));
  if (q.has('still')) o.spin = 0;
  if (q.has('yaw')) o.yaw = Number(q.get('yaw'));
  const backdrop = o.backdrop ?? def.studio.backdrop;
  if (backdrop) document.documentElement.style.setProperty('--card', backdrop);

  const c = mountPiece(document.querySelector<HTMLElement>('#stage')!, def, o);
  const stamp = () => `${def.name}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}`;

  const bar = document.querySelector<HTMLElement>('.tools');
  if (bar) {
    const surface = document.createElement('select');
    surface.id = 'surface';
    surface.setAttribute('aria-label', 'Table surface');
    for (const k of SURFACES) surface.add(new Option(k, k, false, k === (o.surface ?? def.studio.surface ?? 'marble')));
    surface.onchange = () => c.setSurface(surface.value as Surface);
    const button = (label: string, run: () => Promise<void>) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.onclick = async () => { b.disabled = true; try { await run(); } finally { b.disabled = false; } };
      // Exports taken before scans finish loading would leave them out.
      b.disabled = true;
      c.ready.then(() => { b.disabled = false; });
      return b;
    };
    bar.append(surface,
      button('PNG', async () => download(await c.snapshot({ width: 2400, height: 1350 }), `${stamp()}.png`)),
      button('PNG, no background', async () => download(await c.snapshot({ width: 2000, height: 2000, matte: true }), `${stamp()}-cutout.png`)),
      ...(['glb', 'usdz', 'stl', 'obj'] as ModelFormat[]).map((f) => button(f.toUpperCase(), async () => download(await c.exportModel(f), `${def.name}.${f}`))),
    );
  }

  Object.assign(window, {
    __resin: {
      ...c,
      name: def.name,
      snapshot64: async (opts: SnapshotOptions) => base64(await c.snapshot(opts)),
      model64: async (f: ModelFormat) => base64(await c.exportModel(f)),
      loaded: false,
    },
  });
  c.ready.then(() => { (window as unknown as { __resin: { loaded: boolean } }).__resin.loaded = true; });
}
