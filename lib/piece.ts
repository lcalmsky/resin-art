// A piece as a reusable component: a definition (studio framing + a build function)
// that can be mounted into any element, in a plain page, React, Vue or a CMS embed,
// and driven or exported through the returned controller.
import { studio, type Studio, type StudioOptions } from './studio.ts';
import { snapshot, exportModel, type SnapshotOptions, type ModelFormat } from './export.ts';
import type { Surface } from './surfaces.ts';

export interface PieceDef {
  name: string;
  /** Framing and table that suit this piece; mount options override them. */
  studio: StudioOptions;
  /** Add the piece (and its shadow/caustics) to `s.turntable`. Return an `update`
   * for anything that moves on its own. */
  build(s: Studio): { update?: (t: number, dt: number) => void } | void;
}

export interface ResinController {
  studio: Studio;
  snapshot(o?: SnapshotOptions): Promise<Blob>;
  exportModel(format: ModelFormat): Promise<Blob>;
  pose(yawDeg: number, tiltDeg?: number): void;
  setSpin(radPerSec: number): void;
  setSurface(kind: Surface): void;
  setBackdrop(color: string): void;
  dispose(): void;
}

/**
 * Mount a piece into `host` (which must have a size). Returns a controller.
 *
 * React: `useEffect(() => { const c = mountPiece(ref.current!, ocean); return () => c.dispose(); }, [])`
 */
export function mountPiece(host: HTMLElement, def: PieceDef, overrides: StudioOptions = {}): ResinController {
  const s = studio(host, { ...def.studio, ...overrides });
  const built = def.build(s) || {};
  s.run(built.update);
  return {
    studio: s,
    snapshot: (o) => snapshot(s, o),
    exportModel: (f) => exportModel(s, f),
    pose: s.pose, setSpin: s.setSpin, setSurface: s.setSurface, setBackdrop: s.setBackdrop,
    dispose: s.dispose,
  };
}

/** Save a blob in the browser as a file. */
export function download(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Base64 of a blob, for handing bytes to a headless driver over the DevTools protocol. */
export async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
