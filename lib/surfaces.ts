// Table tops for the studio. Clear resin is only visible through what it bends, so
// every surface except `plain` carries some pattern for the piece to refract.
import * as THREE from 'three';
import { noise2, fbm, rng } from './noise.ts';

export type Surface = 'marble' | 'wood' | 'linen' | 'plain' | 'none';
export const SURFACES: Surface[] = ['marble', 'wood', 'linen', 'plain', 'none'];

/** Floor colour and texture for a surface. `color` multiplies the map. */
export function surfaceLook(kind: Surface, backdrop: THREE.Color): { color: THREE.Color; map: THREE.Texture | null; roughness: number } {
  switch (kind) {
    case 'marble': return { color: backdrop.clone().multiplyScalar(0.93), map: tile(marble(), 7), roughness: 0.6 };
    case 'wood': return { color: new THREE.Color('#ffffff'), map: tile(wood(), 6), roughness: 0.7 };
    case 'linen': return { color: backdrop.clone().multiplyScalar(0.95), map: tile(linen(), 1.5), roughness: 1 };
    default: return { color: backdrop.clone().multiplyScalar(0.93), map: null, roughness: 0.9 };
  }
}

function tile(c: HTMLCanvasElement, units: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // Mirrored, because the noise behind these patterns doesn't tile: plain repeat leaves a seam.
  t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
  t.repeat.set(60 / units, 60 / units);
  t.anisotropy = 8;
  return t;
}

function paint(S: number, px: (u: number, v: number) => [number, number, number]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!, img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const [r, gg, b] = px(x / S, y / S), i = (y * S + x) * 4;
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Pale marble: a few soft grey veins. */
function marble(): HTMLCanvasElement {
  const n = noise2(77), w = noise2(78);
  return paint(1024, (x, y) => {
    const u = x * 4, v = y * 4;
    const warp = 1.1 * fbm(w, u * 0.4, v * 0.4, 3);
    const vein = Math.abs(Math.sin((u * 0.9 + v * 0.5 + warp) * Math.PI));
    const fine = Math.abs(Math.sin((u * 2.2 - v * 1.1 + 2.3 * fbm(n, u, v, 4)) * Math.PI));
    const dark = 0.2 * Math.pow(1 - vein, 10) + 0.08 * Math.pow(1 - fine, 18) + 0.035 * fbm(n, u * 3, v * 3, 3);
    const k = 255 * (1 - dark);
    return [k - 255 * dark * 0.08, k, k];
  });
}

/** Light oak planks: growth rings warped by noise, plank seams, a little colour shift per plank. */
function wood(): HTMLCanvasElement {
  const n = noise2(91), r = rng(92), planks = 4;
  const shift = Array.from({ length: planks }, () => (r() - 0.5) * 0.12);
  return paint(1024, (x, y) => {
    const p = Math.floor(y * planks), py = y * planks - p;
    const ring = Math.pow(0.5 + 0.5 * Math.sin((py * 14 + 2.6 * fbm(n, x * 1.1 + p * 7, py * 1.3, 4)) * Math.PI * 2), 3);
    const grain = 0.5 + 0.5 * fbm(n, x * 2.5 + p * 3, py * 140, 2);
    const seam = py < 0.012 || py > 0.988 ? 0.55 : 1;
    const k = (0.86 - 0.08 * ring + 0.07 * grain + shift[p]) * seam;
    return [232 * k, 204 * k, 165 * k];
  });
}

/** Undyed linen: a plain weave with slub threads. */
function linen(): HTMLCanvasElement {
  const n = noise2(61);
  return paint(512, (x, y) => {
    const warp = 0.5 + 0.5 * Math.sin(x * 512 * Math.PI * 0.5), weft = 0.5 + 0.5 * Math.sin(y * 512 * Math.PI * 0.5);
    const slub = fbm(n, x * 3, y * 90, 2) * 0.08 + fbm(n, x * 90, y * 3, 2) * 0.08;
    const k = 0.9 + 0.05 * (warp * weft) - 0.05 * Math.abs(warp - weft) + slub;
    return [240 * k, 234 * k, 222 * k];
  });
}
