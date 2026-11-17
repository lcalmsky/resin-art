// A pressed-flower coaster: a thin clear pour with a scalloped, self-levelled rim,
// a loose bouquet laid flat in the middle layer, and a few flakes of mica.
import * as THREE from 'three';
import type { PieceDef } from '../../lib/piece.ts';
import { resin, pour, freeformOutline, scatter } from '../../lib/resin.ts';
import { pressed, flat, glitter, type PressedOptions } from '../../lib/inclusions.ts';
import { contactShadow } from '../../lib/light.ts';

const R = 1.35, H = 0.16, SPREAD = 1.15, GROW = 1.45;
export const flowerCoaster: PieceDef = {
  name: 'flower-coaster',
  studio: { elevation: 56, distance: 5.6, target: { x: 0, y: 0, z: 0.05 }, spin: 0.1, sweep: 35, backdrop: '#ebe6df' },
  build(s) {
    const piece = new THREE.Group();
    piece.add(new THREE.Mesh(pour(freeformOutline(R, { seed: 4, wander: 0.025, lobes: 14, lobeDepth: 0.03 }), H), resin({ thickness: 0.25, topcoat: 1 })));

    // [kind options, x, z, size, spin]; laid back to front so stems tuck under heads.
    const bouquet: [PressedOptions, number, number, number, number][] = [
      [{ kind: 'leaf', petal: '#8aa357', seed: 1 }, -0.62, -0.12, 0.5, 0.9],
      [{ kind: 'leaf', petal: '#7d9a4a', seed: 2 }, -0.5, 0.18, 0.42, 2.3],
      [{ kind: 'sprig', petal: '#d94656', seed: 3, count: 10 }, 0.05, -0.62, 0.8, 0.2],
      [{ kind: 'lace', petal: '#2f7d3a', seed: 4 }, 0.38, -0.42, 0.5, 0],
      [{ kind: 'five', petal: '#d9a6c4', center: '#7a3b62', seed: 5 }, -0.62, -0.45, 0.4, 0.4],
      [{ kind: 'five', petal: '#e35d74', seed: 6 }, -0.05, 0.62, 0.66, 1.1],
      [{ kind: 'five', petal: '#f08a4b', center: '#b44d22', seed: 7 }, 0.45, 0.32, 0.62, 0.5],
      [{ kind: 'daisy', petal: '#f5cf3a', center: '#c08a1f', seed: 8, count: 16 }, 0.62, -0.05, 0.6, 0.2],
      [{ kind: 'daisy', petal: '#3d6fe0', center: '#2f5a33', seed: 9, count: 20 }, 0.05, 0.08, 0.62, 0.7],
      [{ kind: 'hydrangea', petal: '#c35fa0', seed: 10 }, -0.4, 0.5, 0.26, 0.3],
      [{ kind: 'hydrangea', petal: '#eaa4b8', seed: 11 }, 0.22, -0.18, 0.2, 1.2],
    ];
    bouquet.forEach(([opts, x, z, size, rot], i) => {
      const m = flat(pressed(opts), size * GROW, size * GROW, { roughness: 0.6 });
      m.position.set(x * SPREAD, 0.05 + i * 0.0025, z * SPREAD);
      m.rotation.z = rot;
      piece.add(m);
    });

    const flakes = scatter(70, { x: [-R * 0.9, R * 0.9], y: [0.04, 0.1], z: [-R * 0.9, R * 0.9] }, 6, (x, _y, z) => Math.hypot(x, z) < R * 0.85 && Math.hypot(x, z) > R * 0.55);
    piece.add(glitter(flakes, 0.012, ['#ffffff', '#f3e6c9', '#e9d8ff'], 6));

    s.turntable.add(piece);
    s.turntable.add(contactShadow(R * 2, R * 2, { color: '#9c948a', strength: 0.35, spread: 0.25, round: true }));
  },
};
