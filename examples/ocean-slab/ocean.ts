// "A piece of the sea": a resin slab with a beach in it. Sand rises toward one
// corner, the water deepens from clear to teal to blue toward the other, white foam
// lace marks where the wave breaks, and the top is cured glass with only a faint
// swell left in it.
import * as THREE from 'three';
import type { PieceDef } from '../../lib/piece.ts';
import { resin, slab, pigment, rippleField } from '../../lib/resin.ts';
import { sandMaterial, foamTexture, flat } from '../../lib/inclusions.ts';
import { scan, ready } from '../../lib/assets.ts';
import { contactShadow, caustics } from '../../lib/light.ts';
import { noise2, fbm, clamp, smooth } from '../../lib/noise.ts';

const W = 3.2, D = 2.5, H = 0.5;
export const oceanSlab: PieceDef = {
  name: 'ocean-slab',
  studio: { elevation: 38, distance: 6.6, target: { x: 0, y: 0.15, z: 0 }, spin: 0.16 },
  build(s) {
    const n = noise2(21);
    // 0 at the beach corner (-x, +z), 1 out at sea (+x, -z), with a wandering shoreline.
    const sea = (x: number, z: number) => clamp(0.5 + 0.62 * (x / W) - 0.62 * (z / D) + 0.07 * fbm(n, x * 1.3, z * 1.3, 3));

    const ripple = rippleField(7, 0.75);
    const water = slab({
      // Resin levels itself before it cures; the waves live in the lacing, not the top.
      width: W, depth: D, height: H, relief: 0.02, segments: 200, surface: ripple,
    });
    // Only a breath of tint in the clear coat: the colour is in the layer under the
    // foam, so the lace on top of it stays white.
    pigment(water, [
      { at: 0.0, color: '#ffffff' },
      { at: 0.5, color: '#f4fefc' },
      { at: 1.0, color: '#cdeff2' },
    ], (x, _y, z) => sea(x, z), { swirl: 0.1, seed: 4 });
    const piece = new THREE.Group();
    piece.add(new THREE.Mesh(water, resin({ vertexColors: true, thickness: 0.45, tint: '#eefffc', depth: 6 })));

    // Sand: a body that fills the beach corner almost to the surface and thins to
    // nothing under the water, with a lumpy top where it was spooned in.
    const sandTop = (x: number, z: number) => {
      const k = sea(x, z);
      return Math.max(0.004, H * 0.5 * (1 - smooth(0.25, 0.6, k)) + 0.035 * fbm(n, x * 4 + 3, z * 4, 3) * (1 - k));
    };
    const sand = slab({ width: W - 0.02, depth: D - 0.02, height: 0.5, relief: 1, segments: 120, surface: sandTop });
    piece.add(new THREE.Mesh(sand, sandMaterial('#d4b98a')));

    // Deep water sits over pigmented resin, not bare table: a blue floor sheet that fades out toward the beach.
    const deepFloor = new THREE.PlaneGeometry(W - 0.03, D - 0.03, 80, 60).rotateX(-Math.PI / 2).translate(0, 0.006, 0);
    pigment(deepFloor, [{ at: 0.3, color: '#e6e1d6' }, { at: 0.44, color: '#c4f3ea' }, { at: 0.56, color: '#5fd6d2' }, { at: 0.75, color: '#1ba6c6' }, { at: 1, color: '#0b6494' }], (x, _y, z) => sea(x, z), { swirl: 0.15, seed: 8 });
    piece.add(new THREE.Mesh(deepFloor, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));

    // Foam lace: thick where water meets sand, torn open seaward; a thinner second wave
    // further out on a lower layer. Cell space is world units across and along the shore.
    const wave = (at: number, width: number, peak: number) => (u: number, v: number) => {
      const k = sea((u - 0.5) * W, (v - 0.5) * D);
      return peak * smooth(at - 0.025, at, k) * (1 - smooth(at, at + width, k));
    };
    const ax = 0.62 / W, az = -0.62 / D, al = Math.hypot(ax, az);
    const coords = (u: number, v: number): [number, number] => {
      const x = (u - 0.5) * W, z = (v - 0.5) * D;
      return [(x * ax + z * az) / al, (x * -az + z * ax) / al];
    };
    const foam = flat(foamTexture({ band: wave(0.36, 0.2, 1), coords, seed: 12, cellScale: 20, size: 2048 }), W - 0.04, D - 0.04, { roughness: 0.35 });
    foam.position.y = H * 0.72;
    piece.add(foam);
    const foam2 = flat(foamTexture({ band: wave(0.62, 0.12, 0.6), coords, seed: 31, cellScale: 24, size: 2048 }), W - 0.04, D - 0.04, { roughness: 0.35 });
    foam2.position.y = H * 0.42;
    piece.add(foam2);

    // Two real shells half-buried in the sand: CC0 Smithsonian scans (assets/scans/CREDITS.md).
    const shellAt = (file: string, size: number, rotation: [number, number, number], x: number, z: number, yaw: number) => {
      const g = scan(new URL(`../../assets/scans/${file}.glb`, import.meta.url).href, { size, rotation, roughness: 0.45 });
      g.position.set(x, sandTop(x, z) - 0.03, z);
      g.rotation.y = yaw;
      piece.add(g);
      return g;
    };
    const shells = [
      shellAt('mimachlamys-senatoria-crassicostata-5dbe459a', 0.6, [-Math.PI / 2, 0, 0], -0.6, 0.5, 0.9),
      shellAt('conus-textile-c29a9ede', 0.42, [0, 0, 0], -1.1, -0.3, -1.4),
    ];

    piece.position.y = 0.001;
    s.turntable.add(piece);
    s.turntable.add(contactShadow(W, D, { color: '#6f8f9a', strength: 0.5 }));
    const light = caustics(W * 1.25, D * 1.25, { color: '#8fe3ff', intensity: 0.1 });
    light.mesh.position.set(1.1, 0.004, -0.9);
    s.turntable.add(light.mesh);

    return { update: (t: number) => light.update(t), ready: ready(...shells) };
  },
};
