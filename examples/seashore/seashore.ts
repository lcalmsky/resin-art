// "A day at the beach": a round pour with the whole shore in it. A crescent of sand
// with shells, a starfish and a few pearls, foam lace where the wave breaks, and the
// water deepening from glass-clear to teal to deep blue under a creased wave top.
import * as THREE from 'three';
import type { PieceDef } from '../../lib/piece.ts';
import { resin, disc, discRadius, pigment, rippleField } from '../../lib/resin.ts';
import { sandMaterial, foamTexture, flat, starfish, pebbles, beads } from '../../lib/inclusions.ts';
import { scan, ready } from '../../lib/assets.ts';
import { contactShadow, caustics } from '../../lib/light.ts';
import { noise2, fbm, clamp, smooth, rng } from '../../lib/noise.ts';

const R = 1.7, H = 0.42, WANDER = 0.04, SEED = 14;

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
      surface: rippleField(9, 0.7), calm: (x, z) => 0.12 + 0.88 * smooth(0.25, 0.8, sea(x, z)),
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
    const sand = disc({ radius: R * 0.985, height: 0, relief: 1, wander: WANDER, seed: SEED, surface: (x, z) => sandTop(x, z) + 0.5, meniscus: 0.03, rings: 60, segments: 240 });
    // Dry sand up the beach, darker and warmer where the water has wet it.
    pigment(sand, [{ at: 0, color: '#e6d2ab' }, { at: 0.22, color: '#dcc49a' }, { at: 0.36, color: '#c4a676' }, { at: 0.5, color: '#b99a6c' }], (x, _y, z) => sea(x, z), { swirl: 0.06, seed: 3 });
    const sandMat = sandMaterial('#ffffff', { grain: 520, specks: 0.05 });
    sandMat.vertexColors = true;
    (sandMat.userData.exportMaterial as THREE.MeshStandardMaterial).vertexColors = true;
    piece.add(new THREE.Mesh(sand, sandMat));

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

    // Things washed up on the sand, half sunk into it the way they settle in a real pour.
    const onSand = (o: THREE.Object3D, x: number, z: number, sink = 0) => { o.position.set(x, sandTop(x, z) - sink, z); piece.add(o); };
    // Real shells: CC0 photogrammetry scans from the Smithsonian (assets/scans/CREDITS.md).
    const shellScan = (file: string, size: number, rotation: [number, number, number], x: number, z: number, yaw: number, sink: number) => {
      const g = scan(new URL(`../../assets/scans/${file}.glb`, import.meta.url).href, { size, rotation, roughness: 0.45 });
      g.rotation.y = yaw;
      onSand(g, x, z, sink);
      return g;
    };
    const flatUp: [number, number, number] = [-Math.PI / 2, 0, 0];
    const shells = [
      shellScan('mimachlamys-senatoria-crassicostata-5dbe459a', 0.7, flatUp, -0.42, 0.92, 0.7, 0.03),
      shellScan('mimachlamys-asperrima-407a5ff5', 0.44, flatUp, -1.2, 0.18, -2.1, 0.02),
      shellScan('conus-textile-c29a9ede', 0.52, [0, 0, 0], -1.05, 0.72, 0.9, 0.03),
      shellScan('oliva-porphyria-f6b58975', 0.36, [0, 0, Math.PI / 2], 0.08, 1.02, -0.6, 0.03),
    ];
    const star = starfish({ color: '#c47c4c', seed: 4 });
    star.scale.setScalar(0.58); star.rotation.y = 0.5;
    onSand(star, -0.62, 0.38, 0.015);

    const r = rng(17);
    const keepOut = [[-0.42, 0.92, 0.42], [-0.62, 0.38, 0.36], [-1.05, 0.72, 0.32], [-1.2, 0.18, 0.28], [0.08, 1.02, 0.22]];
    const free = (x: number, z: number) => keepOut.every(([cx, cz, rr]) => Math.hypot(x - cx, z - cz) > rr);
    const pearls: THREE.Vector3[] = [], sizes: number[] = [];
    for (let i = 0; pearls.length < 4 && i < 600; i++) {
      const x = -R + r() * R * 1.4, z = -R * 0.3 + r() * R * 1.3;
      if (!inside(x, z, 0.88) || sea(x, z) > 0.28 || !free(x, z)) continue;
      const rr = 0.018 + r() * 0.014;
      pearls.push(new THREE.Vector3(x, sandTop(x, z) + rr * 0.5, z)); sizes.push(rr);
    }
    piece.add(beads(pearls, (i) => sizes[i]));

    const stones: { p: THREE.Vector3; size: number }[] = [];
    for (let i = 0; stones.length < 70 && i < 4000; i++) {
      const x = -R + r() * R * 2, z = -R + r() * R * 2;
      if (!inside(x, z, 0.93) || sea(x, z) > 0.42 || !free(x, z)) continue;
      const size = 0.006 + Math.pow(r(), 3) * 0.03;
      stones.push({ p: new THREE.Vector3(x, sandTop(x, z) - size * 0.2, z), size });
    }
    piece.add(pebbles(stones));

    piece.position.y = 0.001;
    s.turntable.add(piece);
    s.turntable.add(contactShadow(R * 2, R * 2, { color: '#5f8fa3', strength: 0.5, round: true }));
    const light = caustics(R * 2.4, R * 2.4, { color: '#8fe3ff', intensity: 0.1 });
    light.mesh.position.set(1.0, 0.004, -0.8);
    s.turntable.add(light.mesh);
    return { update: (t: number) => light.update(t), ready: ready(...shells) };
  },
};
