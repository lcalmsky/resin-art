// A preserved rose cast in a clear cube: the head set a little above centre, two
// leaves, a scatter of trapped bubbles, and a faint blush in the resin itself.
import * as THREE from 'three';
import type { PieceDef } from '../../lib/piece.ts';
import { resin, block, scatter } from '../../lib/resin.ts';
import { rose, beads, pressed, flat } from '../../lib/inclusions.ts';
import { contactShadow, caustics } from '../../lib/light.ts';

const S = 1.7;
export const roseCube: PieceDef = {
  name: 'rose-cube',
  studio: { elevation: 20, distance: 6.4, target: { x: 0, y: 0.8, z: 0 }, spin: 0.2, yaw: 32 },
  build(s) {
    const piece = new THREE.Group();
    piece.add(new THREE.Mesh(block(S, S, S, 0.07), resin({ tint: '#ffd9d4', depth: 14, thickness: S * 0.5 })));

    const head = rose({ color: '#ee6f6c', petals: 34, open: 1.05, seed: 8 });
    head.scale.setScalar(1.6);
    head.position.set(0, S * 0.42, 0);
    head.rotation.set(0.45, 0.4, -0.1);
    piece.add(head);

    for (const [x, y, z, ry, rz] of [[-0.35, 0.42, 0.25, 0.6, 0.7], [0.32, 0.38, -0.2, -2.2, -0.6]]) {
      const leaf = flat(pressed({ kind: 'leaf', petal: '#6f8f45', seed: Math.round(x * 100) }), 0.62, 0.62, { roughness: 0.6 });
      leaf.position.set(x, y, z);
      leaf.rotation.set(-Math.PI / 2 + 0.5, ry, rz);
      piece.add(leaf);
    }

    const half = S / 2 - 0.12;
    const bubbles = scatter(26, { x: [-half, half], y: [0.12, S - 0.12], z: [-half, half] }, 5, (x, y, z) => Math.hypot(x, y - S * 0.5, z) > 0.62);
    piece.add(beads(bubbles, (i) => 0.012 + (i % 5) * 0.006, { bubble: true }));

    s.turntable.add(piece);
    s.turntable.add(contactShadow(S, S, { color: '#c98d88', strength: 0.4, spread: 0.3 }));
    const light = caustics(S * 1.6, S * 1.6, { color: '#ffc4bb', intensity: 0.05, scale: 4 });
    light.mesh.position.set(0.7, 0.004, -0.7);
    s.turntable.add(light.mesh);

    return { update: (t: number) => light.update(t) };
  },
};
