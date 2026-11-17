// Cured epoxy as a material, and the shapes it comes out of the mould in.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { noise2, fbm, rng } from './noise.ts';

export interface ResinOptions {
  /** Body tint seen through the full thickness. White is water-clear. */
  tint?: THREE.ColorRepresentation;
  /** World units of resin before the tint reaches full strength. Smaller = deeper colour. */
  depth?: number;
  /** 0 for a mirror-polished pour, 0.15+ for a sanded or matte-topcoat finish. */
  frost?: number;
  thickness?: number;
  /** A second glossy layer, as on a domed topcoat. Doubles reflections, so leave it off for thick cast blocks. */
  topcoat?: number;
  /** Per-vertex pigment (see `pigment()`); multiplies light passing through. */
  vertexColors?: boolean;
}

/** Clear casting resin: IOR 1.54, near-zero roughness. */
export function resin(o: ResinOptions = {}): THREE.MeshPhysicalMaterial {
  const tint = new THREE.Color(o.tint ?? '#ffffff');
  return new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    transmission: 1,
    ior: 1.54,
    thickness: o.thickness ?? 1,
    roughness: o.frost ?? 0.02,
    metalness: 0,
    clearcoat: o.topcoat ?? 0,
    clearcoatRoughness: 0.02,
    specularIntensity: 1,
    attenuationColor: tint,
    attenuationDistance: o.depth ?? (tint.equals(new THREE.Color('#ffffff')) ? Infinity : 2.5),
    envMapIntensity: 1,
    vertexColors: o.vertexColors ?? false,
    side: THREE.FrontSide,
  });
}

/** A cube or block from a silicone mould: slightly rounded edges, flat faces. */
export function block(w: number, h: number, d: number, radius = 0.06): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(w, h, d, 6, radius);
  g.translate(0, h / 2, 0);
  return g;
}

/** Outline of a free-form coaster: a circle whose rim wanders like resin that found
 * its own edge on a flat sheet. `lobes` adds the scalloped bumps of a petal mould. */
export function freeformOutline(r: number, o: { seed?: number; wander?: number; lobes?: number; lobeDepth?: number } = {}): THREE.Shape {
  const n = noise2(o.seed ?? 3);
  const shape = new THREE.Shape();
  const N = 220;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    let rr = r * (1 + (o.wander ?? 0.035) * n(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + 5));
    if (o.lobes) rr -= r * (o.lobeDepth ?? 0.02) * (0.5 - 0.5 * Math.cos(a * o.lobes));
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  return shape;
}

/** A flat pour (coaster, tray, plaque) from an outline: a domed meniscus edge where
 * surface tension rolled the resin over. Lies on the floor, top at y = height. */
export function pour(outline: THREE.Shape, height: number, meniscus = height * 0.45): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(outline, {
    depth: Math.max(0.001, height - meniscus * 2),
    bevelEnabled: true, bevelThickness: meniscus, bevelSize: meniscus * 0.9, bevelSegments: 8,
    curveSegments: 64, steps: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox!.min.y, 0);
  g.computeVertexNormals();
  return g;
}

/** Height of a poured wave surface at (x, z): wide, sharp-creased ripples that
 * catch the light the way a heat-gun-pushed ocean pour does. Returns 0..1. */
export function rippleField(seed = 7, scale = 1.4) {
  const n = noise2(seed), m = noise2(seed + 11);
  return (x: number, z: number) => {
    const wx = x * scale + 0.6 * m(x * 0.5, z * 0.5);
    const wz = z * scale * 1.35 + 0.6 * m(x * 0.5 + 9, z * 0.5 + 9);
    return fbm(n, wx, wz, 4, true, 2.1, 0.45);
  };
}

export interface SlabOptions {
  width: number;
  depth: number;
  /** Thickness at the flat bottom-to-rim of the side walls. */
  height: number;
  /** Peak-to-trough height of the top surface. */
  relief?: number;
  /** Surface shape at (x, z) in 0..1. Defaults to `rippleField()`. */
  surface?: (x: number, z: number) => number;
  /** Where the surface is calm (e.g. the shoreline), 0..1; multiplies relief. */
  calm?: (x: number, z: number) => number;
  segments?: number;
  /** Corner rounding of the footprint in world units. */
  corner?: number;
}

/** A closed slab whose top is a heightfield: the ocean block, a geode slice, a river
 * table segment. Vertices on the top carry `uv` = footprint position for pigment. */
export function slab(o: SlabOptions): THREE.BufferGeometry {
  const { width: W, depth: D, height: H } = o;
  const relief = o.relief ?? 0.12, segs = o.segments ?? 160;
  const surf = o.surface ?? rippleField();
  const calm = o.calm ?? (() => 1);
  const top = (x: number, z: number) => H + relief * (surf(x, z) - 0.5) * calm(x, z);

  const nx = segs, nz = Math.max(2, Math.round(segs * D / W));
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const add = (x: number, y: number, z: number) => { pos.push(x, y, z); uv.push(x / W + 0.5, z / D + 0.5); return pos.length / 3 - 1; };

  // top grid
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = (i / nx - 0.5) * W, z = (j / nz - 0.5) * D;
    add(x, top(x, z), z);
  }
  const T = (i: number, j: number) => j * (nx + 1) + i;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = T(i, j), b = T(i + 1, j), c = T(i, j + 1), d = T(i + 1, j + 1);
    idx.push(a, c, b, b, c, d);
  }
  // perimeter, counter-clockwise seen from above, sharing x/z with the top edge
  const ring: [number, number][] = [];
  for (let i = 0; i < nx; i++) ring.push([i, nz]);
  for (let j = nz; j > 0; j--) ring.push([nx, j]);
  for (let i = nx; i > 0; i--) ring.push([i, 0]);
  for (let j = 0; j < nz; j++) ring.push([0, j]);
  const wallTop: number[] = [], wallBot: number[] = [];
  for (const [i, j] of ring) {
    const x = (i / nx - 0.5) * W, z = (j / nz - 0.5) * D;
    wallTop.push(add(x, top(x, z), z));
    wallBot.push(add(x, 0, z));
  }
  for (let k = 0; k < ring.length; k++) {
    const k2 = (k + 1) % ring.length;
    idx.push(wallTop[k], wallBot[k], wallTop[k2], wallTop[k2], wallBot[k], wallBot[k2]);
  }
  // bottom, with its own vertices so its normal doesn't bleed into the walls
  const center = add(0, 0, 0);
  const floorRing = ring.map(([i, j]) => add((i / nx - 0.5) * W, 0, (j / nz - 0.5) * D));
  for (let k = 0; k < ring.length; k++) idx.push(center, floorRing[(k + 1) % ring.length], floorRing[k]);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // Top, walls and bottom have separate vertices, so the wave top shades smoothly
  // while the rim stays a hard polished edge.
  g.computeVertexNormals();
  return g;
}

export interface DiscOptions {
  /** Base radius; the rim wanders around it like resin that found its own edge. */
  radius: number;
  height: number;
  relief?: number;
  surface?: (x: number, z: number) => number;
  calm?: (x: number, z: number) => number;
  /** How far the rim wanders, as a fraction of the radius. */
  wander?: number;
  seed?: number;
  rings?: number;
  segments?: number;
  /** Fraction of the radius over which the top rolls down into a rounded rim. */
  meniscus?: number;
}

/** A round pour with a heightfield top: the "piece of the sea" tray or coaster with
 * a wave surface. Like `slab()`, but on a wandering circular footprint with a rim
 * that rolls over the way surface tension leaves it. Use `discRadius()` to place
 * things inside it. */
export function disc(o: DiscOptions): THREE.BufferGeometry {
  const H = o.height, relief = o.relief ?? 0.12, surf = o.surface ?? rippleField(), calm = o.calm ?? (() => 1);
  const NR = o.rings ?? 90, NA = o.segments ?? 360, men = o.meniscus ?? 0.07;
  const R = discRadius(o.radius, o.wander ?? 0.035, o.seed ?? 3);
  const top = (x: number, z: number, rho: number) => {
    const roll = smoothstep(1 - men, 1, rho);
    return (H + relief * (surf(x, z) - 0.5) * calm(x, z)) * (1 - 0.45 * roll * roll);
  };
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const D = o.radius * 2.2;
  const add = (x: number, y: number, z: number) => { pos.push(x, y, z); uv.push(x / D + 0.5, z / D + 0.5); return pos.length / 3 - 1; };
  const c0 = add(0, top(0, 0, 0), 0);
  const ringIdx: number[][] = [];
  for (let j = 1; j <= NR; j++) {
    const rho = j / NR, row: number[] = [];
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * Math.PI * 2, r = R(a) * rho;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      row.push(add(x, top(x, z, rho), z));
    }
    ringIdx.push(row);
  }
  for (let i = 0; i < NA; i++) idx.push(c0, ringIdx[0][(i + 1) % NA], ringIdx[0][i]);
  for (let j = 0; j < NR - 1; j++) for (let i = 0; i < NA; i++) {
    const i2 = (i + 1) % NA, a = ringIdx[j][i], b = ringIdx[j][i2], c = ringIdx[j + 1][i], d = ringIdx[j + 1][i2];
    idx.push(a, b, c, b, d, c);
  }
  // wall and bottom with their own vertices, so the rim stays a crisp edge
  const wt: number[] = [], wb: number[] = [], fb: number[] = [];
  for (let i = 0; i < NA; i++) {
    const a = (i / NA) * Math.PI * 2, r = R(a), x = Math.cos(a) * r, z = Math.sin(a) * r;
    wt.push(add(x, top(x, z, 1), z)); wb.push(add(x, 0, z)); fb.push(add(x, 0, z));
  }
  for (let i = 0; i < NA; i++) { const i2 = (i + 1) % NA; idx.push(wt[i], wt[i2], wb[i], wt[i2], wb[i2], wb[i]); }
  const cb = add(0, 0, 0);
  for (let i = 0; i < NA; i++) idx.push(cb, fb[i], fb[(i + 1) % NA]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The rim radius of a `disc()` at angle `a` (radians, from +x toward +z). */
export function discRadius(radius: number, wander = 0.035, seed = 3) {
  const n = noise2(seed);
  return (a: number) => radius * (1 + wander * n(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + 5));
}

function smoothstep(a: number, b: number, v: number) { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

export interface PigmentStop { at: number; color: THREE.ColorRepresentation }

/** Paint a gradient of tint into a geometry's vertex colours along `axis(x, y, z)`
 * (0..1), with noise so it swirls like pigment that was dragged rather than
 * airbrushed. Use with `resin({ vertexColors: true })`. */
export function pigment(g: THREE.BufferGeometry, stops: PigmentStop[], axis: (x: number, y: number, z: number) => number,
  o: { swirl?: number; seed?: number; scale?: number } = {}): THREE.BufferGeometry {
  const n = noise2(o.seed ?? 5), swirl = o.swirl ?? 0.12, sc = o.scale ?? 1.3;
  const cols = stops.map((s) => ({ at: s.at, c: new THREE.Color(s.color) }));
  const p = g.getAttribute('position');
  const out = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const v = THREE.MathUtils.clamp(axis(x, y, z) + swirl * fbm(n, x * sc, z * sc, 3), 0, 1);
    let k = 0;
    while (k < cols.length - 2 && v > cols[k + 1].at) k++;
    const a = cols[k], b = cols[Math.min(k + 1, cols.length - 1)];
    c.copy(a.c).lerp(b.c, THREE.MathUtils.clamp((v - a.at) / Math.max(1e-6, b.at - a.at), 0, 1));
    out.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return g;
}

/** Scatter points inside a box with a seeded generator; for placing inclusions. */
export function scatter(n: number, box: { x: [number, number]; y: [number, number]; z: [number, number] }, seed = 1,
  keep: (x: number, y: number, z: number) => boolean = () => true): THREE.Vector3[] {
  const r = rng(seed), out: THREE.Vector3[] = [];
  for (let tries = 0; out.length < n && tries < n * 50; tries++) {
    const x = box.x[0] + r() * (box.x[1] - box.x[0]), y = box.y[0] + r() * (box.y[1] - box.y[0]), z = box.z[0] + r() * (box.z[1] - box.z[0]);
    if (keep(x, y, z)) out.push(new THREE.Vector3(x, y, z));
  }
  return out;
}
