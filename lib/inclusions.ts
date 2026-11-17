// What gets set into the resin: sand, foam lace, shells, pearls, glitter, pressed
// flowers, a dried rose. Everything here is opaque (or alpha-tested): three.js
// refracts only opaque objects through transmissive ones, so a semi-transparent
// inclusion would vanish inside the resin.
import * as THREE from 'three';
import { noise2, cells, fbm, rng, smooth, clamp, type Rand } from './noise.ts';

// ---------------------------------------------------------------- canvas helpers

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}
function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- sand

/** Beach sand: a matte base with per-grain colour variation computed from world
 * position, so it reads as grains on every face without UV stretching. */
export function sandMaterial(base: THREE.ColorRepresentation = '#d8c39c', o: { grain?: number; specks?: number } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: base, roughness: 0.95 });
  const grain = (o.grain ?? 420).toFixed(1), specks = (o.specks ?? 0.03).toFixed(3);
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSandPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSandPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vSandPos;
float sandHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 g = floor(vSandPos * ${grain});
  float h = sandHash(g), h2 = sandHash(g + 7.31);
  diffuseColor.rgb *= 0.78 + 0.38 * h;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.15, 0.12), step(1.0 - ${specks}, h2));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.98, 0.97, 0.93), step(0.985, sandHash(g + 3.7)) * 0.8);
}`);
  };
  m.userData.exportMaterial = new THREE.MeshStandardMaterial({ color: base, roughness: 0.95, map: grainTexture() });
  return m;
}

/** A tiling grain texture standing in for the sand shader in exported models. */
function grainTexture(): THREE.CanvasTexture {
  const S = 256, [c, g] = canvas(S), r = rng(17), img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    let k = 0.78 + 0.38 * r();
    if (r() < 0.03) k = 0.25;
    else if (r() < 0.015) k = 1.25;
    const v = Math.min(255, 255 * k / 1.16);
    img.data.set([v, v, v, 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(12, 12);
  t.magFilter = THREE.NearestFilter;
  return t;
}

// ---------------------------------------------------------------- foam lace

/** White lacing where waves break: a band of cellular foam that is dense at the
 * crest line and breaks into isolated rings as it runs up the shore.
 * `band(u, v)` → 0..1 says where foam lives on the texture (u along shore, v across). */
export function foamTexture(o: { size?: number; seed?: number; cellScale?: number; band?: (u: number, v: number) => number } = {}): THREE.CanvasTexture {
  const S = o.size ?? 1024, [c, g] = canvas(S);
  const cl = cells(o.seed ?? 9), n = noise2((o.seed ?? 9) + 1);
  const band = o.band ?? ((u, v) => smooth(0.25, 0.45, v) * (1 - smooth(0.55, 0.8, v)));
  const img = g.createImageData(S, S), sc = o.cellScale ?? 26;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const wob = 0.08 * fbm(n, u * 4, v * 4, 3);
    const b = band(u, v + wob);
    const [f1, f2] = cl(u * sc, v * sc * 1.6);
    const edge = 1 - smooth(0.0, 0.07 + 0.12 * b, f2 - f1);
    const solid = smooth(0.85, 1.0, b + 0.15 * fbm(n, u * 9, v * 9, 2)) * 0.9;
    const a = clamp(Math.max(edge * smooth(0.05, 0.4, b), solid));
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 250;
    img.data[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return texture(c);
}

/** A flat alpha-tested sheet for foam or a pressed flower, lying in the XZ plane. */
export function flat(map: THREE.Texture, w: number, h = w, o: { roughness?: number; tint?: THREE.ColorRepresentation } = {}): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: o.roughness ?? 0.55, color: o.tint ?? '#ffffff',
  }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

// ---------------------------------------------------------------- shells, pearls, glitter

/** Build an indexed mesh from a (u, v) grid. `at(u, v)` returns [x, y, z, r, g, b]. */
function gridMesh(U: number, V: number, at: (u: number, v: number) => number[]): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let j = 0; j <= V; j++) for (let i = 0; i <= U; i++) {
    const p = at(i / U, j / V);
    pos.push(p[0], p[1], p[2]); col.push(p[3], p[4], p[5]);
  }
  for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) {
    const a = j * (U + 1) + i, b = a + 1, c = a + U + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function mergeGeometries(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (const g of gs) {
    const base = pos.length / 3, p = g.getAttribute('position'), c = g.getAttribute('color'), ix = g.getIndex()!;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); col.push(c.getX(i), c.getY(i), c.getZ(i)); }
    for (let i = 0; i < ix.count; i++) idx.push(base + ix.getX(i));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A scallop or cockle valve with real relief: rounded radial ribs that run out to a
 * scalloped margin, fine growth lines, the two "ears" at the hinge (scallops only),
 * a thickness, and colour that follows the ribs and the growth bands. About 1 unit
 * across before scaling, hinge toward -z, domed side up. */
export function shell(o: { ribs?: number; color?: THREE.ColorRepresentation; band?: THREE.ColorRepresentation; seed?: number; cup?: number; fan?: number; ears?: boolean } = {}): THREE.Mesh {
  const ribs = o.ribs ?? 18, cup = o.cup ?? 0.24, fan = o.fan ?? 2.3, ears = o.ears ?? true;
  const base = new THREE.Color(o.color ?? '#f4ede2'), bandC = new THREE.Color(o.band ?? '#d99a63');
  const n = noise2(o.seed ?? 4), r = rng(o.seed ?? 4);
  const bands = Array.from({ length: 6 }, (_, k) => ({ at: 0.25 + k * 0.12 + r() * 0.05, w: 0.015 + r() * 0.04, a: 0.35 + r() * 0.55 }));
  const T = 0.022;
  const shape = (u: number, v: number) => {
    const a = (u - 0.5) * fan, rib = 0.5 + 0.5 * Math.cos((u * ribs + 0.5) * Math.PI * 2);
    const rr = (0.1 + 0.9 * v) * (1 + 0.035 * (rib - 0.5) * smooth(0.85, 1, v));
    let x = Math.sin(a) * rr * 0.55, z = -Math.cos(a) * rr * 0.5 + 0.3;
    if (ears && v < 0.28) {
      const ear = (u - 0.5) * 2 * 0.24 * (1 - v / 0.28);
      if (Math.abs(ear) > Math.abs(x)) x = ear, z = Math.min(z, -0.2 + 0.25 * v);
    }
    const dome = cup * Math.sin(Math.min(1, v * 1.15) * Math.PI * 0.62) * (1 - Math.pow(Math.abs(u - 0.5) * 2, 2) * 0.55);
    const relief = 0.03 * Math.pow(rib, 0.8) * smooth(0.05, 0.6, v) + 0.0035 * Math.sin(v * 95 + 3 * n(u * 4, v * 4)) * v;
    return { x, z, dome, relief, rib };
  };
  const outer = gridMesh(120, 40, (u, v) => {
    const s = shape(u, v);
    const c = base.clone().offsetHSL(0, 0, 0.06 * (s.rib - 0.5) + 0.04 * n(u * 9, v * 9));
    for (const b of bands) { const k = Math.exp(-((v - b.at) ** 2) / (b.w * b.w)); c.lerp(bandC, k * b.a * (0.6 + 0.4 * n(u * 6 + b.at * 10, 1))); }
    c.lerp(new THREE.Color('#ffffff'), 0.25 * smooth(0.4, 0, v));
    return [s.x, s.dome + s.relief, s.z, c.r, c.g, c.b];
  });
  const inner = gridMesh(120, 40, (u, v) => {
    const s = shape(1 - u, v), c = base.clone().lerp(new THREE.Color('#fffaf4'), 0.6);
    return [s.x, s.dome - T + s.relief * 0.3, s.z, c.r, c.g, c.b];
  });
  const rimPts: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i <= 120; i++) { const s = shape(i / 120, 1); rimPts.push({ x: s.x, y: s.dome + s.relief, z: s.z }); }
  const lip = gridMesh(120, 1, (u, v) => { const p = rimPts[Math.round(u * 120)], c = base.clone().lerp(bandC, 0.3); return [p.x, p.y - v * T, p.z, c.r, c.g, c.b]; });
  const geo = mergeGeometries([outer, inner, lip]);
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3, sheen: 0.25, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

/** A spiral sea snail shell (turritella, top shell, whelk) grown along a logarithmic
 * helix: whorls overlap, spiral cords ridge each whorl, colour runs in spiral bands
 * and flame stripes. About 1 unit long before scaling, spire along +y. */
export function snail(o: { turns?: number; growth?: number; height?: number; width?: number; color?: THREE.ColorRepresentation; stripe?: THREE.ColorRepresentation; cords?: number; seed?: number } = {}): THREE.Mesh {
  const turns = o.turns ?? 7, growth = o.growth ?? 1.3, height = o.height ?? 2.2, width = o.width ?? 1, cords = o.cords ?? 5;
  const base = new THREE.Color(o.color ?? '#e9d5b7'), stripe = new THREE.Color(o.stripe ?? '#8b5a3c');
  const n = noise2(o.seed ?? 6), k = Math.log(growth) / (Math.PI * 2), TH = turns * Math.PI * 2;
  const g = gridMesh(Math.round(turns * 60), 40, (u, v) => {
    const th = u * TH, s = Math.exp(k * (th - TH)), phi = v * Math.PI * 2;
    const a = 0.62 * width * s * (1 + 0.05 * Math.cos(phi * cords * 2) * smooth(0, 0.15, u));
    const R = width * s;
    const x = (R + a * Math.cos(phi)) * Math.cos(th), z = (R + a * Math.cos(phi)) * Math.sin(th);
    const y = -height * s + a * 1.15 * Math.sin(phi);
    const c = base.clone().offsetHSL(0, 0, 0.05 * Math.cos(phi * cords * 2) + 0.05 * n(th * 0.8, phi));
    const flame = smooth(0.25, 0.75, 0.5 + 0.5 * Math.sin(th * 2.2 + 2.5 * Math.sin(phi) + 2 * n(th * 0.3, 2)));
    const spiral = smooth(0.4, 0.9, 0.5 + 0.5 * Math.cos(phi * 2 + 0.8));
    c.lerp(stripe, 0.75 * flame * spiral);
    if (u > 0.985) c.lerp(new THREE.Color('#fbefe2'), 0.7);
    return [x, y, z, c.r, c.g, c.b];
  });
  g.computeBoundingBox();
  const bb = g.boundingBox!, size = Math.max(bb.max.y - bb.min.y, bb.max.x - bb.min.x, bb.max.z - bb.min.z);
  g.translate(0, -(bb.min.y + bb.max.y) / 2, 0);
  g.scale(1 / size, 1 / size, 1 / size);
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25, side: THREE.DoubleSide });
  return new THREE.Mesh(g, mat);
}

/** A dried starfish: five tapering arms domed along their length, rows of raised
 * tubercles down each arm, warm colour that is lighter on the bumps and darker in
 * the grooves. About 1 unit across before scaling, lying flat. */
export function starfish(o: { color?: THREE.ColorRepresentation; seed?: number; arms?: number; thickness?: number } = {}): THREE.Mesh {
  const arms = o.arms ?? 5, H = o.thickness ?? 0.13, base = new THREE.Color(o.color ?? '#d98a4e');
  const n = noise2(o.seed ?? 3), r = rng(o.seed ?? 3);
  const twist = Array.from({ length: arms }, () => (r() - 0.5) * 0.18), len = Array.from({ length: arms }, () => 0.92 + r() * 0.12);
  const armAt = (a: number) => {
    let best = 0, bi = 0;
    for (let k = 0; k < arms; k++) {
      const ak = (k / arms) * Math.PI * 2 + twist[k];
      const c = Math.cos(a - ak);
      if (c > best) { best = c; bi = k; }
    }
    return { w: Math.pow(Math.max(0, best), arms * 1.6), k: bi };
  };
  const outline = (a: number) => { const { w, k } = armAt(a); return 0.5 * (0.27 + 0.73 * w * len[k]) * (1 + 0.03 * n(Math.cos(a) * 3, Math.sin(a) * 3)); };
  const bumps: { x: number; z: number; s: number; h: number }[] = [];
  for (let k = 0; k < arms; k++) {
    const ak = (k / arms) * Math.PI * 2 + twist[k], ca = Math.cos(ak), sa = Math.sin(ak);
    for (let d = 0.06; d < 0.47 * len[k]; d += 0.042) {
      const half = 0.5 * (0.27 + 0.73) * 0.24 * (1 - d / 0.55);
      for (const off of [-0.55, 0, 0.55]) {
        if (off !== 0 && d > 0.38) continue;
        const ox = off * half + (r() - 0.5) * 0.01, x = ca * d - sa * ox, z = sa * d + ca * ox;
        bumps.push({ x, z, s: 0.016 * (1 - d * 0.9), h: 0.028 * (1 - d * 0.8) * (off === 0 ? 1 : 0.8) });
      }
    }
  }
  const NR = 56, NA = 300, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const light = base.clone().lerp(new THREE.Color('#f3dcc0'), 0.6), dark = base.clone().multiplyScalar(0.58);
  const add = (x: number, y: number, z: number, c: THREE.Color) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); return pos.length / 3 - 1; };
  const top = (x: number, z: number, rho: number, a: number) => {
    const { w } = armAt(a);
    let h = 0.025 + H * Math.sqrt(Math.max(0, 1 - rho * rho)) * (0.45 + 0.55 * Math.pow(w, 0.5)) * (1 - 0.35 * Math.hypot(x, z));
    let b = 0;
    for (const p of bumps) { const d2 = (x - p.x) ** 2 + (z - p.z) ** 2; if (d2 < 9 * p.s * p.s) b += p.h * Math.exp(-d2 / (p.s * p.s)); }
    h += b * smooth(1, 0.7, rho);
    const c = base.clone().lerp(light, clamp(b / 0.02)).lerp(dark, 0.35 * smooth(0.4, 1, rho) + 0.3 * clamp(0.5 + 0.8 * n(x * 22, z * 22)));
    return { h, c };
  };
  const center = top(0, 0, 0, 0), c0 = add(0, center.h, 0, center.c);
  const rings: number[][] = [];
  for (let j = 1; j <= NR; j++) {
    const rho = j / NR, row: number[] = [];
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * Math.PI * 2, rr = outline(a) * rho, x = Math.cos(a) * rr, z = Math.sin(a) * rr, t = top(x, z, rho, a);
      row.push(add(x, t.h, z, t.c));
    }
    rings.push(row);
  }
  for (let i = 0; i < NA; i++) idx.push(c0, rings[0][(i + 1) % NA], rings[0][i]);
  for (let j = 0; j < NR - 1; j++) for (let i = 0; i < NA; i++) {
    const i2 = (i + 1) % NA, a = rings[j][i], b = rings[j][i2], c = rings[j + 1][i], d = rings[j + 1][i2];
    idx.push(a, b, c, b, d, c);
  }
  const rim = rings[NR - 1], bot: number[] = [];
  for (let i = 0; i < NA; i++) { const p = rim[i] * 3; bot.push(add(pos[p], 0, pos[p + 2], dark)); }
  for (let i = 0; i < NA; i++) { const i2 = (i + 1) % NA; idx.push(rim[i], rim[i2], bot[i], rim[i2], bot[i2], bot[i]); }
  const cb = add(0, 0, 0, dark);
  for (let i = 0; i < NA; i++) idx.push(cb, bot[i], bot[(i + 1) % NA]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }));
}

/** Small matte beach stones and shell grit: irregular, in sand, grey and white
 * tones, one draw call. `at` gives each stone's resting point and size. */
export function pebbles(at: { p: THREE.Vector3; size: number }[], seed = 8, palette: THREE.ColorRepresentation[] = ['#cbbfae', '#a89a88', '#efe9df', '#8d8378', '#d8c7ad']): THREE.InstancedMesh {
  const geo = new THREE.IcosahedronGeometry(1, 2), n = noise2(seed), r = rng(seed);
  const p = geo.getAttribute('position'), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.multiplyScalar(1 + 0.22 * n(v.x * 1.7 + v.z, v.y * 1.7 + 3)); p.setXYZ(i, v.x, v.y * 0.6, v.z); }
  geo.computeVertexNormals();
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), at.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), c = new THREE.Color();
  at.forEach(({ p: pt, size }, i) => {
    q.setFromEuler(e.set((r() - 0.5) * 0.6, r() * 6.28, (r() - 0.5) * 0.6));
    sc.set(size * (0.8 + r() * 0.5), size * (0.7 + r() * 0.4), size * (0.8 + r() * 0.5));
    im.setMatrixAt(i, m.compose(pt, q, sc));
    im.setColorAt(i, c.set(palette[Math.floor(r() * palette.length)]).offsetHSL(0, 0, (r() - 0.5) * 0.08));
  });
  return im;
}

/** Many small spheres in one draw call: pearls, beads, or (with `bubble`) the silver
 * rims of trapped air bubbles. */
export function beads(points: THREE.Vector3[], radius: number | ((i: number) => number), o: { color?: THREE.ColorRepresentation; bubble?: boolean } = {}): THREE.InstancedMesh {
  const mat = o.bubble
    ? new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.05, envMapIntensity: 1.6 })
    : new THREE.MeshPhysicalMaterial({ color: o.color ?? '#f6efe4', roughness: 0.18, iridescence: 0.8, iridescenceIOR: 1.6, clearcoat: 1, sheen: 0.4 });
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 24, 16), mat, points.length);
  const m = new THREE.Matrix4();
  points.forEach((p, i) => {
    const r = typeof radius === 'number' ? radius : radius(i);
    im.setMatrixAt(i, m.makeScale(r, o.bubble ? r * 0.9 : r, r).setPosition(p));
  });
  return im;
}

/** Holographic glitter or mica flakes: tiny tilted metallic hexagons. */
export function glitter(points: THREE.Vector3[], size: number, colors: THREE.ColorRepresentation[] = ['#d9c7ff', '#bfe9ff', '#ffffff'], seed = 2): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 6),
    new THREE.MeshStandardMaterial({ metalness: 0.7, roughness: 0.25, side: THREE.DoubleSide, envMapIntensity: 2, emissive: '#ffffff', emissiveIntensity: 0.12 }), points.length);
  const r = rng(seed), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), c = new THREE.Color();
  points.forEach((p, i) => {
    q.setFromEuler(e.set(-Math.PI / 2 + (r() - 0.5) * 1.2, r() * 6.28, (r() - 0.5) * 1.2));
    const k = size * (0.6 + r() * 0.8);
    im.setMatrixAt(i, m.compose(p, q, s.set(k, k, k)));
    im.setColorAt(i, c.set(colors[Math.floor(r() * colors.length)]));
  });
  return im;
}

// ---------------------------------------------------------------- pressed flowers

export type PressedKind = 'daisy' | 'five' | 'hydrangea' | 'lace' | 'sprig' | 'leaf';

export interface PressedOptions {
  kind: PressedKind;
  petal?: string;
  center?: string;
  /** Number of petals for daisy/five; florets for lace and sprig. */
  count?: number;
  seed?: number;
  size?: number;
}

/** A pressed flower drawn into a texture: flat petals with darker veins, a little
 * transparency at the tips, and the irregularity of a real dried specimen. */
export function pressed(o: PressedOptions): THREE.CanvasTexture {
  const S = o.size ?? 512, [c, g] = canvas(S);
  const r = rng(o.seed ?? 1);
  const C = S / 2;
  g.translate(C, C);
  const petalCol = new THREE.Color(o.petal ?? '#e85d75');
  const style = (col: THREE.Color, dl = 0) => col.clone().offsetHSL((r() - 0.5) * 0.02, 0, dl + (r() - 0.5) * 0.06).getStyle();

  const petal = (len: number, wid: number, ang: number, tip: 'round' | 'notch' | 'point', col: THREE.Color) => {
    g.save(); g.rotate(ang);
    const grad = g.createLinearGradient(0, 0, len, 0);
    grad.addColorStop(0, style(col, -0.12)); grad.addColorStop(0.35, style(col)); grad.addColorStop(1, style(col, 0.06));
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(0, 0);
    const w = wid * (0.85 + r() * 0.3), l = len * (0.88 + r() * 0.2);
    g.bezierCurveTo(l * 0.3, -w, l * 0.85, -w * 0.95, l, -w * 0.25);
    if (tip === 'notch') g.lineTo(l * 0.93, 0);
    else if (tip === 'point') g.lineTo(l * 1.06, 0);
    else g.quadraticCurveTo(l * 1.03, 0, l, w * 0.25);
    g.lineTo(l, w * 0.25);
    g.bezierCurveTo(l * 0.85, w * 0.95, l * 0.3, w, 0, 0);
    g.fill();
    g.strokeStyle = style(col, -0.18); g.globalAlpha = 0.35; g.lineWidth = Math.max(0.6, S / 700);
    for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(l * 0.05, 0); g.quadraticCurveTo(l * 0.5, k * w * 0.18, l * 0.92, k * w * 0.32); g.stroke(); }
    g.globalAlpha = 1; g.restore();
  };
  const dotDisc = (rad: number, col: string, n: number) => {
    g.fillStyle = col; g.beginPath(); g.arc(0, 0, rad, 0, 7); g.fill();
    const k = new THREE.Color(col);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * rad * 0.95;
      g.fillStyle = k.clone().offsetHSL(0, 0, (r() - 0.4) * 0.3).getStyle();
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, rad * 0.07, 0, 7); g.fill();
    }
  };

  switch (o.kind) {
    case 'daisy': {
      const n = o.count ?? 18;
      for (let i = 0; i < n; i++) petal(C * 0.92, C * 0.11, (i / n) * 6.28 + r() * 0.08, 'notch', petalCol);
      dotDisc(C * 0.26, o.center ?? '#3c6b3a', 160);
      break;
    }
    case 'five': {
      const n = o.count ?? 5;
      for (let i = 0; i < n; i++) petal(C * 0.9, C * 0.42, (i / n) * 6.28 + r() * 0.15, 'round', petalCol);
      dotDisc(C * 0.12, o.center ?? '#6a2b2b', 30);
      break;
    }
    case 'hydrangea': {
      for (let i = 0; i < 4; i++) petal(C * 0.88, C * 0.5, (i / 4) * 6.28 + 0.4 + r() * 0.1, 'round', petalCol);
      dotDisc(C * 0.06, o.center ?? '#2f3f8a', 6);
      break;
    }
    case 'lace': {
      const n = o.count ?? 42;
      g.strokeStyle = style(new THREE.Color('#4f7d3a')); g.lineWidth = S / 300;
      for (let i = 0; i < n; i++) {
        const a = r() * 6.28, d = Math.sqrt(r()) * C * 0.85, x = Math.cos(a) * d, y = Math.sin(a) * d;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(x * 0.6, y * 0.6); g.stroke();
        for (let k = 0; k < 7; k++) {
          g.fillStyle = style(petalCol);
          g.beginPath(); g.arc(x + (r() - 0.5) * C * 0.12, y + (r() - 0.5) * C * 0.12, C * 0.03, 0, 7); g.fill();
        }
      }
      break;
    }
    case 'sprig': {
      const n = o.count ?? 14;
      g.rotate(-Math.PI / 2);
      g.strokeStyle = style(new THREE.Color('#7a5a3c'), -0.05); g.lineWidth = S / 260; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-C * 0.95, 0); g.quadraticCurveTo(0, C * 0.08, C * 0.4, 0); g.stroke();
      for (let i = 0; i < n; i++) {
        const t = -0.6 + (i / n) * 1.4, side = i % 2 ? 1 : -1;
        const bx = t * C * 0.7, ex = bx + C * (0.18 + r() * 0.2), ey = side * C * (0.12 + r() * 0.3);
        g.beginPath(); g.moveTo(bx, 0); g.quadraticCurveTo((bx + ex) / 2, ey * 0.2, ex, ey); g.stroke();
        for (let k = 0; k < 5; k++) {
          g.fillStyle = style(petalCol);
          g.beginPath(); g.arc(ex + (r() - 0.5) * C * 0.09, ey + (r() - 0.5) * C * 0.09, C * (0.025 + r() * 0.02), 0, 7); g.fill();
        }
      }
      break;
    }
    case 'leaf': {
      const leafCol = new THREE.Color(o.petal ?? '#7f9a4c');
      petal(C * 0.95, C * 0.36, -Math.PI / 2 + 0.05, 'point', leafCol);
      g.save(); g.rotate(Math.PI / 2 - 0.05); petal(C * 0.6, C * 0.02, 0, 'point', leafCol.clone().offsetHSL(0, 0, -0.1)); g.restore();
      break;
    }
  }
  // Dried tissue is never flat colour: mottle it, darken where pigment pooled,
  // and thin the alpha at the very edge so petals read as translucent.
  g.setTransform(1, 0, 0, 1, 0, 0);
  const img = g.getImageData(0, 0, S, S), nn = noise2((o.seed ?? 1) + 50);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    if (!img.data[i + 3]) continue;
    const m = 0.86 + 0.22 * fbm(nn, x / S * 9, y / S * 9, 4) + 0.06 * (r() - 0.5);
    img.data[i] *= m; img.data[i + 1] *= m; img.data[i + 2] *= m;
  }
  g.putImageData(img, 0, 0);
  return texture(c);
}

// ---------------------------------------------------------------- a dried rose

/** A preserved rose head, built from cupped petal surfaces in a spiral: tight in the
 * middle, opening and curling back at the edge as they go out. ~1 unit across. */
export function rose(o: { color?: THREE.ColorRepresentation; petals?: number; open?: number; seed?: number } = {}): THREE.Group {
  const grp = new THREE.Group();
  const r: Rand = rng(o.seed ?? 8), N = o.petals ?? 26, open = o.open ?? 1;
  const base = new THREE.Color(o.color ?? '#ef8a8a');
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, sheen: 1, sheenRoughness: 0.6, sheenColor: base.clone().offsetHSL(0, 0, 0.15), side: THREE.DoubleSide });
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    // Each petal is a strip of a cylinder around the stem axis: inner petals wrap
    // nearly all the way round and stand upright, outer ones are wider, flare out
    // and roll back at the lip.
    const len = 0.2 + 0.24 * Math.pow(k, 0.8);
    const span = (2.7 - 1.3 * k) * (0.9 + 0.2 * r());
    const r0 = 0.015 + 0.11 * Math.pow(k, 0.9);
    const tiltOut = (0.05 + 0.95 * Math.pow(k, 1.6)) * open, curl = 1.1 * Math.pow(k, 2.2) * open;
    const geo = new THREE.BufferGeometry();
    const U = 22, V = 16, pos: number[] = [], col: number[] = [], idx: number[] = [];
    const c = new THREE.Color();
    for (let j = 0; j <= V; j++) for (let ii = 0; ii <= U; ii++) {
      const u = ii / U - 0.5, v = j / V;
      const prof = v < 0.6 ? 0.45 + 0.55 * Math.sin((v / 0.6) * Math.PI / 2) : Math.sqrt(Math.max(0, 1 - ((v - 0.6) / 0.43) ** 2));
      let y = 0, R = r0;
      const steps = 8;
      for (let st = 0; st < steps; st++) {
        const vv = (st + 0.5) / steps * v;
        const bend = tiltOut * vv + curl * Math.pow(vv, 4);
        y += Math.cos(bend) * len * v / steps;
        R += Math.sin(bend) * len * v / steps;
      }
      const a = u * span * prof + 0.04 * Math.sin(v * 9 + i);
      const wav = 1 + 0.03 * Math.sin(u * 14 + i * 1.7) * v;
      pos.push(Math.sin(a) * R * wav, y, Math.cos(a) * R * wav);
      c.copy(base).offsetHSL(0, 0.04, -0.2 * Math.pow(1 - v, 2) + 0.05 * v - 0.1 * (1 - k));
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < V; j++) for (let ii = 0; ii < U; ii++) {
      const a = j * (U + 1) + ii, b = a + 1, cc = a + U + 1, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = i * 2.39996 + r() * 0.3;
    m.position.y = -0.1 * k;
    grp.add(m);
  }
  const sepal = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshStandardMaterial({ color: '#5d7a3a', roughness: 0.7 }));
  sepal.scale.y = 0.7; sepal.position.y = -0.1;
  grp.add(sepal);
  return grp;
}
