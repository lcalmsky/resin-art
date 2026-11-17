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

/** A ribbed scallop or cockle shell, cupped, about 1 unit across before scaling. */
export function shell(o: { ribs?: number; color?: THREE.ColorRepresentation; band?: THREE.ColorRepresentation; seed?: number; cup?: number; fan?: number } = {}): THREE.Mesh {
  const ribs = o.ribs ?? 18, cup = o.cup ?? 0.28, fan = o.fan ?? 2.4;
  const geo = new THREE.BufferGeometry();
  const U = 96, V = 28, pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  for (let j = 0; j <= V; j++) for (let i = 0; i <= U; i++) {
    const u = i / U, v = j / V;
    const a = (u - 0.5) * fan, r = 0.12 + 0.88 * v;
    const rib = 0.035 * Math.pow(Math.abs(Math.cos(u * ribs * Math.PI)), 0.6) * v;
    const lip = 1 - Math.pow(Math.abs(u - 0.5) * 2, 6) * 0.25;
    const x = Math.sin(a) * r * 0.5, z = -Math.cos(a) * r * 0.5 * lip + 0.25;
    const y = cup * Math.sin(v * Math.PI * 0.8) * (1 - Math.pow(Math.abs(u - 0.5) * 2, 2) * 0.6) + rib;
    pos.push(x, y, z); uvs.push(u, v);
  }
  for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) {
    const a = j * (U + 1) + i, b = a + 1, c = a + U + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const [c, g] = canvas(256);
  g.fillStyle = new THREE.Color(o.color ?? '#f4ede2').getStyle(); g.fillRect(0, 0, 256, 256);
  const r = rng(o.seed ?? 4), bandCol = new THREE.Color(o.band ?? '#d99a63');
  for (let k = 0; k < 7; k++) {
    const y = (0.25 + k * 0.1 + r() * 0.04) * 256;
    g.fillStyle = bandCol.clone().offsetHSL(0, 0, (r() - 0.5) * 0.15).getStyle();
    g.globalAlpha = 0.25 + r() * 0.5;
    g.fillRect(0, y, 256, 3 + r() * 9);
  }
  g.globalAlpha = 0.35; g.fillStyle = '#ffffff';
  for (let k = 0; k < ribs; k++) g.fillRect(((k + 0.5) / ribs) * 256 - 1.5, 0, 3, 256);
  const mat = new THREE.MeshPhysicalMaterial({ map: texture(c), roughness: 0.45, clearcoat: 0.4, side: THREE.DoubleSide, sheen: 0.3 });
  return new THREE.Mesh(geo, mat);
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
