// Light that has been through the resin and landed on the table: a soft tinted
// shadow and moving caustics. Real transmissive shadows are expensive and three.js
// casts them as opaque, so both are faked as floor decals. Both carry
// `userData.table`, so matte renders and model exports leave them out.
import * as THREE from 'three';

/** A soft, coloured contact shadow under a piece. Multiply-blended. */
export function contactShadow(w: number, d: number, o: { color?: THREE.ColorRepresentation; strength?: number; spread?: number; round?: boolean } = {}): THREE.Mesh {
  const spread = o.spread ?? 0.35;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true,
    uniforms: { uColor: { value: new THREE.Color(o.color ?? '#8a8478') }, uStrength: { value: o.strength ?? 0.55 }, uSize: { value: new THREE.Vector2(w, d) }, uSpread: { value: spread }, uRound: { value: o.round ? 1 : 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uStrength, uSpread, uRound; uniform vec2 uSize; varying vec2 vP;
      void main(){
        vec2 q = abs(vP) - uSize * 0.5;
        float dist = mix(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0), length(vP / (uSize * 0.5)) * min(uSize.x, uSize.y) * 0.5 - min(uSize.x, uSize.y) * 0.5, uRound);
        float a = (1.0 - smoothstep(-uSpread * 0.4, uSpread, dist)) * uStrength;
        gl_FragColor = vec4(mix(vec3(1.0), uColor, a), 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w + spread * 4, d + spread * 4), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  m.renderOrder = -1;
  m.userData.table = true;
  return m;
}

/** Moving caustic light: the bright, wandering network a wavy resin top throws onto
 * the table. Additive; call `update(t)` each frame. Offset it away from the key light. */
export function caustics(w: number, d: number, o: { color?: THREE.ColorRepresentation; intensity?: number; scale?: number; speed?: number } = {}) {
  const uniforms = {
    uTime: { value: 0 }, uColor: { value: new THREE.Color(o.color ?? '#9fe6ff') }, uI: { value: o.intensity ?? 0.6 },
    uScale: { value: o.scale ?? 3.5 }, uSize: { value: new THREE.Vector2(w, d) },
  };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime, uI, uScale; uniform vec3 uColor; uniform vec2 uSize; varying vec2 vP;
      vec2 h2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
      float web(vec2 p, float t){
        vec2 i = floor(p), f = fract(p); float f1 = 8.0, f2 = 8.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y)); vec2 o = h2(i + g); o = 0.5 + 0.45 * sin(t + 6.2831 * o);
          float dd = length(g + o - f); if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd;
        }
        return 1.0 - smoothstep(0.0, 0.22, f2 - f1);
      }
      void main(){
        vec2 p = vP * uScale;
        float c = web(p, uTime) * 0.65 + web(p * 1.7 + 3.1, uTime * 1.3) * 0.45;
        vec2 q = abs(vP) / (uSize * 0.5);
        float mask = 1.0 - smoothstep(0.2, 1.0, length(q));
        gl_FragColor = vec4(uColor * c * uI * mask, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.004;
  mesh.userData.table = true;
  return { mesh, update(t: number) { uniforms.uTime.value = t * (o.speed ?? 0.6); } };
}
