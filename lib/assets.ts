// Scanned objects to set into the resin. Photogrammetry scans of real shells read
// as real in a way procedural ones don't, so a piece can mix both. The scans in
// assets/scans/ are Smithsonian Open Access (CC0); see assets/scans/CREDITS.md.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

export interface ScanOptions {
  /** Largest dimension after loading, in world units (1 unit = 3 cm). */
  size: number;
  /** Rotation applied to the raw scan before sizing, to lay it the way you want. */
  rotation?: [number, number, number];
  /** Override the scan's surface: lower is glossier. Scans are often captured matte. */
  roughness?: number;
}

/**
 * An empty group that fills with the scan when it loads, centred on x/z and resting
 * on y = 0, so you can position it right away. Await `ready(...)` (or return it as
 * the piece's `ready`) before capturing.
 */
export function scan(url: string, o: ScanOptions): THREE.Group {
  const holder = new THREE.Group();
  holder.userData.ready = loader.loadAsync(url).then((gltf) => {
    const obj = gltf.scene;
    if (o.rotation) obj.rotation.set(...o.rotation);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
    const k = o.size / Math.max(size.x, size.y, size.z);
    const center = box.getCenter(new THREE.Vector3());
    const wrap = new THREE.Group();
    obj.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
    wrap.add(obj);
    wrap.scale.setScalar(k);
    obj.traverse((m) => {
      if (!(m as THREE.Mesh).isMesh) return;
      const mats = ([] as THREE.Material[]).concat((m as THREE.Mesh).material) as THREE.MeshStandardMaterial[];
      for (const mat of mats) {
        mat.transparent = false; mat.opacity = 1;
        if (o.roughness !== undefined && 'roughness' in mat) mat.roughness = o.roughness;
        mat.envMapIntensity = 1;
      }
    });
    holder.add(wrap);
    return holder;
  }).catch((e: unknown) => {
    // A missing scan shouldn't take the whole piece down: log it and render without it.
    console.error(`scan failed to load: ${url}: ${(e as Error).message ?? e}`);
    return holder;
  });
  return holder;
}

/** Resolves when every scan among `objects` (and their children) has loaded. */
export function ready(...objects: THREE.Object3D[]): Promise<void> {
  const waits: Promise<unknown>[] = [];
  for (const o of objects) o.traverse((c) => { if (c.userData.ready) waits.push(c.userData.ready); });
  return Promise.all(waits).then(() => undefined);
}
