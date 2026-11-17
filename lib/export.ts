// Turning a studio scene into assets: PNG (with or without a background), and the
// piece itself as GLB, USDZ, STL or OBJ. Everything returns bytes in the browser;
// `scripts/export.ts` drives these from the command line.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Studio } from './studio.ts';

/** World units are 3 cm: the ocean slab is 9.6 cm wide, the rose cube 5.1 cm. */
export const CM_PER_UNIT = 3;

export interface SnapshotOptions {
  width?: number;
  height?: number;
  /** Cut the piece out onto a transparent background (table, shadow and caustics removed). */
  matte?: boolean;
}

/** Render the current frame to a PNG at an exact pixel size, independent of the page layout. */
export async function snapshot(s: Studio, o: SnapshotOptions = {}): Promise<Blob> {
  const { renderer, camera } = s;
  const prevSize = renderer.getSize(new THREE.Vector2()), prevRatio = renderer.getPixelRatio();
  const w = o.width ?? 1600, h = o.height ?? 900;
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  try {
    if (!o.matte) { s.render(); return await toBlob(renderer.domElement); }
    return await matte(s, w, h);
  } finally {
    renderer.setPixelRatio(prevRatio);
    renderer.setSize(prevSize.x, prevSize.y, false);
    camera.aspect = prevSize.x / prevSize.y;
    camera.updateProjectionMatrix();
    s.render();
  }
}

// Difference matting: render once over black and once over white. Where the two
// agree the pixel is opaque; how far they differ is how much background shows
// through, which keeps the resin's partial transparency and its tint. The backdrop
// is a tone-mapped sphere rather than the clear colour, so "fully see-through" has
// the same value outside the piece and through clear resin.
async function matte(s: Studio, w: number, h: number): Promise<Blob> {
  const { scene, renderer } = s;
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => { if (o.userData.table && o.visible) { o.visible = false; hidden.push(o); } });
  const prevBg = scene.background;
  const domeMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), domeMat);
  scene.add(dome);
  scene.background = null;
  const grab = (color: string) => {
    domeMat.color.set(color);
    s.render();
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(renderer.domElement, 0, 0, w, h);
    return { g, c, d: g.getImageData(0, 0, w, h) };
  };
  try {
    const black = grab('#000000'), white = grab('#ffffff');
    const B = black.d.data, W = white.d.data;
    const full = Math.max(1, (W[0] - B[0] + W[1] - B[1] + W[2] - B[2]) / 3);
    const out = black.g.createImageData(w, h), O = out.data;
    for (let i = 0; i < B.length; i += 4) {
      const diff = (W[i] - B[i] + W[i + 1] - B[i + 1] + W[i + 2] - B[i + 2]) / 3;
      const a = Math.min(1, Math.max(0, 1 - diff / full));
      if (a < 0.004) continue;
      O[i] = Math.min(255, B[i] / a); O[i + 1] = Math.min(255, B[i + 1] / a); O[i + 2] = Math.min(255, B[i + 2] / a);
      O[i + 3] = a * 255;
    }
    black.g.putImageData(out, 0, 0);
    return await toBlob(black.c);
  } finally {
    scene.remove(dome);
    dome.geometry.dispose(); domeMat.dispose();
    scene.background = prevBg;
    for (const o of hidden) o.visible = true;
  }
}

function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('canvas.toBlob failed'))), 'image/png'));
}

export type ModelFormat = 'glb' | 'usdz' | 'stl' | 'obj';

/** Export the piece (the turntable's contents minus table effects) as a 3D file in
 * real-world size. Instanced bubbles and glitter are expanded to plain meshes, since
 * many importers ignore instancing. */
export async function exportModel(s: Studio, format: ModelFormat): Promise<Blob> {
  const root = exportRoot(s, format);
  switch (format) {
    case 'glb': {
      const buf = await new GLTFExporter().parseAsync(root, { binary: true, maxTextureSize: 1024 }) as ArrayBuffer;
      return new Blob([buf], { type: 'model/gltf-binary' });
    }
    case 'usdz': {
      const buf = await new USDZExporter().parseAsync(root);
      return new Blob([buf as BlobPart], { type: 'model/vnd.usdz+zip' });
    }
    case 'stl': {
      const data = new STLExporter().parse(root, { binary: true }) as DataView;
      return new Blob([data.buffer as ArrayBuffer], { type: 'model/stl' });
    }
    case 'obj':
      return new Blob([new OBJExporter().parse(root)], { type: 'model/obj' });
  }
}

const isResin = (m: THREE.Material) => (m as THREE.MeshPhysicalMaterial).transmission > 0;

function exportRoot(s: Studio, format: ModelFormat): THREE.Group {
  const root = new THREE.Group();
  root.name = 'resin-piece';
  // glTF and USDZ are in metres, STL by convention in millimetres, OBJ in centimetres.
  root.scale.setScalar({ glb: 0.01, usdz: 0.01, stl: 10, obj: 1 }[format] * CM_PER_UNIT);
  s.turntable.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(s.turntable.matrixWorld).invert();
  s.turntable.traverse((obj) => {
    if (obj.userData.table || !(obj as THREE.Mesh).isMesh || !visibleChain(obj)) return;
    const mesh = obj as THREE.Mesh;
    const mat = mesh.material as THREE.Material;
    if (format === 'stl' && !isResin(mat)) return;
    const local = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    const material = exportMaterial(mat, format);
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      const im = mesh as THREE.InstancedMesh, m = new THREE.Matrix4(), c = new THREE.Color();
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        let mi = material;
        if (im.instanceColor) { im.getColorAt(i, c); mi = (material as THREE.MeshStandardMaterial).clone(); (mi as THREE.MeshStandardMaterial).color.multiply(c); }
        const part = new THREE.Mesh(im.geometry, mi);
        part.applyMatrix4(new THREE.Matrix4().multiplyMatrices(local, m));
        root.add(part);
      }
      return;
    }
    const copy = new THREE.Mesh(compact(mesh.geometry), material);
    copy.name = mesh.name;
    copy.applyMatrix4(local);
    root.add(copy);
  });
  // STL and OBJ read world matrices, which a fresh group has not computed yet.
  root.updateMatrixWorld(true);
  return root;
}

const compacted = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
/** Re-index non-indexed geometry (slabs are split for crisp rims): same look, a
 * fraction of the file size. Vertices with different normals stay separate. */
function compact(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (g.index) return g;
  let c = compacted.get(g);
  if (!c) { c = mergeVertices(g, 1e-5); compacted.set(g, c); }
  return c;
}

function visibleChain(o: THREE.Object3D | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

function exportMaterial(m: THREE.Material, format: ModelFormat): THREE.Material {
  // Shader-only looks (sand grain) carry a texture version for export.
  if (m.userData.exportMaterial) return m.userData.exportMaterial;
  // USDZ and OBJ have no transmission: show the resin as a tinted see-through surface.
  if ((format === 'usdz' || format === 'obj') && isResin(m)) {
    const p = m as THREE.MeshPhysicalMaterial;
    return new THREE.MeshStandardMaterial({
      color: p.attenuationColor.clone().lerp(new THREE.Color('#ffffff'), 0.3), roughness: p.roughness,
      transparent: true, opacity: 0.3, vertexColors: p.vertexColors, side: THREE.FrontSide,
    });
  }
  return m;
}
