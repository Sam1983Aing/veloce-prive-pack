// The one location: a private terminal apron at Nice Côte d'Azur, at night, after rain.
// Car at the origin, nose toward +Z (the runway and the bay). Terminal behind (-Z), mast behind left,
// hangar to the right. World units are metres.
import * as THREE from 'three';
import { polish } from './Polish.js';
import { buildWetGround } from './WetGround.js';
import { FarLights } from './FarLights.js';
import { bakeTerminalGlass, fbm, rand, vnoise } from './bake.js';

const SODIUM = 0xffb25e;
const TAXI_BLUE = 0x4d7bff;
const RED = 0xff3b2f;

export const MAST = new THREE.Vector3(-14, 0, -30);
export const HANGAR = { x: 34, z: -3, width: 30, height: 12 };
export const TOWER = { x: 120, z: -230, h: 44 };
// Runway: ahead of stand 7 and to the left, across the bay. Seen from behind the car (looking +Z,
// where +X is screen left), planes come in over the water on the left and roll out to the right.
export const RUNWAY = {
  dir: new THREE.Vector3(-1, 0, -0.85).normalize(),
  centre: new THREE.Vector3(-60, 0, 330),
  length: 2900,
  width: 45,
};
RUNWAY.side = new THREE.Vector3(-RUNWAY.dir.z, 0, RUNWAY.dir.x); // points away from the apron
RUNWAY.touchdown = RUNWAY.centre.clone().addScaledVector(RUNWAY.dir, -600);

export function buildApron(renderer, scene) {
  const world = { scene, update: [] };

  const fogColor = new THREE.Color().setRGB(0.0105, 0.0085, 0.0072);
  scene.fog = new THREE.FogExp2(fogColor, 0.0065);
  scene.background = new THREE.Color(0x000000);

  world.ground = buildWetGround(scene);

  // Fill: the night sky and the town's glow, very low.
  const hemi = new THREE.HemisphereLight(0x2b3a55, 0x0b0d10, 0.25);
  scene.add(hemi);

  buildSky(scene, world);
  buildMast(scene, world);
  buildTerminal(scene, world);
  buildHangar(scene, world);
  buildJet(scene, world);
  buildTower(scene, world);
  buildFarLights(scene, world);
  buildPlane(scene, world);

  world.power = buildPower(scene, world);

  world.envMap = buildEnvMap(renderer, false, world.terminalGlass);
  world.envMapOpen = buildEnvMap(renderer, true, world.terminalGlass);
  return world;
}

// ---------------------------------------------------------------- the opening's dimmer
// V5 opens on a dark screen: the car flashes its headlamps, then the mast's heads strike one after another
// and the rest of the airfield comes up. power(heads, rest) sets each mast head (0..1, an array) and one
// level for every other light on the apron: lights, glowing glass, the far lights, the sky's town glow.
// The car and the title word are added after this and aren't touched. The hangar's door lamps keep their
// own control (they're dark at the stand anyway).
function buildPower(scene, world) {
  const heads = world.mastHeads;
  const skip = new Set(heads.flatMap((h) => [h.spot, h.glass, h.cone]));
  const lights = [], basics = [], gains = [], glows = [];
  scene.traverse((o) => {
    if (o.isLight && !skip.has(o) && o.intensity > 0) lights.push({ o, base: o.intensity });
    if (!o.material) return;
    for (const m of [].concat(o.material)) {
      if (!m || skip.has(m)) continue;
      if (m.isMeshBasicMaterial && !basics.some((b) => b.m === m)) basics.push({ m, base: m.color.clone() });
      // lit glass and the like (the terminal's windows); the hangar's own glow stays with its door
      if (m.isMeshStandardMaterial && m.emissiveIntensity > 0 && m.emissive && m.emissive.getHex() !== 0 && !glows.some((g) => g.m === m)) glows.push({ m, base: m.emissiveIntensity });
      const u = m.uniforms;
      if (u && u.uGain && !gains.some((g) => g.u === u.uGain)) gains.push({ u: u.uGain, base: u.uGain.value });
      if (u && u.uGlow && !gains.some((g) => g.u === u.uGlow)) gains.push({ u: u.uGlow, base: u.uGlow.value });
    }
  });
  let last = '';
  return (headK, restK) => {
    const key = `${headK.map((k) => k.toFixed(3)).join()}|${restK.toFixed(3)}`;
    if (key === last) return;
    last = key;
    heads.forEach((h, i) => {
      const k = headK[i] ?? headK[headK.length - 1];
      h.spot.intensity = h.spotBase * k;
      h.glass.color.copy(h.glassBase).multiplyScalar(k);
      h.cone.uniforms.uGain.value = k;
    });
    for (const l of lights) l.o.intensity = l.base * restK;
    for (const b of basics) b.m.color.copy(b.base).multiplyScalar(restK);
    for (const g of gains) g.u.value = g.base * restK;
    for (const g of glows) g.m.emissiveIntensity = g.base * restK;
  };
}

// ---------------------------------------------------------------- sky, bay, hills

function buildSky(scene, world) {
  const geo = new THREE.SphereGeometry(9500, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uGlow: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow;
      varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n(p); p *= 2.07; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 zenith = vec3(0.0016, 0.0017, 0.0022);
        vec3 horizon = vec3(0.021, 0.0135, 0.0086) * uGlow;
        float t = smoothstep(-0.02, 0.45, y);
        vec3 col = mix(horizon, zenith, t);
        // a low overcast lit orange from below by the coast
        if (y > 0.0) {
          vec2 cp = d.xz / (y + 0.06) * 1.3;
          float c = fbm(cp + vec2(3.0, 1.0));
          float cover = smoothstep(0.38, 0.72, c);
          float lit = (1.0 - smoothstep(0.0, 0.55, y));
          col += vec3(0.019, 0.0116, 0.0068) * cover * lit * uGlow;
          col += vec3(0.0016, 0.0011, 0.0008) * cover * (1.0 - lit);
          col *= mix(1.0, 0.75, cover * smoothstep(0.1, 0.5, y));
        } else {
          col = mix(horizon * 0.5, vec3(0.002, 0.0022, 0.003), smoothstep(0.0, -0.05, y));
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
  world.sky = sky;

  // The bay: black water from beyond the runway to the hills.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(30000, 9000).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.0016, 0.0019, 0.0026), fog: false })
  );
  sea.position.set(0, -0.6, 5000);
  scene.add(sea);

  // The hills across the bay: layered dark ridges, nearer ones a touch lighter with haze.
  const ridges = [
    { z: 4200, base: 40, amp: 160, x0: -9000, x1: 2600, seed: 1, shade: 0.0085 },
    { z: 6200, base: 90, amp: 330, x0: -12000, x1: 6000, seed: 2, shade: 0.0105 },
    { z: 8200, base: 220, amp: 560, x0: -14000, x1: 9000, seed: 3, shade: 0.0125 },
  ];
  world.ridges = ridges;
  for (const r of ridges.slice().reverse()) {
    const seg = 220;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= seg; i++) {
      const x = r.x0 + (r.x1 - r.x0) * (i / seg);
      const hgt = ridgeHeight(r, x);
      pos.push(x, -1, r.z, x, hgt, r.z);
      if (i < seg) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(r.shade * 0.9, r.shade * 0.75, r.shade * 0.62), fog: false, side: THREE.DoubleSide }));
    m.renderOrder = -9;
    scene.add(m);
  }
}

export function ridgeHeight(r, x) {
  const u = x / 1400;
  let h = r.base + r.amp * (fbm(u * 0.6, r.seed * 3.1, 4, r.seed) * 1.25 - 0.2);
  // drop the hills into the sea at the ends
  const e0 = THREE.MathUtils.smoothstep(x, r.x0, r.x0 + 1600);
  const e1 = 1 - THREE.MathUtils.smoothstep(x, r.x1 - 1600, r.x1);
  return Math.max(0, h * e0 * e1);
}

// ---------------------------------------------------------------- the floodlight mast

function buildMast(scene, world) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.55, metalness: 0.6 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 18, 16, 1, true), steel);
  pole.position.set(MAST.x, 9, MAST.z);
  pole.castShadow = true;
  scene.add(pole);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 0.5), steel);
  frame.position.set(MAST.x, 18.15, MAST.z);
  scene.add(frame);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.8 }));
  base.position.set(MAST.x, 0.25, MAST.z);
  scene.add(base);

  // Four lamp heads in a row, tilted toward stand 7.
  const housing = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.5 });
  const lens = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(9, 4.7, 1.7), fog: false });
  const targets = [
    new THREE.Vector3(-2.5, 0, 0.5),
    new THREE.Vector3(0.8, 0, -1.4),
    new THREE.Vector3(2.6, 0, 2.2),
    new THREE.Vector3(-6.5, 0, -6),
  ];
  const cones = [];
  world.mastSpots = [];
  for (let i = 0; i < 4; i++) {
    const head = new THREE.Group();
    const hx = MAST.x - 1.5 + i * 1.0;
    head.position.set(hx, 17.75, MAST.z + 0.1);
    head.lookAt(targets[i]);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.5, 0.32), housing);
    head.add(box);
    // each head its own glass, so the opening can strike them one at a time
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24).scale(1.5, 1, 1), lens.clone());
    glass.position.z = 0.17;
    head.add(glass);
    scene.add(head);

    const spot = new THREE.SpotLight(SODIUM, 5600, 90, THREE.MathUtils.degToRad(13), 0.9, 2);
    spot.position.copy(head.position);
    spot.target.position.copy(targets[i]);
    if (i === 1) {
      spot.castShadow = true;
      spot.shadow.mapSize.set(2048, 2048);
      spot.shadow.camera.near = 6;
      spot.shadow.camera.far = 80;
      spot.shadow.bias = -0.0004;
      spot.shadow.normalBias = 0.02;
      spot.shadow.radius = 4;
    }
    if (i === 3) spot.intensity = 0; // the fourth head lights the next stand, out of the story
    scene.add(spot, spot.target);
    world.mastSpots.push(spot);
    cones.push({ from: head.position.clone(), to: targets[i].clone(), glass, spot });
  }

  // A faint cone of light in the mist under each head.
  const coneMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { uColor: { value: new THREE.Color().setRGB(0.022, 0.012, 0.005) }, uGain: { value: 1 } },
    vertexShader: /* glsl */ `
      varying float vH; varying vec3 vN; varying vec3 vView;
      void main() { vH = uv.y; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vView = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uGain; varying float vH; varying vec3 vN; varying vec3 vView;
      void main() {
        float nl = max(length(vN), 1e-4), vl = max(length(vView), 1e-4);
        float edge = pow(clamp(abs(dot(vN, vView)) / (nl * vl), 0.0, 1.0), 1.6);
        float h = clamp(vH, 0.0, 1.0);
        float along = pow(h, 1.8) * (0.25 + 0.75 * smoothstep(0.0, 0.25, h));
        vec3 c = uColor * edge * along * uGain;
        gl_FragColor = vec4(c == c ? c : vec3(0.0), 1.0);
      }`,
  });
  world.coneMat = coneMat;
  world.mastHeads = [];
  for (const c of cones) {
    const len = c.from.distanceTo(c.to);
    const geo = new THREE.ConeGeometry(Math.tan(THREE.MathUtils.degToRad(13)) * len, len, 32, 1, true);
    geo.translate(0, -len / 2, 0);
    const mat = coneMat.clone();
    mat.uniforms.uColor.value = coneMat.uniforms.uColor.value;
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(c.from);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), c.to.clone().sub(c.from).normalize());
    m.renderOrder = 4;
    scene.add(m);
    world.mastHeads.push({ spot: c.spot, spotBase: c.spot.intensity, glass: c.glass.material, glassBase: c.glass.material.color.clone(), cone: mat });
  }
}

// ---------------------------------------------------------------- the private terminal

function buildTerminal(scene, world) {
  const glassTex = bakeTerminalGlass();
  const W = 100, H = 9, Z = -84, X = -18;
  const shell = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.75, metalness: 0.1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, 24), shell);
  body.position.set(X, H / 2, Z - 12.2);
  scene.add(body);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 2, H - 1.6),
    new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 0.08, metalness: 0.2, emissive: 0xffffff, emissiveMap: glassTex, emissiveIntensity: 1.1 })
  );
  glass.position.set(X, (H - 1.6) / 2 + 0.3, Z + 0.02);
  scene.add(glass);
  // roof slab and a deep fascia
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(W + 1, 1.2, 2.2), shell);
  fascia.position.set(X, H + 0.1, Z + 0.4);
  scene.add(fascia);
  // the airside canopy over the lobby doors, with a row of downlights
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(22, 0.35, 9), shell);
  canopy.position.set(X + 8, 4.6, Z + 4.5);
  scene.add(canopy);
  const dl = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(6, 4.4, 2.8) });
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 2; j++) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16).rotateX(Math.PI / 2), dl);
      d.position.set(X + 8 - 9.5 + i * 2.7, 4.41, Z + 2 + j * 4.5);
      scene.add(d);
    }
  }
  const canopyLight = new THREE.PointLight(0xffc98a, 160, 22, 2);
  canopyLight.position.set(X + 8, 4.0, Z + 5);
  scene.add(canopyLight);
  // columns
  const col = new THREE.MeshStandardMaterial({ color: 0x202226, roughness: 0.6 });
  for (let i = 0; i < 2; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.6, 0.4), col);
    c.position.set(X + 8 - 10.5 + i * 21, 2.3, Z + 8.6);
    scene.add(c);
  }
  world.terminal = { x: X, z: Z, w: W, h: H };
  world.terminalGlass = glassTex;
}

// ---------------------------------------------------------------- the hangar (shot 5)

function buildHangar(scene, world) {
  const { x, z, width, height } = HANGAR;
  const depth = 40, len = 52;
  const clad = new THREE.MeshStandardMaterial({ color: 0x1c1f23, roughness: 0.62, metalness: 0.35 });
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);
  const side = (w, h, d, px, py, pz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), clad);
    m.position.set(px, py, pz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  // walls (front face at local x = 0, facing -X toward the car)
  const H = height + 4;
  side(depth, 0.4, len, depth / 2, H, 0); // roof
  side(depth, H, 0.4, depth / 2, H / 2, -len / 2); // walls
  side(depth, H, 0.4, depth / 2, H / 2, len / 2);
  side(0.4, H, len, depth, H / 2, 0);
  const lintel = side(0.6, H - height, len, 0, height + (H - height) / 2, 0);
  side(0.6, height, (len - width) / 2, 0, height / 2, -(width / 2 + (len - width) / 4));
  side(0.6, height, (len - width) / 2, 0, height / 2, width / 2 + (len - width) / 4);
  // the inside: a warm-white working hangar, lit from the roof
  const inner = new THREE.Mesh(
    new THREE.PlaneGeometry(len - 1, H - 0.5).rotateY(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.9, emissive: 0xffc98e, emissiveIntensity: 0.0 })
  );
  inner.position.set(depth - 0.5, H / 2, 0);
  group.add(inner);
  // the back wall's cladding ribs, and rows of high-bay lamps under the roof
  {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#8a8378'; g.fillRect(0, 0, 1024, 256);
    for (let x = 0; x < 1024; x += 16) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, 0, 3, 256); }
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 170, 1024, 10);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    inner.material.map = t;
    inner.material.emissiveMap = t;
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 7; j++) {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16).rotateX(Math.PI / 2), lampMat);
      lamp.position.set(6 + i * 12, H - 0.6, -21 + j * 7);
      group.add(lamp);
    }
  }
  // a haze of light in the doorway once it opens
  const hazeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uK: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uK; varying vec2 vUv; void main(){ float x = 1.0 - abs(vUv.x - 0.5) * 2.0; float y = 1.0 - vUv.y; gl_FragColor = vec4(vec3(0.16, 0.11, 0.06) * uK * smoothstep(0.0, 0.35, x) * (0.35 + 0.65 * y), 1.0); }',
  });
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(width, height).rotateY(-Math.PI / 2), hazeMat);
  haze.position.set(-1.2, height / 2, 0);
  group.add(haze);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(depth, len).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x4a4844, roughness: 0.35, emissive: 0xffe2bc, emissiveIntensity: 0.0 })
  );
  floor.position.set(depth / 2, 0.01, 0);
  group.add(floor);
  // two door leaves that slide apart along the face
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.55, metalness: 0.45 });
  const leafW = width / 2 + 0.3;
  const doors = [-1, 1].map((s) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, height, leafW), doorMat);
    m.position.set(-0.45, height / 2, s * leafW / 2);
    m.castShadow = true;
    group.add(m);
    return m;
  });
  // the working light inside, aimed out at stand 7, shaped by the door gap
  const spot = new THREE.SpotLight(0xffd7a8, 0, 90, THREE.MathUtils.degToRad(24), 0.6, 2);
  spot.position.set(x + depth - 4, 7.5, z);
  spot.target.position.set(0.2, 0.7, 0.4);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 2;
  spot.shadow.camera.far = 90;
  spot.shadow.bias = -0.0005;
  spot.shadow.radius = 3;
  scene.add(spot, spot.target);

  // two wall packs over the side doors, so the hangar reads in the dark
  for (const s of [-1, 1]) {
    const pack = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20).rotateY(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.2, 1.35, 0.6) }));
    pack.position.set(x - 0.5, height + 1.6, z + s * (width / 2 + 5));
    scene.add(pack);
    const pl = new THREE.SpotLight(SODIUM, 900, 22, THREE.MathUtils.degToRad(50), 0.9, 2);
    pl.position.copy(pack.position).add(new THREE.Vector3(-0.4, -0.2, 0));
    pl.target.position.set(x - 6, 0, z + s * (width / 2 + 5));
    scene.add(pl, pl.target);
  }
  world.hangarOpen = 0;
  world.hangar = {
    open(t) {
      const k = THREE.MathUtils.clamp(t, 0, 1);
      world.hangarOpen = k;
      const gap = k * (width / 2);
      doors[0].position.z = -leafW / 2 - gap;
      doors[1].position.z = leafW / 2 + gap;
      spot.intensity = k > 0.001 ? 14000 * Math.min(1, k * 3) : 0;
      inner.material.emissiveIntensity = 0.22 * Math.min(1, k * 4);
      lampMat.color.setRGB(7, 5.4, 3.6).multiplyScalar(Math.min(1, k * 5));
      hazeMat.uniforms.uK.value = Math.min(1, k * 2.5);
      floor.material.emissiveIntensity = 0.06 * Math.min(1, k * 4);
    },
  };
  world.hangar.open(0);
  void lintel;
}

// ---------------------------------------------------------------- the control tower, far right

function buildTower(scene) {
  const { x, z, h } = TOWER;
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.8 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, h, 20), dark);
  shaft.position.set(x, h / 2, z);
  scene.add(shaft);
  const cabGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(6.2, 5.2, 3.4, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.16, 0.2, 0.15), side: THREE.DoubleSide })
  );
  cabGlass.position.set(x, h + 1.7, z);
  scene.add(cabGlass);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 6.4, 0.9, 8), dark);
  roof.position.set(x, h + 3.8, z);
  scene.add(roof);
  const under = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 3.2, 3, 8), dark);
  under.position.set(x, h - 1.5, z);
  scene.add(under);
  // the base building and a couple of lit windows
  const base = new THREE.Mesh(new THREE.BoxGeometry(30, 8, 16), dark);
  base.position.set(x - 6, 4, z + 4);
  scene.add(base);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(22, 1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.9, 0.55, 0.22) }));
  strip.position.set(x - 6, 5, z + 12.05);
  scene.add(strip);
}

// ---------------------------------------------------------------- a business jet on the next stand (set dressing)

function buildJet(scene, world) {
  const jet = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x8e9196, roughness: 0.38, metalness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.5 });
  // fuselage profile along local +Z (nose), lathe around Y then laid down
  const prof = [];
  const L = 24, R = 1.25;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const zz = t * L;
    let r;
    if (t < 0.12) r = R * Math.sqrt(t / 0.12) * (0.55 + 0.45 * t / 0.12); // nose
    else if (t < 0.7) r = R;
    else r = R * (1 - Math.pow((t - 0.7) / 0.3, 1.6) * 0.82); // tail cone
    prof.push(new THREE.Vector2(Math.max(0.02, r), zz));
  }
  const fus = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), paint);
  fus.rotation.x = -Math.PI / 2; // lathe axis onto -Z, nose first
  fus.position.set(0, 2.1, L / 2);
  fus.castShadow = true;
  jet.add(fus);
  // wings
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.lineTo(13.5, -4.2); wingShape.lineTo(13.5, -5.4); wingShape.lineTo(0, -6.2); wingShape.lineTo(0, 0);
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.28, bevelEnabled: false });
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wingGeo, paint);
    w.rotation.x = Math.PI / 2;
    w.scale.x = s;
    w.position.set(0, 1.35, 1.5);
    w.rotation.z = s * 0.06;
    jet.add(w);
  }
  // rear engines
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.55, 3.6, 20), paint);
    e.rotation.x = Math.PI / 2;
    e.position.set(s * 2.1, 2.9, -7.8);
    jet.add(e);
    const intake = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), dark);
    intake.position.set(s * 2.1, 2.9, -6.0);
    jet.add(intake);
  }
  // T-tail
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.2, 3.2), paint);
  fin.position.set(0, 5.1, -10.6);
  fin.rotation.x = -0.35;
  jet.add(fin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.18, 1.9), paint);
  stab.position.set(0, 7.0, -11.6);
  jet.add(stab);
  // cabin windows: small warm ovals along both sides
  const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.6, 1.7, 0.95) });
  const winGeo = new THREE.CircleGeometry(0.17, 12);
  winGeo.scale(1, 1.35, 1);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const w = new THREE.Mesh(winGeo, winMat);
      w.position.set(s * (R + 0.01), 2.35, 3.6 - i * 1.05);
      w.rotation.y = s * Math.PI / 2;
      jet.add(w);
    }
  }
  // gear legs and the cockpit glass
  for (const p of [[0, 0, 8.6], [-1.4, 0, -0.4], [1.4, 0, -0.4]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8), dark);
    leg.position.set(p[0], 0.75, p[2]);
    jet.add(leg);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 16), dark);
    tyre.rotation.z = Math.PI / 2;
    tyre.position.set(p[0], 0.36, p[2]);
    jet.add(tyre);
  }
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), new THREE.MeshPhysicalMaterial({ color: 0x050607, roughness: 0.05, metalness: 0.4 }));
  cockpit.position.set(0, 2.55, 9.4);
  cockpit.rotation.x = 0.9;
  jet.add(cockpit);

  jet.position.set(30, 0, -56);
  jet.rotation.y = -1.05;
  scene.add(jet);
  world.jet = jet;

  // a soft light on the jet from a mast off to the left
  const jl = new THREE.SpotLight(SODIUM, 3800, 60, THREE.MathUtils.degToRad(28), 0.7, 2);
  jl.position.set(46, 16, -40);
  jl.target.position.set(30, 1, -56);
  scene.add(jl, jl.target);
}

// ---------------------------------------------------------------- distant lights

function buildFarLights(scene, world) {
  const L = new FarLights();
  const v = (x, y, z) => new THREE.Vector3(x, y, z);

  // other mast heads around the apron (no light pools, just the lamps and their reflections)
  for (const [x, z] of [[-78, -36], [-120, -20], [64, -48], [-46, 64], [110, -10]]) {
    for (let i = 0; i < 4; i++) L.add(v(x - 1.5 + i, 18, z), SODIUM, 26, 0.5);
  }
  // blue taxiway edge lights, two lines and a curve into the apron
  for (let x = -260; x <= 260; x += 14) {
    L.add(v(x, 0.35, 62), TAXI_BLUE, 5.5, 0.14);
    L.add(v(x + 7, 0.35, 86), TAXI_BLUE, 5.5, 0.14);
  }
  for (let a = 0; a <= 1; a += 0.08) {
    const x = -40 + Math.cos(a * Math.PI / 2) * 22, z = 40 + Math.sin(a * Math.PI / 2) * 22;
    L.add(v(x, 0.35, z), TAXI_BLUE, 5.5, 0.14);
    L.add(v(x + 30, 0.35, z - 4), TAXI_BLUE, 5.5, 0.14);
  }
  // green taxiway centre line
  for (let x = -250; x <= 250; x += 9) L.add(v(x, 0.1, 74), 0x3fd27a, 2.0, 0.09);

  // runway edge lights (white), threshold (green), runway end (red), centreline
  const R = RUNWAY;
  const half = R.length / 2;
  for (let s = -half; s <= half; s += 60) {
    for (const side of [-1, 1]) {
      const p = R.centre.clone().addScaledVector(R.dir, s).addScaledVector(R.side, side * R.width / 2);
      p.y = 0.4;
      L.add(p, 0xfff3df, 14, 0.18);
    }
    const c = R.centre.clone().addScaledVector(R.dir, s); c.y = 0.1;
    L.add(c, 0xfff6e8, 5, 0.12);
  }
  for (let k = -10; k <= 10; k++) {
    const p0 = R.centre.clone().addScaledVector(R.dir, -half).addScaledVector(R.side, k * 2.2); p0.y = 0.3;
    L.add(p0, 0x3fe07a, 12, 0.16);
    const p1 = R.centre.clone().addScaledVector(R.dir, half).addScaledVector(R.side, k * 2.2); p1.y = 0.3;
    L.add(p1, RED, 10, 0.16);
  }
  // approach lights out over the water, with the sequenced flashers ("the rabbit")
  for (let i = 1; i <= 30; i++) {
    const p = R.centre.clone().addScaledVector(R.dir, -half - i * 30); p.y = 3;
    L.add(p, 0xfff3df, 7, 0.2);
    L.add(p.clone().setY(3.2), 0xffffff, 60, 0.2, [1.0, -i * 0.025, 0.025, 3]);
  }
  // PAPI, four boxes beside the touchdown point: two white, two red (on the slope)
  for (let k = 0; k < 4; k++) {
    const p = R.touchdown.clone().addScaledVector(R.side, -R.width / 2 - 15 - k * 9); p.y = 0.6;
    L.add(p, k < 2 ? 0xfff0e0 : RED, 22, 0.3);
  }
  // the obstacle light on a far mast, every 1.5 s
  L.add(v(TOWER.x, TOWER.h + 4.5, TOWER.z), RED, 10, 0.4, [1.5, 0, 0.5, 1]);
  // the beacon on the parked jet
  L.add(v(30 + Math.sin(-1.05) * -3, 7.4, -56 + Math.cos(-1.05) * -3), RED, 9, 0.12, [1.2, 0.3, 0.12, 1]);

  // the coast across the bay: a road of sodium lights at the waterline, towns on the slopes
  for (const r of world.ridges) {
    const count = r.z < 5000 ? 1400 : r.z < 7000 ? 1800 : 900;
    for (let i = 0; i < count; i++) {
      const x = r.x0 + 1700 + rand(i, r.seed) * (r.x1 - r.x0 - 3400);
      const top = ridgeHeight(r, x);
      // towns gather low on the slopes and in a few clusters
      const cluster = vnoise(x / 900, r.seed * 7.3, 5);
      if (cluster < 0.35 && rand(i, r.seed + 9) > 0.25) continue;
      const y = Math.pow(rand(i, r.seed + 3), 2.2) * top * 0.85 + 4;
      if (y > top - 6) continue;
      const warm = rand(i, r.seed + 5);
      const col = warm > 0.82 ? 0xf2efe6 : warm > 0.3 ? 0xffb25e : 0xffcf8a;
      L.add(v(x, y, r.z - 30), col, (r.z < 5000 ? 30 : r.z < 7000 ? 44 : 50) * (0.4 + rand(i, r.seed + 7) * 0.9), 2.4);
    }
    if (r.z < 5000) {
      for (let x = r.x0 + 1800; x < r.x1 - 1800; x += 38 + rand(x, 4) * 30) L.add(v(x, 6, r.z - 80), SODIUM, 34, 1.6);
    }
  }
  const pts = L.build();
  scene.add(pts);
  world.farLights = L;
}

// ---------------------------------------------------------------- the plane's lights (shot 4)

function buildPlane(scene, world) {
  const L = new FarLights();
  const z = new THREE.Vector3();
  // landing lights, left and right; nav red/green; strobes; tail; beacon
  // base colours at intensity 1; place() scales them each frame
  L.add(z, 0xfff6ea, 1, 1.2);
  L.add(z, 0xfff6ea, 1, 1.2);
  L.add(z, 0xff2a20, 1, 0.25);
  L.add(z, 0x3dff7a, 1, 0.25);
  L.add(z, 0xffffff, 1, 0.3, [1.1, 0, 0, 2]);
  L.add(z, 0xffffff, 1, 0.3, [1.1, 0.02, 0, 2]);
  L.add(z, 0xffffff, 1, 0.2);
  L.add(z, RED, 1, 0.25, [1.25, 0.5, 0.1, 1]);
  const pts = L.build(true);
  // landing lights carry much further through the night air than town lights
  L.material.uniforms.uExt.value = 0.00004;
  scene.add(pts);
  world.planeLights = L;
  const pos = pts.geometry.attributes.position;
  const col = pts.geometry.attributes.aColor;
  const base = L.items.map((it) => it.c.slice());
  const R = RUNWAY;
  const glide = Math.tan(THREE.MathUtils.degToRad(3));
  const tmp = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  // t: 0 far out over the sea, 0.8 touchdown, 1 rolled out and slowing
  world.plane = {
    visible: false,
    place(t, camera) {
      let p, alt;
      if (t < 0.8) {
        const s = (1 - t / 0.8);
        const dist = Math.pow(s, 1.25) * 9000;
        p = R.touchdown.clone().addScaledVector(R.dir, -dist);
        alt = dist * glide + 2.2;
        // the flare
        if (dist < 300) alt = 2.2 + (dist * glide) * Math.pow(dist / 300, 0.6);
      } else {
        const r = (t - 0.8) / 0.2;
        const roll = (1 - Math.pow(1 - r, 1.6)) * 520;
        p = R.touchdown.clone().addScaledVector(R.dir, roll);
        alt = 2.2;
      }
      p.y = alt;
      const fwd = R.dir;
      const right = R.side.clone().negate();
      const set = (i, v3, k) => {
        pos.setXYZ(i, v3.x, v3.y, v3.z);
        col.setXYZ(i, base[i][0] * k, base[i][1] * k, base[i][2] * k);
      };
      camDir.copy(camera.position).sub(p).normalize();
      const facing = Math.max(0, fwd.dot(camDir));
      const land = this.visible ? Math.max(t > 0.8 ? 55 : 8, 8 + 240 * Math.pow(facing, 3)) : 0;
      const on = this.visible ? 1 : 0;
      set(0, tmp.copy(p).addScaledVector(right, -2.2).addScaledVector(fwd, 4), land);
      set(1, tmp.copy(p).addScaledVector(right, 2.2).addScaledVector(fwd, 4), land);
      set(2, tmp.copy(p).addScaledVector(right, -14), 9 * on);
      set(3, tmp.copy(p).addScaledVector(right, 14), 9 * on);
      set(4, tmp.copy(p).addScaledVector(right, -14.2), 70 * on);
      set(5, tmp.copy(p).addScaledVector(right, 14.2), 70 * on);
      set(6, tmp.copy(p).addScaledVector(fwd, -15).setY(p.y + 1.5), 5 * on);
      set(7, tmp.copy(p).setY(p.y + 2.2), 14 * on);
      pos.needsUpdate = true;
      col.needsUpdate = true;
      return { p, facing };
    },
  };
}

// ---------------------------------------------------------------- reflections on the car

// A small scene of emissive cards placed where the real lights are, prefiltered with PMREM.
function buildEnvMap(renderer, hangarOpen, glassTex) {
  const pm = new THREE.PMREMGenerator(renderer);
  const env = buildEnvScene(hangarOpen, glassTex);
  // V5: the polish round stand 7 (world/Polish.js); captured from the ground, so drawn half a metre lower
  env.add(polish(new THREE.Vector3(0, 0, 0), 0, 1, 0.5));
  const rt = pm.fromScene(env, 0, 0.1, 200);
  pm.dispose();
  return rt.texture;
}

// The cards themselves, seen from stand 7. The casting reel reuses them from each car's own spot.
export function buildEnvScene(hangarOpen, glassTex) {
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(80, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vD; void main(){ float y = vD.y; vec3 c = mix(vec3(0.05,0.035,0.024), vec3(0.008,0.010,0.015), smoothstep(-0.05,0.5,y)); if (y < 0.0) c = mix(vec3(0.02,0.016,0.012), vec3(0.004), smoothstep(0.0,-0.4,y)); gl_FragColor = vec4(c,1.0); }',
    })
  );
  env.add(sky);
  const card = (w, h, color, k, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.copy(pos);
    m.lookAt(look || new THREE.Vector3(0, 1, 0));
    env.add(m);
  };
  // the mast's lamp heads: four hot sodium rectangles high behind left
  const dirM = MAST.clone().setY(17.8).normalize().multiplyScalar(30);
  for (let i = 0; i < 4; i++) card(0.9, 0.55, SODIUM, 10, dirM.clone().add(new THREE.Vector3(-1.6 + i * 1.05, 0, 0)));
  // the terminal: its real glass front, so the clearcoat shows the windows and mullions
  {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(120, 10), new THREE.MeshBasicMaterial({ map: glassTex, color: new THREE.Color(1.7, 1.7, 1.7), side: THREE.DoubleSide }));
    m.position.set(-14, 5, -60);
    m.lookAt(0, 1, 0);
    env.add(m);
  }
  // the canopy downlights
  card(18, 0.6, 0xffd39a, 6, new THREE.Vector3(-6, 4.4, -55));
  // other masts around the apron, as small hot spots
  for (const [x, z] of [[-78, -36], [64, -48], [-46, 64], [110, -10]]) {
    const d = new THREE.Vector3(x, 18, z).normalize().multiplyScalar(55);
    card(2.2, 0.5, SODIUM, 5, d);
  }
  // long thin strips where real lines of light are, so the paint carries highlight lines
  card(70, 0.18, 0xffd8a8, 9, new THREE.Vector3(-10, 6.5, -55));
  card(90, 0.12, SODIUM, 7, new THREE.Vector3(-20, 16, -62));
  card(0.16, 40, SODIUM, 5, new THREE.Vector3(-60, 9, 10));
  card(60, 0.14, 0xffe2bc, 8, new THREE.Vector3(10, 11, 55));
  // a dim horizon strip of town light across the bay
  card(160, 3, 0xffa860, 0.35, new THREE.Vector3(0, 2.5, 70));
  // The horizon all round: a thin band of town glow at eye level. On a car's flank it reflects as the one
  // crisp line that tells you the paint is glass-smooth (the flank shots read as flat red plastic without it).
  {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(64, 64, 7, 96, 1, true),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: 'varying vec3 vP; varying vec2 vU; void main(){ vP = position; vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        // brighter toward the town across the bay (+Z and west), soft top and bottom edges
        // a hard bright line of lights at the bottom, a haze of their glow rising above it
        fragmentShader: 'varying vec3 vP; varying vec2 vU; void main(){ float a = atan(vP.x, vP.z); float town = 0.45 + 0.55 * smoothstep(-0.2, 1.0, cos(a + 0.5)); float h = vU.y; float line = exp(-pow((h - 0.07) / 0.035, 2.0)) * 2.2; float haze = smoothstep(0.0, 0.08, h) * exp(-h * 3.2) * 0.75; gl_FragColor = vec4(vec3(1.0, 0.62, 0.34) * (line + haze) * town, 1.0); }',
      })
    );
    band.position.y = 3.4;
    env.add(band);
  }
  // The town's lights themselves along that line, small and hot, where the far lights are: across the bay
  // and to the west. A flank or a bonnet picks them up as a string of points, the way a real car does.
  {
    const pts = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), 420);
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    for (let i = 0; i < 420; i++) {
      const a = -0.5 + (rand(i, 41) - 0.5) * 2.6; // centred on the bay
      const y = 0.25 + Math.pow(rand(i, 42), 2.2) * 2.6;
      o.position.set(Math.sin(a) * 62, y, Math.cos(a) * 62);
      o.lookAt(0, y, 0);
      o.updateMatrix();
      pts.setMatrixAt(i, o.matrix);
      col.set(rand(i, 43) < 0.8 ? 0xffb46a : 0xfff0dc).multiplyScalar(3 + rand(i, 44) * 5);
      pts.setColorAt(i, col);
    }
    env.add(pts);
  }
  if (hangarOpen) card(30, 12, 0xffd7a8, 4.0, new THREE.Vector3(HANGAR.x - 4, 6, HANGAR.z));
  return env;
}
