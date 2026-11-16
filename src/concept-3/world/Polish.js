// V5: the finish on the paint, after C1 V7 and C2 V3 (Sam, 14 Nov: "use something similar for the fine
// polishing on the car, so the reflection and lighting are premium").
// What made those two read premium with the same models was what the paint reflects, not the paint: broad
// light with no hard edge, a bright line at door height all round (the line along every sill in a real
// car photo) and something pale under the car so the sills and wheels catch light. C3's cars reflected only
// thin hot strips and points on a dark sky, which reads as a dark car with a few glints.
// These are added to each car's own reflection map (never to the scene), warm, so they sit with the
// sodium night instead of reading as a studio.
import * as THREE from 'three';

// how strong each light is in the reflection map (the paint caps what it reflects at 1.5, softly)
export const POLISH = {
  box: 2.6, // the overhead softbox, long along the car
  strip: 7, // C1's strips along each shoulder: a crisp core in a soft band
  horizon: 2.4, // the line round the car at door height, crisp
  wash: 0.2, // fading up from it
  pool: 0.12, // the pale floor close under the car (first try 0.34: the sills and mirror glass went milky)
};
const WARM = new THREE.Color(1, 0.9, 0.78);

const cache = new Map();
// a soft-edged panel: full in the middle, falling off smoothly over the outer fraction fx (across) and fy
// (along), or a round pool if radial (C1 V7's _softTex)
export function softTex(fx, fy, radial = false) {
  const key = `${fx}:${fy}:${radial}`;
  if (cache.has(key)) return cache.get(key);
  const N = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  const edge = (t, f) => THREE.MathUtils.smoothstep(t, 0, f) * THREE.MathUtils.smoothstep(1 - t, 0, f);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N, v = (y + 0.5) / N;
    let a;
    if (radial) { const d = Math.hypot(u - 0.5, v - 0.5) * 2; a = Math.pow(Math.max(0, 1 - d), 1.6); }
    else a = edge(u, fx) * edge(v, fy);
    const k = (y * N + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(255 * a);
    img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  cache.set(key, t);
  return t;
}

// a strip's light across its width (v) and along its length (u): a narrow core with a wider skirt, ends that
// fade instead of stopping (C1 V7's _stripTex)
let stripCache = null;
function stripTex() {
  if (stripCache) return stripCache;
  const N = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N, v = (y + 0.5) / N - 0.5;
    const ends = THREE.MathUtils.smoothstep(u, 0, 0.18) * THREE.MathUtils.smoothstep(1 - u, 0, 0.18);
    const a = (Math.exp(-Math.pow(v / 0.07, 2)) + 0.22 * Math.exp(-Math.pow(v / 0.26, 2))) / 1.22 * ends;
    const k = (y * N + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(255 * Math.min(1, a));
    img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  stripCache = new THREE.CanvasTexture(c);
  stripCache.colorSpace = THREE.NoColorSpace;
  return stripCache;
}

function soft(w, h, k, tex) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
    map: tex, color: WARM.clone().multiplyScalar(k), side: THREE.DoubleSide,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
}

// The polish round one car: centre is the car's spot on the ground, yaw the way its nose points, eye how
// far above the ground the reflection map is captured (the heights below are from the ground, as in C1 V7,
// where the studio is drawn 0.45 m lower for the same reason). Returns a group for that car's reflection scene.
export function polish(centre, yaw = 0, k = 1, eye = 0) {
  const g = new THREE.Group();
  g.position.copy(centre);
  g.position.y -= eye;
  g.rotation.y = yaw;
  // the softbox: long along the car, 4.8 m up, feathered all round
  const box = soft(3.2, 7.4, POLISH.box * k, softTex(0.34, 0.24));
  box.position.set(0, 4.8, 0);
  box.rotation.x = Math.PI / 2;
  g.add(box);
  // a long strip high off each shoulder, tipped toward the car: a highlight line down each side of the body
  for (const sx of [-1, 1]) {
    const st = soft(7.2, 0.9, POLISH.strip * k, stripTex());
    st.position.set(sx * 3.4, 2.7, 0);
    st.rotation.set(0, Math.PI / 2, 0);
    st.rotateX(sx * 0.55);
    g.add(st);
  }
  // the horizon round the car, at door height, and the wash above it: one ring, its light shaped in the shader
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 9, 2.6, 96, 1, true),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { uH: { value: POLISH.horizon * k }, uW: { value: POLISH.wash * k }, uC: { value: WARM } },
      vertexShader: 'varying vec2 vU; varying vec3 vP; void main(){ vU = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      // y runs 0..2.6 m up the ring from 0.8 m: the line just above the bottom, the wash fading up from it;
      // a little stronger along the car's sides than at its ends, so the flanks carry it
      fragmentShader: 'uniform float uH; uniform float uW; uniform vec3 uC; varying vec2 vU; varying vec3 vP; void main(){ float y = vU.y * 2.6; float line = exp(-pow((y - 0.18) / 0.045, 2.0)); float wash = smoothstep(0.12, 0.3, y) * pow(1.0 - clamp((y - 0.2) / 2.3, 0.0, 1.0), 2.2); float a = atan(vP.x, vP.z); float side = 0.7 + 0.3 * abs(sin(a)); gl_FragColor = vec4(uC * (line * uH + wash * uW) * side, 1.0); }',
    }),
  );
  ring.position.y = 0.8 + 1.3;
  g.add(ring);
  // the pale pool on the floor close under the car (C2 V3's "Low bounce", feathered)
  const pool = soft(6.4, 8.6, POLISH.pool * k, softTex(0.5, 0.5, true));
  pool.position.y = 0.02;
  pool.rotation.x = -Math.PI / 2;
  g.add(pool);
  return g;
}
