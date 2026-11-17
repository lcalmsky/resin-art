// Seeded 2D noise for surfaces and textures. Dependency-free.
// Everything that looks hand-made (wave crests, sand grain, petal veins, foam lace)
// comes from these few functions with a fixed seed, so a piece renders the same
// every time and two pieces with different seeds look like siblings, not copies.

export type Rand = () => number;

/** Mulberry32: small, fast, good enough for art. */
export function rng(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gradient noise in [-1, 1], tileable at `period` when given. */
export function noise2(seed = 1) {
  const r = rng(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = r() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x: number, y: number): number => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const g = (ix: number, iy: number, dx: number, dy: number) => {
      const h = perm[(ix & 255) + perm[iy & 255]];
      return gx[h] * dx + gy[h] * dy;
    };
    const u = fade(xf), v = fade(yf);
    const a = g(xi, yi, xf, yf), b = g(xi + 1, yi, xf - 1, yf);
    const c = g(xi, yi + 1, xf, yf - 1), d = g(xi + 1, yi + 1, xf - 1, yf - 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 1.414;
  };
}

/** Fractal sum. `ridged` folds each octave (1 - |n|), which gives the sharp creases
 * of a resin wave surface instead of soft hills. */
export function fbm(n: (x: number, y: number) => number, x: number, y: number,
  octaves = 4, ridged = false, lacunarity = 2.03, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    let v = n(x * f + i * 17.1, y * f - i * 9.3);
    if (ridged) v = 1 - Math.abs(v);
    sum += v * amp; norm += amp; amp *= gain; f *= lacunarity;
  }
  return sum / norm;
}

/** Cellular noise: distance to the nearest and second-nearest jittered point.
 * F2 - F1 is thin at cell borders, which is what foam lace and cells in poured
 * resin look like. */
export function cells(seed = 1) {
  const r = rng(seed);
  const jitter = new Float32Array(512);
  for (let i = 0; i < 512; i++) jitter[i] = r();
  const h = (x: number, y: number) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 256;
  return (x: number, y: number): [number, number] => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const k = h(xi + i, yi + j);
      const dx = xi + i + jitter[k * 2] - x, dy = yi + j + jitter[k * 2 + 1] - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return [f1, f2];
  };
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
