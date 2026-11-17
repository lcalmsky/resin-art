// The photo studio a resin piece sits in: renderer, softbox environment, a table
// that catches tinted light, a turntable the viewer can drag, and a time loop that
// can be stepped exactly for checking and capture.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { surfaceLook, FLOOR_SIZE, type Surface } from './surfaces.ts';

export interface StudioOptions {
  /** Card and floor colour. Resin shows what is behind it, so this is part of the look. */
  backdrop?: string;
  /** Table top; see `lib/surfaces.ts`. `none` leaves only the backdrop colour. */
  surface?: Surface;
  /** Camera elevation in degrees above the floor. */
  elevation?: number;
  distance?: number;
  fov?: number;
  exposure?: number;
  /** Idle turntable speed in radians per second; 0 keeps the piece still. */
  spin?: number;
  /** Degrees the environment's key light sweeps back and forth, so glints travel. */
  sweep?: number;
  /** Starting turntable angle in degrees. */
  yaw?: number;
  target?: THREE.Vector3Like;
}

export interface Studio {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Put the piece in here; it is what the turntable and drag rotate. Objects with
   * `userData.table = true` (shadows, caustics) are hidden in matte renders and exports. */
  turntable: THREE.Group;
  floor: THREE.Mesh;
  canvas: HTMLCanvasElement;
  /** Starts the loop. `draw(t, dt)` runs before each render. */
  run(draw?: (t: number, dt: number) => void): void;
  /** Sets the turntable angle (degrees) and optionally tilts the view up or down (degrees of camera elevation); the idle spin keeps going from there. */
  pose(yawDeg: number, tiltDeg?: number): void;
  setSpin(radPerSec: number): void;
  setSurface(kind: Surface): void;
  setBackdrop(color: string): void;
  /** Renders one frame now at the current state. */
  render(): void;
  dispose(): void;
}

export function studio(host: HTMLElement, o: StudioOptions = {}): Studio {
  const backdrop = new THREE.Color(o.backdrop ?? '#f3f1ee');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = o.exposure ?? 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Opaque background, not an alpha canvas: the transmission pass samples it, and a
  // transparent clear colour shows up as dark patches inside the resin.
  scene.background = backdrop;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.02).texture;
  scene.environmentIntensity = 1;

  const key = new THREE.DirectionalLight('#ffffff', 1.4);
  key.position.set(-3, 6, 4);
  scene.add(key, new THREE.HemisphereLight('#ffffff', '#d8d2c8', 0.5));

  const floorMat = new THREE.MeshStandardMaterial();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.userData.table = true;
  scene.add(floor);
  let surface: Surface = o.surface ?? 'marble';
  const applySurface = () => {
    const look = surfaceLook(surface, backdrop);
    floorMat.map?.dispose();
    floorMat.map = look.map; floorMat.color.copy(look.color); floorMat.roughness = look.roughness;
    floorMat.needsUpdate = true;
    floor.visible = surface !== 'none';
  };
  applySurface();

  const camera = new THREE.PerspectiveCamera(o.fov ?? 30, 1, 0.05, FLOOR_SIZE);
  const target = new THREE.Vector3().copy(o.target ?? { x: 0, y: 0.3, z: 0 });
  const elev = THREE.MathUtils.degToRad(o.elevation ?? 32), dist = o.distance ?? 8;
  // Tilt orbits the camera instead of tipping the turntable: tipped, the shadow and
  // caustic decals would cut into the floor and show as a hard line through the resin.
  const placeCamera = (tiltRad: number) => {
    const e = THREE.MathUtils.clamp(elev + tiltRad, Math.min(elev, THREE.MathUtils.degToRad(12)), Math.max(elev, THREE.MathUtils.degToRad(80)));
    camera.position.set(target.x, target.y + Math.sin(e) * dist, target.z + Math.cos(e) * dist);
    camera.lookAt(target);
  };
  placeCamera(0);

  const turntable = new THREE.Group();
  scene.add(turntable);

  const resize = () => {
    const w = host.clientWidth || 800, h = host.clientHeight || 450;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // Drag turns the piece; release and it keeps a little momentum, then returns to
  // the idle spin. Vertical drag looks from higher or lower, springing back.
  let idle = o.spin ?? 0.18;
  let yaw = THREE.MathUtils.degToRad(o.yaw ?? 0), tilt = 0, yawVel = idle, tiltTarget = 0, dragging = false, lastX = 0, lastY = 0;
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.style.cursor = 'grab';
  const down = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    const k = 4 / el.clientWidth;
    yaw += (e.clientX - lastX) * k * 1.6;
    yawVel = (e.clientX - lastX) * k * 60;
    tiltTarget = THREE.MathUtils.clamp(tiltTarget + (e.clientY - lastY) * k, -0.35, 0.5);
    lastX = e.clientX; lastY = e.clientY;
  };
  const release = () => { dragging = false; el.style.cursor = 'grab'; };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);

  const sweep = THREE.MathUtils.degToRad(o.sweep ?? 25);
  const step = (t: number, dt: number) => {
    if (!dragging) {
      yawVel += (idle - yawVel) * Math.min(1, dt * 1.5);
      yaw += yawVel * dt;
      tiltTarget *= Math.max(0, 1 - dt * 1.2);
    }
    tilt += (tiltTarget - tilt) * Math.min(1, dt * 8);
    turntable.rotation.set(0, yaw, 0);
    placeCamera(tilt);
    scene.environmentRotation.y = Math.sin(t * 0.35) * sweep;
  };

  let raf = 0;
  const render = () => renderer.render(scene, camera);
  return {
    renderer, scene, camera, turntable, floor, canvas: el, render,
    run(draw) {
      const frame = (t: number, dt: number) => { step(t, dt); draw?.(t, dt); render(); };
      const q = new URLSearchParams(location.search);
      if (q.has('debug')) {
        let t = 0;
        frame(t, 1 / 60);
        window.__step = (s = 1) => { for (let i = 0, n = Math.max(1, Math.round(s * 60)); i < n; i++) step((t += 1 / 60), 1 / 60), draw?.(t, 1 / 60); render(); return t; };
        return;
      }
      const frozen = q.has('t') ? Number(q.get('t')) : null;
      const still = frozen !== null || matchMedia('(prefers-reduced-motion: reduce)').matches;
      const t0 = performance.now();
      let prev = 0;
      const tick = (now: number) => {
        const t = frozen ?? (now - t0) / 1000;
        frame(t, Math.min(0.05, Math.max(0, t - prev))); prev = t;
        if (!still) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    },
    pose(yawDeg, tiltDeg = 0) {
      yaw = THREE.MathUtils.degToRad(yawDeg);
      tilt = tiltTarget = THREE.MathUtils.degToRad(tiltDeg);
      yawVel = idle;
      turntable.rotation.set(0, yaw, 0);
      placeCamera(tilt);
    },
    setSpin(v) { idle = v; yawVel = v; },
    setSurface(kind) { surface = kind; applySurface(); },
    setBackdrop(color) { backdrop.set(color); applySurface(); },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointercancel', release);
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        for (const mat of ([] as THREE.Material[]).concat(m.material ?? [])) mat.dispose();
      });
      pmrem.dispose();
      renderer.dispose();
      el.remove();
    },
  };
}

declare global { interface Window { __step?: (s?: number) => number } }
