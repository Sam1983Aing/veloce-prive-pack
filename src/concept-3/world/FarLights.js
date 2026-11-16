// Every small distant light in the world (taxiway, runway, approach, town lights on the hills,
// the obstacle light, the plane) is a point sprite. Its disc grows with distance from the shot's
// focus, so far lights turn into soft bokeh behind the car in the close shots.
import * as THREE from 'three';
import { bakeDisc } from './bake.js';

const disc = bakeDisc(128, 0.35);

const vert = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute vec4 aBlink;   // period, phase, duty, kind (0 steady, 1 blink, 2 double strobe, 3 sequenced)
  attribute float aFacing; // 0 = omni, otherwise how much a light is directional
  uniform float uTime;
  uniform float uFocus;
  uniform float uCocK;     // circle of confusion scale in px for an object at infinity
  uniform float uFocalPx;
  uniform float uPixelRatio;
  uniform float uExt;
  uniform float uGain;
  varying vec3 vColor;
  varying float vSoft;
  varying float vHalo;
  varying float vGlow;
  varying float vBoost;
  float blink(vec4 b) {
    if (b.w < 0.5) return 1.0;
    float t = fract(uTime / b.x + b.y);
    if (b.w < 1.5) return t < b.z ? 1.0 : 0.04;
    if (b.w < 2.5) return (t < 0.05 || (t > 0.12 && t < 0.17)) ? 1.0 : 0.0;
    return t < b.z ? 1.0 : 0.0;
  }
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    if (mv.z > -0.3) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vColor = vec3(0.0); vSoft = 0.0; vHalo = 1.0; vGlow = 0.0; vBoost = 1.0; return; }
    float d = -mv.z;
    float sharp = max(1.2, aSize * uFocalPx / d);
    float coc = uCocK * abs(d - uFocus) / d;
    float size = sharp + coc;
    float energy = (sharp * sharp) / (size * size);
    // keep big discs visible: bright points stay bright when defocused, they don't vanish
    energy = mix(energy, 1.0, 0.18) * min(1.0, 2.2 / max(1.0, coc * 0.25));
    float att = exp(-d * uExt);
    vec3 c = aColor * blink(aBlink) * att * energy * uGain;
    vSoft = clamp(coc / (size + 0.001), 0.0, 1.0);
    // Points never reach the bloom threshold: tiny bright points bloom into squares in the low mips.
    // A bright, sharp point draws its own soft halo instead, in a larger sprite.
    float peak = max(max(c.r, c.g), c.b);
    vGlow = smoothstep(1.5, 60.0, peak) * (1.0 - vSoft);
    vHalo = 1.0 + 5.0 * vGlow;
    vColor = c / max(1.0, peak / 1.45);
    // the brightest points (landing lights) keep more of their energy in the halo
    vBoost = clamp(sqrt(peak / 1.45), 1.0, 3.2);
    gl_PointSize = min(size * vHalo, 200.0) * uPixelRatio;
    gl_Position = projectionMatrix * mv;
  }`;

const frag = /* glsl */ `
  uniform sampler2D tDisc;
  varying vec3 vColor;
  varying float vSoft;
  varying float vHalo;
  varying float vGlow;
  varying float vBoost;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p) * 2.0;
    float rc = r * vHalo;
    float sharpDot = exp(-rc * rc * 6.0);
    float bokeh = texture2D(tDisc, (gl_PointCoord - 0.5) * vHalo + 0.5).a * step(rc, 1.0);
    float a = mix(sharpDot, bokeh * 0.9, vSoft);
    a += vGlow * vBoost * (exp(-r * 5.0) * 0.5 + exp(-r * 14.0) * 0.6) * (1.0 - smoothstep(0.85, 1.0, r));
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor * a, 1.0);
  }`;

export class FarLights {
  constructor() {
    this.items = [];
  }
  add(pos, color, intensity, size = 0.15, blink = [1, 0, 1, 0]) {
    const c = new THREE.Color(color);
    this.items.push({ pos, c: [c.r * intensity, c.g * intensity, c.b * intensity], size, blink });
  }
  build(dynamic = false) {
    const n = this.items.length;
    const geo = new THREE.BufferGeometry();
    const P = new Float32Array(n * 3), C = new Float32Array(n * 3), S = new Float32Array(n), B = new Float32Array(n * 4);
    this.items.forEach((it, i) => {
      P.set([it.pos.x, it.pos.y, it.pos.z], i * 3);
      C.set(it.c, i * 3);
      S[i] = it.size;
      B.set(it.blink, i * 4);
    });
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(C, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(S, 1));
    geo.setAttribute('aBlink', new THREE.BufferAttribute(B, 4));
    geo.setAttribute('aFacing', new THREE.BufferAttribute(new Float32Array(n), 1));
    if (dynamic) {
      geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
      geo.attributes.aColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFocus: { value: 20 },
        uCocK: { value: 2 },
        uFocalPx: { value: 1000 },
        uPixelRatio: { value: 1 },
        uExt: { value: 0.00028 },
        uGain: { value: 1 },
        tDisc: { value: disc },
      },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    return this.points;
  }
  setLens({ time, focus, cocK, focalPx, pixelRatio }) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uFocus.value = focus;
    u.uCocK.value = cocK;
    u.uFocalPx.value = focalPx;
    u.uPixelRatio.value = pixelRatio;
  }
}
