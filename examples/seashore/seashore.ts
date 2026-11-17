// "A day at the beach": a round pour with the whole shore in it. A crescent of sand
// with shells, a starfish and a few pearls, foam lace where the wave breaks, and the
// water deepening from glass-clear to teal to deep blue under a creased wave top.
import * as THREE from 'three';
import type { PieceDef } from '../../lib/piece.ts';
import { resin, disc, discRadius, pigment, rippleField } from '../../lib/resin.ts';
import { sandMaterial, foamTexture, flat, shell, beads } from '../../lib/inclusions.ts';
import { contactShadow, caustics } from '../../lib/light.ts';
import { noise2, fbm, clamp, smooth, rng } from '../../lib/noise.ts';

const R = 1.7, H = 0.42, WANDER = 0.04, SEED = 14;

/** A five-armed starfish with a knobbly top, about 1 unit across. */
function starfish(color: THREE.ColorRepresentation, seed: number): THREE.Mesh {
  const n = noise2(seed), shape = new THREE.Shape();
  for (let i = 0; i <= 200; i++) {
    const a = (i / 200) * Math.PI * 2;
    const arm = Math.pow(0.5 + 0.5 * Math.cos(5 * a), 1.5);
    const r = 0.5 * (0.3 + 0.7 * arm) * (1 + 0.06 * n(Math.cos(a) * 2, Math.sin(a) * 2));
    const x = Math.cos(a + 0.04 * n(a, 3)) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 6, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  // dome the middle so the arms taper toward their tips
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    if (y > 0.02) p.setY(i, y + 0.12 * Math.max(0, 1 - Math.hypot(x, z) / 0.45));
  }
  g.computeVertexNormals();
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d')!, base = new THREE.Color(color), r = rng(seed);
  ctx.fillStyle = base.getStyle(); ctx.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 900; k++) {
    ctx.fillStyle = base.clone().offsetHSL(0.01 * (r() - 0.5), 0, 0.12 + 0.1 * r()).getStyle();
    ctx.beginPath(); ctx.arc(r() * 256, r() * 256, 1 + r() * 2.2, 0, 7); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 3);
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, bumpMap: tex, bumpScale: 2 }));
}

export const seashore: PieceDef = {
  name: 'seashore',
  studio: { elevation: 44, distance: 9.2, target: { x: 0, y: 0.1, z: 0 }, spin: 0.18, yaw: -20 },
  build(s) {
    const n = noise2(5);
    const rim = discRadius(R, WANDER, SEED);
    // 0 on the beach, 1 out at sea: distance from a point beyond the rim on the beach
    // side, so the shoreline curves round the piece like a bay.
    const sea = (x: number, z: number) => clamp((Math.hypot(x + 1.5, z - 1.5) - 1.15) / 2.1 + 0.06 * fbm(n, x * 1.4, z * 1.4, 3));
    const inside = (x: number, z: number, m = 0.97) => Math.hypot(x, z) < rim(Math.atan2(z, x)) * m;

    const water = disc({
      radius: R, height: H, relief: 0.12, wander: WANDER, seed: SEED,
      surface: rippleField(9, 0.7), calm: (x, z) => 0.45 + 0.55 * smooth(0.2, 0.75, sea(x, z)),
    });
    pigment(water, [
      { at: 0.0, color: '#ffffff' },
      { at: 0.38, color: '#f4fefc' },
      { at: 0.46, color: '#eafcfb' },
      { at: 0.56, color: '#8ee6e6' },
      { at: 0.72, color: '#2fbfe0' },
      { at: 0.9, color: '#0d8fdc' },
      { at: 1.0, color: '#0874cc' },
    ], (x, _y, z) => sea(x, z), { swirl: 0.11, seed: 6 });
    const piece = new THREE.Group();
    piece.add(new THREE.Mesh(water, resin({ vertexColors: true, thickness: 0.55, tint: '#eafcff', depth: 6 })));

    const sandTop = (x: number, z: number) => {
      const k = sea(x, z);
      return Math.max(0.004, H * 0.55 * (1 - smooth(0.2, 0.46, k)) + 0.04 * fbm(n, x * 4 + 3, z * 4, 3) * (1 - k));
    };
    const sand = disc({ radius: R * 0.985, height: 0, relief: 1, wander: WANDER, seed: SEED, surface: (x, z) => sandTop(x, z) + 0.5, meniscus: 0.03 });
    piece.add(new THREE.Mesh(sand, sandMaterial('#dcc293')));

    const floor = new THREE.CircleGeometry(R * 0.98, 160).rotateX(-Math.PI / 2).translate(0, 0.006, 0);
    pigment(floor, [{ at: 0.44, color: '#eef0ea' }, { at: 0.58, color: '#7fd8e2' }, { at: 0.7, color: '#3fbcdc' }, { at: 0.85, color: '#1689d2' }, { at: 1, color: '#0a62b8' }], (x, _y, z) => sea(x, z), { swirl: 0.15, seed: 8 });
    piece.add(new THREE.Mesh(floor, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));

    // Foam: a lacy crest on the break and a fainter wash running up the beach.
    const S = R * 2;
    const band = (shift: number) => (u: number, v: number) => {
      const x = (u - 0.5) * S, z = (v - 0.5) * S;
      if (!inside(x, z, 0.96)) return 0;
      const k = sea(x, z) + shift;
      return smooth(0.3, 0.38, k) * (1 - smooth(0.4, 0.47, k));
    };
    const foam = flat(foamTexture({ band: band(0), seed: 12, cellScale: 30, size: 1536 }), S, S, { roughness: 0.4 });
    foam.position.y = H * 0.74;
    const foam2 = flat(foamTexture({ band: (u, v) => band(0.05)(u, v) * 0.55, seed: 31, cellScale: 40, size: 1536 }), S, S, { roughness: 0.4 });
    foam2.position.y = H * 0.55;
    piece.add(foam, foam2);

    // Things washed up on the sand.
    const onSand = (o: THREE.Object3D, x: number, z: number, lift = 0.01) => { o.position.set(x, sandTop(x, z) + lift, z); piece.add(o); };
    const scallop = shell({ ribs: 20, color: '#f7f1e7', band: '#d6884e', seed: 3 });
    scallop.scale.setScalar(0.7); scallop.rotation.set(-0.2, 0.7, 0.1);
    onSand(scallop, -0.35, 0.95);
    const pink = shell({ ribs: 16, color: '#f9e4df', band: '#e0918a', seed: 5, cup: 0.32, fan: 2.2 });
    pink.scale.setScalar(0.45); pink.rotation.set(0.15, -2.2, 0.05);
    onSand(pink, -1.15, 0.05);
    const cockle = shell({ ribs: 13, color: '#efe2cf', band: '#b97a48', seed: 9, cup: 0.36, fan: 2.0 });
    cockle.scale.setScalar(0.3); cockle.rotation.set(0.25, 2.6, -0.1);
    onSand(cockle, -1.05, 0.95);
    const star = starfish('#ea8a5c', 4);
    star.scale.setScalar(0.5); star.rotation.y = 0.5;
    onSand(star, -0.62, 0.42, 0.0);

    const r = rng(17), pearls: THREE.Vector3[] = [], sizes: number[] = [];
    for (let i = 0; pearls.length < 9 && i < 400; i++) {
      const x = -R + r() * R * 1.4, z = -R * 0.3 + r() * R * 1.3;
      if (!inside(x, z, 0.9) || sea(x, z) > 0.3) continue;
      if (Math.hypot(x + 0.35, z - 0.95) < 0.4 || Math.hypot(x + 0.62, z - 0.42) < 0.32) continue;
      const rr = 0.028 + r() * 0.03;
      pearls.push(new THREE.Vector3(x, sandTop(x, z) + rr * 0.6, z)); sizes.push(rr);
    }
    piece.add(beads(pearls, (i) => sizes[i]));

    // Tiny pebbles and bubbles for scale.
    const pebbles: THREE.Vector3[] = [], psz: number[] = [];
    for (let i = 0; pebbles.length < 40 && i < 2000; i++) {
      const x = -R + r() * R * 2, z = -R + r() * R * 2;
      if (!inside(x, z, 0.92) || sea(x, z) > 0.38) continue;
      const rr = 0.008 + r() * 0.014; pebbles.push(new THREE.Vector3(x, sandTop(x, z), z)); psz.push(rr);
    }
    const pb = beads(pebbles, (i) => psz[i], { color: '#b89f7a' });
    (pb.material as THREE.MeshPhysicalMaterial).iridescence = 0;
    piece.add(pb);

    piece.position.y = 0.001;
    s.turntable.add(piece);
    s.turntable.add(contactShadow(R * 2, R * 2, { color: '#5f8fa3', strength: 0.5, round: true }));
    const light = caustics(R * 2.4, R * 2.4, { color: '#8fe3ff', intensity: 0.1 });
    light.mesh.position.set(1.0, 0.004, -0.8);
    s.turntable.add(light.mesh);
    return { update: (t: number) => light.update(t) };
  },
};
