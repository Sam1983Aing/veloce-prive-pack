// The showroom: five bays in a row along +X, a satin floor that reflects every car, bay numbers
// painted on the floor, three strip tubes per bay, and the tunnel the car leaves through.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { BAY_SPACING } from './fleet.js';

const BAYS = 5;
const WHITE = 0xfffcf6;
// V5: the reflection studio's levels in one place, so tuning is one line. C2 V3's values where noted.
const ENV = {
  laylight: 3.0, // the overhead softbox
  wallTop: 0.8, // the high band on each long wall, feathered (V6: 0.7, hard-edged)
  ends: 0.7, // the end panels, feathered (V6: 0.6, hard-edged)
  horizon: 1.6, // the line round the room at door height
  wash: 0.32, // fading up from the horizon
  pool: 0.5, // under the car
  card: 0.32, // C2 V3's pale card, feathered
  strip: 15, // C1's strips: a crisp core in a soft band
  stripWidth: 0.9,
};


export class Showroom {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    RectAreaLightUniformsLib.init();

    // tubes[bay][n] is the level of tube n in that bay, 0 to 1. Everything that is lit reads from it.
    this.tubes = Array.from({ length: BAYS }, () => [0, 0, 0]);
    this.carZ = new Float32Array(BAYS);
    this.carVisible = new Float32Array(BAYS);
    this.dim = 1; // the whole room, for the rev and the drive

    this.tubeShow = 0; // the tubes themselves are only seen in the hero, where they draw the row
    this._env();
    this._floor();
    this._tunnel();
    this._tubeMeshes();
    this._room();
  }

  // The room itself: a back wall behind the row and a ceiling, so the light has something to land on.
  // Each lit bay washes the wall above and behind its car from the top down, like a showroom's
  // wall washers, with shadow-gap joints every 3.2 m so it reads as a built wall, not a gradient.
  // Far behind the cars (z 10.5) so no camera on the page ever stands behind it.
  _room() {
    const u = {
      uBayX: { value: new Float32Array(BAYS) },
      uLevel: { value: new Float32Array(BAYS) },
      uDim: { value: 1 },
    };
    for (let i = 0; i < BAYS; i++) u.uBayX.value[i] = this.bayX(i);
    this.roomU = u;
    const wallMat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uBayX[5];
        uniform float uLevel[5];
        uniform float uDim;
        varying vec3 vW;
        void main() {
          float wash = 0.0;
          for (int i = 0; i < 5; i++) {
            float dx = (vW.x - uBayX[i]) / 2.6;
            wash += uLevel[i] * exp(-dx * dx);
          }
          float fromTop = smoothstep(0.0, 5.4, vW.y);
          float profile = 0.25 + 0.75 * pow(fromTop, 1.6);
          // shadow-gap joints every 3.2 m, a line of darkness about 1.5 cm wide
          float j = abs(fract(vW.x / 3.2 + 0.5) - 0.5) * 3.2;
          float joint = mix(0.45, 1.0, smoothstep(0.004, 0.016, j));
          vec3 plaster = vec3(0.0042, 0.0038, 0.0034);
          vec3 lit = vec3(0.060, 0.052, 0.044) * wash * profile;
          // fine plaster grain, so the washed wall has a surface, not a gradient
          vec2 gp = floor(vW.xy * 140.0);
          float grain = fract(sin(dot(gp, vec2(12.9898, 78.233))) * 43758.5453);
          vec3 c = (plaster + lit * (0.93 + 0.14 * grain)) * joint * uDim;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 6.2), wallMat);
    this.wall.position.set(-12, 3.1, 10.5);
    this.wall.rotation.y = Math.PI;
    this.scene.add(this.wall);
    const ceilMat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: wallMat.vertexShader,
      fragmentShader: /* glsl */ `
        uniform float uBayX[5];
        uniform float uLevel[5];
        uniform float uDim;
        varying vec3 vW;
        void main() {
          float wash = 0.0;
          float up = 0.0;
          for (int i = 0; i < 5; i++) {
            vec2 d = vec2((vW.x - uBayX[i]) / 2.2, vW.z / 3.4);
            wash += uLevel[i] * exp(-dot(d, d));
            // V7: the fixture's uplight, a long soft pool on the ceiling straight above it
            vec2 f = vec2((vW.x - uBayX[i] - 0.15) / 0.9, (vW.z - 0.7) / 2.3);
            up += uLevel[i] * exp(-dot(f, f));
          }
          vec3 c = (vec3(0.0022, 0.002, 0.0018) + vec3(0.016, 0.014, 0.012) * wash + vec3(0.05, 0.047, 0.042) * up) * uDim;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.ceiling = new THREE.Mesh(new THREE.PlaneGeometry(60, 24), ceilMat);
    this.ceiling.rotation.x = Math.PI / 2;
    this.ceiling.position.set(-12, 4.6, 0);
    this.scene.add(this.ceiling);
  }

  // The row runs along -X, so from the hero camera (front left of the car) the next bays recede to the right.
  bayX(i) {
    return -i * BAY_SPACING;
  }

  level(i) {
    const t = this.tubes[i];
    return (t[0] + t[1] + t[2]) / 3;
  }

  // What the paint reflects (V7). Sam on V6: the light "feels too blocky, and the reflection doesn't
  // feel realistic". V5's room was hard-edged rectangles (walls, end panels, a laylight), and a glossy
  // car shows every edge of what it reflects, so the flanks carried flat slabs of grey with hard
  // borders. V7 is lit the way a car photographer lights a car: everything soft-edged, mostly dark.
  //   - a long overhead softbox, feathered, for one soft highlight down the roof and the bonnet
  //   - C1's three strips, a crisp core in a soft band, as before
  //   - a horizon all round at the height of the doors: the bright line where floor meets wall that
  //     every real studio shot has along its sills, with a soft wash fading up from it
  //   - a soft pool and a pale card on the floor, so sills and wheels still catch light
  // PMREM looks out from the origin, the floor, so the whole studio is drawn 0.45 m lower.
  _env() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x040404);
    const box = new THREE.Mesh(new THREE.BoxGeometry(14, 4.8, 12), new THREE.MeshBasicMaterial({ color: 0x070707, side: THREE.BackSide }));
    box.position.y = 2.4;
    env.add(box);
    // a light with no hard edge: added over the dark room, faded at its borders
    const soft = (w, h, color, k, pos, look, up = [0, 1, 0], tex = this._softTex(0.3, 0.3)) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
        map: tex, color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.position.set(...pos);
      m.up.set(...up);
      m.lookAt(new THREE.Vector3(...look));
      env.add(m);
      return m;
    };
    // the overhead softbox, long along the car
    soft(3.4, 7.6, 0xfff6ec, ENV.laylight, [0, 4.6, 0], [0, 0, 0], [0, 0, 1], this._softTex(0.32, 0.22));
    // (four tall corner strip boxes were tried here: on these curved panels they read as soft white
    // smudges on the doors, not as the long lines they give a real car, so they are out)
    // the room's broad light, V6's strength kept but feathered: a band high on each long wall and a
    // panel at each end. V6 had these as hard rectangles, the "blocky" slabs on the flanks.
    for (const sx of [-1, 1]) soft(11.5, 2.0, 0xffeadb, ENV.wallTop, [sx * 6.95, 3.7, 0], [0, 3.7, 0], [0, 1, 0], this._softTex(0.3, 0.42));
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) soft(4.6, 1.8, 0xffeadb, ENV.ends, [sx * 4.4, 3.7, sz * 5.95], [sx * 4.4, 3.7, 0], [0, 1, 0], this._softTex(0.35, 0.42));
    // the horizon round the room, and the wash fading up from it
    const walls = [
      [[6.95, 0, 0], [0, 0, 0], 12], [[-6.95, 0, 0], [0, 0, 0], 12],
      [[0, 0, 5.95], [0, 0, 0], 14], [[0, 0, -5.95], [0, 0, 0], 14],
    ];
    for (const [pos, , len] of walls) {
      const at = (y) => [pos[0], y, pos[2]];
      const look = (y) => [0, y, 0];
      soft(len, 0.32, 0xfff3e8, ENV.horizon, at(0.95), look(0.95), [0, 1, 0], this._softTex(0.08, 0.5));
      soft(len, 1.8, 0xfff0e2, ENV.wash, at(1.95), look(1.95), [0, 1, 0], this._washTex());
    }
    // the floor: a soft pool under the car and the pale card (C2 V3's "Low bounce"), both feathered
    const radial = this._softTex(0.5, 0.5, true);
    soft(5.0, 8.4, 0xfff0e0, ENV.pool, [0, 0.01, 0], [0, 1, 0], [0, 0, -1], radial);
    soft(7.0, 7.0, 0xfff3e6, ENV.card, [0, 0.016, 0], [0, 1, 0], [0, 0, -1], radial);
    // C1's three strips, a crisp core in a soft band
    const strip = (pos, look, up) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(6.4, ENV.stripWidth), new THREE.MeshBasicMaterial({
        map: this._stripTex(), color: new THREE.Color(WHITE).multiplyScalar(ENV.strip), side: THREE.DoubleSide,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.position.set(...pos);
      m.up.set(...up);
      m.lookAt(new THREE.Vector3(...look));
      env.add(m);
    };
    strip([0.15, 2.85, 0], [0.15, 0, 0], [1, 0, 0]);
    strip([-2.85, 1.25, -0.15], [0, 0.56, -0.05], [0, 0, 1]);
    strip([2.65, 1.45, 0.45], [0, 0.65, 0.2], [0, 0, 1]);
    for (const o of env.children) o.position.y -= 0.45;
    this.scene.environment = pmrem.fromScene(env, 0, 0.1, 40, { size: 512 }).texture;
    this.scene.environmentIntensity = 1;
    pmrem.dispose();
    env.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }

  // A soft-edged panel: full in the middle, falling off smoothly over the outer fraction fx (across)
  // and fy (along), or a round pool if radial. Cached per shape.
  _softTex(fx, fy, radial = false) {
    const key = `${fx}:${fy}:${radial}`;
    this._soft = this._soft || {};
    if (this._soft[key]) return this._soft[key];
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
    return (this._soft[key] = t);
  }

  // The wash above the horizon: brightest just over the line, fading up into the dark; ends faded.
  _washTex() {
    if (this._wash) return this._wash;
    const N = 128;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N, v = 1 - (y + 0.5) / N; // v: 0 at the bottom of the panel
      const ends = THREE.MathUtils.smoothstep(u, 0, 0.2) * THREE.MathUtils.smoothstep(1 - u, 0, 0.2);
      const a = Math.pow(1 - v, 2.2) * THREE.MathUtils.smoothstep(v, 0, 0.06) * ends;
      const k = (y * N + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(255 * a);
      img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this._wash = new THREE.CanvasTexture(c);
    this._wash.colorSpace = THREE.NoColorSpace;
    return this._wash;
  }

  // A strip's light across its width (v) and along its length (u): a soft core with a wider skirt,
  // and ends that fade instead of stopping.
  _stripTex() {
    if (this._strip) return this._strip;
    const W = 64, H = 128;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const v = (y + 0.5) / H * 2 - 1;
      // V5 round 2: a crisp core inside the soft band. Soft alone read as smeared blobs with no line
      // in the paint; the hairline alone stepped on every flat face. The core is the line, the band hides the steps.
      const across = 0.55 * Math.exp(-v * v * 110) + 0.3 * Math.exp(-v * v * 14) + 0.15 * Math.exp(-v * v * 3.5);
      for (let x = 0; x < W; x++) {
        const u = Math.abs((x + 0.5) / W * 2 - 1);
        const along = 1 - THREE.MathUtils.smoothstep(u, 0.78, 1.0);
        const k = (y * W + x) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(255 * across * along);
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this._strip = new THREE.CanvasTexture(c);
    this._strip.colorSpace = THREE.NoColorSpace;
    return this._strip;
  }

  _floor() {
    const W = 2880, H = 1120, PPM = 80; // 36 m by 14 m of floor at 80 px a metre
    this.markOrigin = new THREE.Vector2(-30.4, -8.0);
    this.markSize = new THREE.Vector2(W / PPM, H / PPM);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    this.markCanvas = canvas;
    this.markTex = new THREE.CanvasTexture(canvas);
    this.markTex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.markTex.colorSpace = THREE.NoColorSpace;
    this.drawMarkings();

    const u = {
      uCarX: { value: new Float32Array(BAYS) },
      uCarZ: { value: this.carZ },
      uLevel: { value: new Float32Array(BAYS) },
      uVisible: { value: this.carVisible },
      uMarks: { value: this.markTex },
      uMarkOrigin: { value: this.markOrigin },
      uMarkSize: { value: this.markSize },
      uMarkAlpha: { value: 1 },
      uDrive: { value: 0 },
      uRoad: { value: 0 },
      uDim: { value: 1 },
      uTail: { value: new THREE.Vector4() },
      uHead: { value: new THREE.Vector4() },
      uReflK: { value: 1 }, // V7: how much the floor reflects, lowered where words sit on it
    };
    for (let i = 0; i < BAYS; i++) u.uCarX.value[i] = this.bayX(i);
    this.floorU = u;

    const shader = {
      name: 'C1V4Floor',
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, ...u },
      vertexShader: /* glsl */ `
        uniform mat4 textureMatrix;
        varying vec4 vUv;
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vUv = textureMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D uMarks;
        uniform float uCarX[5];
        uniform float uCarZ[5];
        uniform float uLevel[5];
        uniform float uVisible[5];
        uniform vec2 uMarkOrigin;
        uniform vec2 uMarkSize;
        uniform float uMarkAlpha;
        uniform float uDrive;
        uniform float uRoad;
        uniform float uDim;
        uniform vec4 uTail;
        uniform vec4 uHead;
        uniform float uReflK;
        varying vec4 vUv;
        varying vec3 vWorld;

        float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
        float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

        void main() {
          float near = 99.0;      // distance to the closest car footprint
          float wheelNear = 99.0; // distance to the closest tyre, in tyre-sized units
          float shadow = 1.0;     // contact shadow, multiplied over the cars
          float pool = 0.0;       // light under each bay
          float lit = 0.0;        // light level of the nearest bay
          for (int i = 0; i < 5; i++) {
            vec2 local = vec2(vWorld.x - uCarX[i], vWorld.z - uCarZ[i]);
            float lvl = uLevel[i];
            pool += exp(-0.22 * (local.x * local.x * 1.05 + local.y * local.y * 0.36)) * lvl;
            if (uVisible[i] < 0.5) continue;
            vec2 d = max(abs(local) - vec2(0.96, 2.22), vec2(0.0));
            float dist = length(d);
            if (dist < near) { near = dist; lit = lvl; }
            vec2 n = local / vec2(0.95, 2.2);
            float ao = smoothstep(0.0, 0.62, length(max(abs(n) - vec2(0.7, 0.78), 0.0)));
            float under = mix(0.02, 1.0, ao);
            float t1 = smoothstep(0.0, 0.36, length((local - vec2(-0.84, -1.34)) / vec2(0.72, 1.25)));
            float t2 = smoothstep(0.0, 0.36, length((local - vec2( 0.84, -1.34)) / vec2(0.72, 1.25)));
            float t3 = smoothstep(0.0, 0.36, length((local - vec2(-0.84,  1.32)) / vec2(0.72, 1.25)));
            float t4 = smoothstep(0.0, 0.36, length((local - vec2( 0.84,  1.32)) / vec2(0.72, 1.25)));
            shadow *= min(under, mix(0.01, 1.0, min(min(t1, t2), min(t3, t4))));
            // near each tyre the floor shows the wheel: keep that reflection dark, like rubber
            vec2 wq = abs(local) - vec2(0.84, 1.33);
            wheelNear = min(wheelNear, length(wq / vec2(0.55, 0.75)));
          }

          // V7: the reflection reaches further from the car and fades out slowly, like polished stone
          float reach = mix(3.8, 4.5, uDrive);
          float fade = 1.0 - smoothstep(0.2, reach, near);

          vec3 col = vec3(0.016, 0.0154, 0.0146) * pool * uDim;

          // Painted bay numbers and the hairlines between bays.
          vec2 muv = (vWorld.xz - uMarkOrigin) / uMarkSize;
          if (muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0) {
            float m = texture2D(uMarks, vec2(muv.x, 1.0 - muv.y)).r;
            col += vec3(0.020, 0.0195, 0.0185) * m * uMarkAlpha * (0.25 + pool * 1.6) * uDim;
          }

          if (uDrive > 0.01) {
            vec2 g = vec2(vWorld.x * 20.0, (vWorld.z - uRoad) * 7.0);
            col += vec3((hash12(floor(g)) - 0.5) * 0.004 * uDrive) * fade;
          }
          col *= shadow;
          // Red spill from the tail lamps when the engine is held.
          vec2 td = (vWorld.xz - uTail.xy) / vec2(0.95, 0.7);
          col += vec3(0.11, 0.0015, 0.003) * uTail.z * exp(-dot(td, td));
          // Headlamps on the floor ahead of the car: a long soft wedge of warm white.
          vec2 hd = vWorld.xz - uHead.xy;
          float ahead = smoothstep(0.0, 1.2, -hd.y);
          float spread = 0.55 + 0.2 * max(0.0, -hd.y);
          col += vec3(0.04, 0.038, 0.035) * uHead.z * ahead * exp(-pow(hd.x / spread, 2.0)) * exp(-max(0.0, -hd.y) * 0.5);

          if (fade > 0.001) {
            vec2 puv = vUv.xy / max(vUv.w, 0.0001);
            float r = mix(0.0008, 0.011, smoothstep(0.0, 2.6, near)); // V7: sharp where the car meets the floor, softening with distance
            vec2 sc = vec2(r * 0.85, r * 1.35);
            float a0 = ign(gl_FragCoord.xy) * 6.2831853;
            vec3 refl = vec3(0.0);
            float tw = 0.0;
            for (int i = 0; i < 24; i++) {
              float fi = float(i);
              float rr = sqrt((fi + 0.5) / 24.0);
              float th = fi * 2.3999632 + a0;
              float w = exp(-1.6 * rr * rr);
              vec3 s = texture2D(tDiffuse, clamp(puv + vec2(cos(th), sin(th)) * rr * sc, 0.002, 0.998)).rgb;
              refl += (s / (1.0 + s * 0.55)) * w;
              tw += w;
            }
            refl /= tw;
            // V7: Fresnel. Looked at from above, a polished floor shows little; at a glancing angle it
            // is nearly a mirror. A flat 0.38 everywhere read as a grey smudge under the car.
            vec3 toEye = normalize(cameraPosition - vWorld);
            float fres = 0.04 + 0.96 * pow(1.0 - clamp(toEye.y, 0.0, 1.0), 5.0);
            col += refl * (0.14 + 0.56 * fres) * uReflK * fade * max(0.3, lit) * mix(0.25, 1.0, shadow) * mix(0.4, 1.0, smoothstep(0.7, 3.0, wheelNear));
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    };

    this.reflector = new Reflector(new THREE.PlaneGeometry(120, 120), {
      clipBias: 0.002,
      // 1024: at 768 the wheels still blurred to grey balls. V4 could not afford it; V5 dropped the six
      // area lights on the cars, which paid for it.
      textureWidth: 1024,
      textureHeight: 1024,
      color: 0x000000,
      shader,
    });
    // Reflector clones the uniforms it is given. Scalars and vectors set on the originals would never
    // reach the shader (typed arrays survive the clone because they are copied by reference), so
    // from here on everything talks to the material's own uniforms.
    this.floorU = this.reflector.material.uniforms;
    this.reflector.rotation.x = -Math.PI / 2;
    this.reflector.position.set(-12, 0.001, 0);
    this.scene.add(this.reflector);
  }

  // Bay numbers in Archivo, wide and light, as if painted on a garage floor. Redrawn once the font has loaded.
  drawMarkings() {
    const c = this.markCanvas;
    const ctx = c.getContext('2d');
    const ppm = c.width / this.markSize.x;
    const toPx = (x, z) => [(x - this.markOrigin.x) * ppm, (z - this.markOrigin.y) * ppm];
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    try { ctx.fontStretch = 'expanded'; } catch {}
    ctx.font = `300 ${Math.round(1.1 * ppm)}px Archivo, sans-serif`;
    for (let i = 0; i < BAYS; i++) {
      // Behind each car, where a showroom paints its bay numbers: read over the roof from the front.
      const [x, y] = toPx(this.bayX(i), 3.7);
      // Lying flat and turned half round, so it reads the right way from in front of the cars.
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI);
      ctx.fillText(`0${i + 1}`, 0, 0);
      ctx.restore();
    }
    // One line behind the row, where the display floor ends. No lines between bays: they cut through the type.
    ctx.lineWidth = Math.max(1, 0.02 * ppm);
    const [x0, yb] = toPx(this.bayX(BAYS - 1) - BAY_SPACING / 2, 4.9);
    const [x1] = toPx(this.bayX(0) + BAY_SPACING / 2, 4.9);
    ctx.beginPath();
    ctx.moveTo(x0, yb);
    ctx.lineTo(x1, yb);
    ctx.stroke();
    this.markTex.needsUpdate = true;
  }

  // Tunnel for the drive: two rows of slim tubes along the upper side walls, every 4 m.
  _tunnel() {
    // The group stays visible so its two area lights never leave the scene: a light count change
    // recompiles every material, which would stall the first frame of the drive.
    this.tunnel = new THREE.Group();
    this.tunnelCount = 30;
    this.tunnelGap = 4;
    this.tunnelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff3dc) });
    const geo = new THREE.BoxGeometry(0.07, 0.05, 1.8);
    this.tubesL = new THREE.InstancedMesh(geo, this.tunnelMat, this.tunnelCount);
    this.tubesR = new THREE.InstancedMesh(geo, this.tunnelMat, this.tunnelCount);
    this.tunnel.add(this.tubesL, this.tubesR);
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < this.tunnelCount; i++) {
      this.tubesL.setColorAt(i, white);
      this.tubesR.setColorAt(i, white);
    }
    this.sweep = [0, 1].map(() => {
      const l = new THREE.RectAreaLight(0xfff3dc, 0, 3.4, 0.4);
      this.tunnel.add(l);
      return l;
    });
    this.scene.add(this.tunnel);
    this._dummy = new THREE.Object3D();
    this.road = 0;
  }

  // p: drive progress 0 to 1. x, z: the car. dt: frame time.
  updateTunnel(p, x, z, dt) {
    const on = p > 0.004 && p < 0.995;
    this.tubesL.visible = this.tubesR.visible = on;
    this.floorU.uDrive.value = 0;
    if (!on) {
      this.sweep.forEach((l) => (l.intensity = 0));
      return;
    }
    const fadeOut = p > 0.85 ? 1 - (p - 0.85) / 0.15 : 1;
    const speed = THREE.MathUtils.clamp(p / 0.85, 0, 1);
    this.floorU.uDrive.value = speed * fadeOut;
    this.road += (8 + speed * 40) * dt;
    this.floorU.uRoad.value = this.road;
    const stretch = 1 + speed * 2.4 * (this.streak || 1); // V6 demo options lengthen the streaks
    const appear = Math.min(1, p * 6);
    this.tunnelMat.color.setHex(0xfff3dc).multiplyScalar(2.2 * fadeOut);
    const off = this.road % this.tunnelGap;
    const c = this._c || (this._c = new THREE.Color());
    for (let i = 0; i < this.tunnelCount; i++) {
      const tz = 2 - i * this.tunnelGap + off;
      // The tunnel switches on in a wave running away from the car as it pulls off.
      const on = THREE.MathUtils.clamp((p - 0.008) * 70 - (2 - tz + this.road) / 14, 0, 1);
      c.setScalar(on);
      this.tubesL.setColorAt(i, c);
      this.tubesR.setColorAt(i, c);
      for (const [mesh, side] of [[this.tubesL, -1], [this.tubesR, 1]]) {
        this._dummy.position.set(x + side * 2.6, 2.55, tz);
        this._dummy.rotation.set(0, 0, side * 0.5);
        this._dummy.scale.set(1, 1, stretch);
        this._dummy.updateMatrix();
        mesh.setMatrixAt(i, this._dummy.matrix);
      }
    }
    this.tubesL.instanceMatrix.needsUpdate = true;
    this.tubesR.instanceMatrix.needsUpdate = true;
    this.tubesL.instanceColor.needsUpdate = true;
    this.tubesR.instanceColor.needsUpdate = true;
    // Light running over the paint, nose to tail, again and again.
    const c1 = (this.road * 0.42) % 1;
    const c2 = (c1 + 0.5) % 1;
    [c1, c2].forEach((c, k) => {
      const l = this.sweep[k];
      const lz = z + THREE.MathUtils.lerp(-2.6, 2.6, c);
      l.position.set(x, 2.3, lz);
      l.lookAt(x, 0.5, lz);
      l.intensity = (k ? 5 : 6) * Math.sin(c * Math.PI) * fadeOut * appear;
    });
  }

  // The overhead tube of each bay as a thin lit bar, so the row of bays reads in the hero: the
  // current bay's tube bright, the others faint, receding to the right.
  // The overhead light of each bay, drawn as a real linear fixture (V7, Sam: "I was referring to those
  // lights on the ceiling"). Until V6 each was a flat grey stick held under the bloom threshold, with a
  // halo plane longer than the bar that smeared past both its ends like a fake reflection. Now:
  //   - a slim dark aluminium housing
  //   - a diffuser on its underside that is genuinely bright when the bay is lit, so the bloom gives
  //     it a tight, natural glow (an unlit bay's diffuser stays a dim line)
  //   - a narrow glow that stops where the bar stops
  //   - two thin cables up to the ceiling, and the ceiling washed above it (see the ceiling shader)
  _tubeMeshes() {
    const L = 3.8;
    const housingGeo = new THREE.BoxGeometry(0.075, 0.045, L);
    const diffGeo = new THREE.BoxGeometry(0.05, 0.004, L - 0.03);
    const cableGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 1, 6);
    // the glow: a soft tube round the diffuser, brightest where it faces the eye, fading to nothing at
    // its outline, so from any angle it reads as light round the line, never as a flat smear
    const glowGeo = new THREE.CylinderGeometry(0.04, 0.04, L - 0.02, 24, 1, true);
    glowGeo.rotateX(Math.PI / 2);
    glowGeo.translate(0, -0.01, 0);
    this.tubeBars = [];
    for (let i = 0; i < BAYS; i++) {
      const g = new THREE.Group();
      g.position.set(this.bayX(i) + 0.15, 2.7, 0.7);
      g.visible = false;
      const housing = new THREE.Mesh(housingGeo, new THREE.MeshStandardMaterial({ color: 0x1b1b1c, metalness: 0.7, roughness: 0.38, transparent: true }));
      const diff = new THREE.Mesh(diffGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(WHITE), transparent: true, toneMapped: true }));
      diff.position.y = -0.0245;
      const glow = new THREE.Mesh(glowGeo, this._glowMat());
      glow.position.y = -0.03;
      const cables = [-1, 1].map((k) => {
        const c = new THREE.Mesh(cableGeo, new THREE.MeshBasicMaterial({ color: 0x2a2a2a, transparent: true }));
        const top = 4.6 - 2.7; // up to the ceiling
        c.scale.y = top;
        c.position.set(0, top / 2 + 0.02, k * (L / 2 - 0.35));
        return c;
      });
      g.add(housing, diff, glow, ...cables);
      this.scene.add(g);
      g.userData = { housing, diff, glow, cables };
      this.tubeBars.push(g);
    }
  }

  // The fixture's glow, one material per fixture: additive warm white, strongest where the tube faces
  // the eye (|N.V| near 1) and gone at its outline; the ends fade with the bar.
  _glowMat() {
    return new THREE.ShaderMaterial({
      uniforms: { uK: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying float vAlong;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          vAlong = uv.y;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uK; varying vec3 vN; varying vec3 vV; varying float vAlong;
        void main() {
          float f = abs(dot(normalize(vN), normalize(vV)));
          float ends = smoothstep(0.0, 0.015, vAlong) * smoothstep(0.0, 0.015, 1.0 - vAlong);
          float a = pow(f, 9.0) * ends * uK;
          gl_FragColor = vec4(vec3(1.0, 0.96, 0.9) * a * 0.4, 1.0);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
  }



  // Called every frame: floor, wall and tube levels from the bays.
  update() {

    for (let i = 0; i < BAYS; i++) {
      this.floorU.uLevel.value[i] = this.level(i) * this.dim;
      this.roomU.uLevel.value[i] = this.level(i);
    }
    this.roomU.uDim.value = this.dim;
    this.tubeBars.forEach((g, i) => {
      const show = this.tubeShow;
      g.visible = show > 0.01;
      if (!g.visible) return;
      const t = this.tubes[i][0];
      const { housing, diff, glow, cables } = g.userData;
      // lit, the diffuser runs well over the bloom threshold, so the glow is the camera's, not a drawn
      // smear; resting bays stay under it, a dim line
      diff.material.color.setHex(WHITE).multiplyScalar(0.12 + 9 * t * t);
      diff.material.opacity = show;
      housing.material.opacity = show;
      cables.forEach((c) => (c.material.opacity = show * 0.9));
      glow.material.uniforms.uK.value = show * t * t * t; // only a lit bay's fixture glows
    });
    this.floorU.uDim.value = Math.max(0.12, this.dim);
  }
}
