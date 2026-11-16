import * as THREE from 'three';
import { C2V3_FLEET } from './C2V3FleetData.js';

// The showroom is lit by light painted in the shader from world position: scalloped washes
// from downlights along every wall, a pool on the floor under each car's ceiling strips, a pin
// spot behind each car's wall lettering, a warm line at the foot of the walls and a torch pool
// that follows the pointer. It costs almost nothing, lights every room at once and stays
// identical in the floor reflection. The cars themselves are lit by the environment map.

export const ROOM_PITCH = 12.44;
export const ROOM_HALF_DEPTH = 6.0;
export const ROOM_HALF_WIDTH = 7.0;
export const ROOM_HEIGHT = 4.8;
export const WALL = 0.44;
export const HALL_FRONT = 6.44; // the hall starts at the outer face of room 01's front wall
export const HALL_DEPTH = 11.0;
export const HALL_HALF_WIDTH = 7.0;
// tall enough that the hero never shows the hall's ceiling as a dark band along the top of the
// frame (8.4 m clears a phone's taller view too)
export const HALL_HEIGHT = 8.4;
export const DOOR_HALF = 1.6;
export const DOOR_HEIGHT = 3.6;

export const ROOM_COUNT = C2V3_FLEET.length;
export const roomCenterZ = (i) => -i * ROOM_PITCH;

export const lightUniforms = {
  uWash: { value: new Array(ROOM_COUNT).fill(0) },
  uPool: { value: new Array(ROOM_COUNT).fill(0) },
  uLabel: { value: Array.from({ length: ROOM_COUNT }, () => new THREE.Vector2(3.6, 2.1)) },
  uHall: { value: 0 },
  uNight: { value: 0 },
  uNightRoom: { value: new Array(ROOM_COUNT).fill(0) }, // each room's after-dark glow, on in turn
  uTorch: { value: new THREE.Vector4(0, -10, 0, 0) },
  uPlaster: { value: null },
  uStone: { value: null },
  uMirror: { value: null },
  uMirrorBlur: { value: null },
  uMirrorMatrix: { value: new THREE.Matrix4() },
  uReflect: { value: 1.7 },
  uResolution: { value: new THREE.Vector2(1, 1) },
  // the uplight that opens the hall (C2V3HallRise): x how far up the name wall it has climbed, y its level
  uRise: { value: new THREE.Vector2(-0.5, 0) },
};

// ---------- procedural textures ----------

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function vnoise(x, y, px, py) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % px) + px) % px;
  const x1 = (x0 + 1) % px;
  const y0 = ((yi % py) + py) % py;
  const y1 = (y0 + 1) % py;
  const a = hash2(x0, y0);
  const b = hash2(x1, y0);
  const c = hash2(x0, y1);
  const d = hash2(x1, y1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

// Mineral plaster, limewashed: rgb is a cloudy tonal variation, alpha is the relief as it
// looks when lit from above (the only way light ever reaches these walls). The trowel marks
// are warped noise with only a little stretch, so they read as hand strokes, not brushing.
function makePlasterTexture() {
  const N = 512;
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      const wu = (vnoise(u * 3, v * 3, 3, 3) - 0.5) * 0.5;
      const wv = (vnoise(u * 3 + 5.2, v * 3 + 9.1, 3, 3) - 0.5) * 0.5;
      const s1 = vnoise((u + wu) * 9, (v + wv) * 13, 9, 13);
      const s2 = vnoise((u - wv) * 24 + 3.1, (v + wu) * 30, 24, 30) * 0.45;
      const s3 = vnoise(u * 64, v * 64, 64, 64) * 0.3;
      const s4 = vnoise(u * 128 + 7.7, v * 128, 128, 128) * 0.16;
      const grit = hash2(x, y) * 0.12;
      h[y * N + x] = s1 * 0.8 + s2 + s3 + s4 + grit;
    }
  }
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const up = h[((y - 1 + N) % N) * N + x];
      const dn = h[((y + 1) % N) * N + x];
      const lf = h[y * N + ((x - 1 + N) % N)];
      const rt = h[y * N + ((x + 1) % N)];
      // canvas y runs down the wall, so "up" is y - 1
      const slopeUp = (dn - up) * 1.9;
      const slopeSide = (rt - lf) * 0.5;
      const relief = THREE.MathUtils.clamp(0.5 + slopeUp + slopeSide * 0.25, 0, 1);
      const u = x / N;
      const v = y / N;
      const cloud = (vnoise(u * 2, v * 2, 2, 2) - 0.5) * 0.16 + (vnoise(u * 6 + 1.7, v * 6, 6, 6) - 0.5) * 0.07;
      const tone = 0.9 + cloud + (h[i] - 0.95) * 0.03;
      data[i * 4] = Math.round(THREE.MathUtils.clamp(tone, 0, 1) * 255);
      data[i * 4 + 1] = Math.round(THREE.MathUtils.clamp(tone * 0.995, 0, 1) * 255);
      data[i * 4 + 2] = Math.round(THREE.MathUtils.clamp(tone * 0.985, 0, 1) * 255);
      data[i * 4 + 3] = Math.round(relief * 255);
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// Dark polished stone in 1.2 m tiles. One texture covers 2 × 2 tiles (2.4 m).
// rgb: tone and joints. alpha: how rough that spot is (only the joints differ).
// The stone is one even polish, joint to joint (Sam, 5 Nov). It had veins, specks and smudges
// that also varied the polish: they read as dirt in the reflection, and where a smudge crossed a
// vein the reflection cut out altogether, leaving black hooks on the floor.
function makeStoneTexture() {
  const N = 1024;
  const data = new Uint8Array(N * N * 4);
  const joint = 2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const jx = x % (N / 2);
      const jy = y % (N / 2);
      const isJoint = jx < joint || jy < joint;
      const tone = isJoint ? 0.1 : 0.34;
      const rough = isJoint ? 1 : 0.2;
      const i = (y * N + x) * 4;
      data[i] = Math.round(THREE.MathUtils.clamp(tone, 0, 1) * 255);
      data[i + 1] = Math.round(THREE.MathUtils.clamp(tone * 0.985, 0, 1) * 255);
      data[i + 2] = Math.round(THREE.MathUtils.clamp(tone * 0.96, 0, 1) * 255);
      data[i + 3] = Math.round(rough * 255);
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function initLightTextures() {
  lightUniforms.uPlaster.value = makePlasterTexture();
  lightUniforms.uStone.value = makeStoneTexture();
}

// ---------- the painted light ----------

const GALLERY_PARS = /* glsl */ `
uniform float uWash[${ROOM_COUNT}];
uniform float uPool[${ROOM_COUNT}];
uniform vec2 uLabel[${ROOM_COUNT}];
uniform float uHall;
uniform float uNight;
uniform float uNightRoom[${ROOM_COUNT}];
uniform vec4 uTorch;
uniform sampler2D uPlaster;
uniform sampler2D uStone;
uniform vec2 uRise;
varying vec3 vGalPos;
varying vec3 vGalNormal;

const vec3 WARM = vec3(1.0, 0.85, 0.7);
const vec3 NEUTRAL = vec3(1.0, 0.90, 0.78);

// One downlight grazing a wall: a scallop with a parabolic top edge that fades downwards.
float galScallop(float u, float y, float fx, float topY) {
  float du = u - fx;
  float dy = topY - y;
  float edge = smoothstep(-0.1, 0.9, dy - 0.5 * du * du);
  float fall = exp(-max(dy - 0.45, 0.0) * 0.42);
  float side = exp(-du * du * 0.26);
  return edge * (0.22 + 0.78 * fall) * side;
}

// A continuous washer in a slot along the ceiling: the same fall down the wall as a scallop, but
// even along it, so the top of the wall has no row of arcs (Sam: "a weird wave", 5 Nov). It rises
// over the first half metre so the wall never meets the ceiling on a hard lit line.
float galWash(float y, float topY) {
  float dy = topY - y;
  float edge = smoothstep(0.0, 0.5, dy);
  float fall = exp(-max(dy - 0.45, 0.0) * 0.42);
  return edge * (0.22 + 0.78 * fall);
}

float galSoftRect(vec2 q, vec2 halfSize, float soft) {
  vec2 d = abs(q) - halfSize;
  float o = length(max(d, 0.0));
  return 1.0 - smoothstep(0.0, soft, o);
}

vec3 galleryLight(vec3 p, vec3 n, float relief) {
  vec3 L = vec3(0.0);
  float wallShade = mix(1.0, relief * 2.0, 0.38);

  if (p.z > ${HALL_FRONT.toFixed(2)} - 0.001) {
    // The entrance hall: the inscription wall is washed from above, two pools on the floor.
    if (n.z > 0.5) {
      float s = 0.0;
      for (int k = 0; k < 6; k++) s += galScallop(p.x, p.y, -5.5 + 2.2 * float(k), ${(HALL_HEIGHT - 0.12).toFixed(2)});
      L += WARM * s * uHall * 0.75 * wallShade;
      // a soft oval of light on the inscription, from a hidden fitting in the ceiling: no edges
      // to it, so it never reads as a lit rectangle on the wall
      float ins = exp(-pow(p.x / 3.5, 2.0)) * exp(-pow((p.y - 5.0) / 1.6, 2.0));
      L += NEUTRAL * ins * uHall * 1.25 * mix(1.0, wallShade, 0.5);
      L += WARM * uHall * 0.06;
      // the uplight from the slot at the foot of the wall (C2V3HallRise): the whole width, brightest
      // at the floor and fading as it rises, lit up to where it has climbed. It grazes the wall, so
      // the plaster's grain shows more in it.
      float climb = 1.0 - smoothstep(uRise.x - 1.8, uRise.x, p.y);
      float up = 0.12 + 0.88 * exp(-p.y * 0.38);
      L += vec3(1.0, 0.86, 0.72) * uRise.y * up * climb * mix(1.0, wallShade, 0.85);
    } else if (abs(n.x) > 0.5) {
      float s = galScallop(p.z, p.y, 10.0, 6.0) + galScallop(p.z, p.y, 14.0, 6.0);
      L += WARM * s * uHall * 0.35 * wallShade;
    } else if (n.y < -0.5) {
      // the washers above the inscription spill onto the ceiling near the wall
      L += WARM * uHall * 0.55 * exp(-max(p.z - ${HALL_FRONT.toFixed(2)}, 0.0) * 0.5);
      L += WARM * uHall * 0.16;
      vec2 f1 = p.xz - vec2(-2.8, 11.5);
      vec2 f2 = p.xz - vec2(2.8, 11.5);
      vec2 f3 = p.xz - vec2(0.0, 8.2);
      L += NEUTRAL * uHall * 0.9 * (exp(-dot(f1, f1) * 2.5) + exp(-dot(f2, f2) * 2.5) + exp(-dot(f3, f3) * 2.5));
    } else if (n.y > 0.5) {
      float pools = 0.0;
      pools += exp(-dot(p.xz - vec2(-2.8, 11.5), p.xz - vec2(-2.8, 11.5)) * 0.32);
      pools += exp(-dot(p.xz - vec2(2.8, 11.5), p.xz - vec2(2.8, 11.5)) * 0.32);
      pools += exp(-dot(p.xz - vec2(0.0, 8.2), p.xz - vec2(0.0, 8.2)) * 0.22) * 0.8;
      L += NEUTRAL * pools * uHall * 0.42;
      // the slot's light on the stone in front of it
      L += vec3(1.0, 0.86, 0.72) * uRise.y * 0.5 * exp(-max(p.z - ${HALL_FRONT.toFixed(2)}, 0.0) * 5.0);
    }
  } else {
    float fi = clamp(floor((6.22 - p.z) / ${ROOM_PITCH.toFixed(2)}), 0.0, ${(ROOM_COUNT - 1).toFixed(1)});
    int ri = int(fi);
    float zC = -fi * ${ROOM_PITCH.toFixed(2)};
    float lz = p.z - zC;
    float wash = uWash[ri];
    float pool = uPool[ri];

    if (abs(n.x) > 0.5) {
      // as bright as the old row of six downlights in the middle, a little softer into the corners
      float s = galWash(p.y, ${(ROOM_HEIGHT - 0.1).toFixed(2)}) * 1.6 * (1.0 - 0.45 * smoothstep(4.2, 6.2, abs(lz)));
      L += WARM * s * wash * 1.0 * wallShade;
      L += WARM * wash * 0.07 * wallShade;
      // light from the floor pool bouncing up the lower wall
      L += WARM * pool * 0.05 * exp(-p.y * 0.8) * exp(-lz * lz * 0.04);
    } else if (abs(n.z) > 0.5) {
      // either side of the doorway, dimmer over it, where the car's name has its own pin spot
      float side = 0.2 + 0.8 * smoothstep(1.0, 3.0, abs(p.x));
      float s = galWash(p.y, ${(ROOM_HEIGHT - 0.1).toFixed(2)}) * 1.55 * side * (1.0 - 0.3 * smoothstep(5.6, 7.0, abs(p.x)));
      L += WARM * s * wash * 0.9 * wallShade;
      L += WARM * wash * 0.07 * wallShade;
      if (n.z > 0.5) {
        // the pin spot behind the car's name on the wall facing you
        vec2 d = (p.xy - uLabel[ri]) / vec2(2.3, 1.15);
        L += NEUTRAL * exp(-dot(d, d) * 1.6) * wash * 1.25 * mix(1.0, wallShade, 0.5);
      }
    } else if (n.y < -0.5) {
      // the ceiling around the strips catches their light, and the washes near the walls
      L += NEUTRAL * pool * 0.55 * galSoftRect(vec2(p.x, lz), vec2(1.2, 2.9), 1.7);
      L += WARM * wash * 0.12 * smoothstep(4.2, 7.0, abs(p.x));
      L += WARM * wash * 0.03;
    } else if (n.y > 0.5) {
      float pr = galSoftRect(vec2(p.x, lz), vec2(1.5, 3.1), 2.6);
      L += NEUTRAL * pr * pool * 0.75;
      L += WARM * wash * 0.035;
      // wall washes spilling onto the floor at the edges of the room
      L += WARM * smoothstep(4.6, 6.95, abs(p.x)) * wash * 0.16;
    }
  }

  // The warm line at the foot of every wall, always on after dark. Each room's comes on in its
  // turn on the way in, so the enfilade lights up one room after another.
  float nightHere = uNight;
  if (p.z < ${HALL_FRONT.toFixed(2)} - 0.001) {
    nightHere *= uNightRoom[int(clamp(floor((6.22 - p.z) / ${ROOM_PITCH.toFixed(2)}), 0.0, ${(ROOM_COUNT - 1).toFixed(1)}))];
  }
  if (n.y < 0.5) {
    L += WARM * nightHere * 0.6 * exp(-max(p.y - 0.02, 0.0) * 9.0);
  } else {
    float distToWall = min(${ROOM_HALF_WIDTH.toFixed(2)} - abs(p.x), 99.0);
    if (p.z > ${HALL_FRONT.toFixed(2)}) distToWall = ${HALL_HALF_WIDTH.toFixed(2)} - abs(p.x);
    L += WARM * nightHere * 0.22 * exp(-max(distToWall, 0.0) * 7.0);
  }

  // The pocket torch that follows the pointer.
  vec3 td = p - uTorch.xyz;
  L += NEUTRAL * uTorch.w * exp(-dot(td, td) * 1.3);
  return L;
}
`;

// Finishes a wall can take on top of the plaster, laid out in world space (wuv) so they run
// on across every block of a wall. pattern: 'smooth' | 'boards' | 'hex' | 'ashlar' | 'dado'
const WALL_PATTERNS = {
  // fine polished plaster: less relief, less cloud
  smooth: `
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuse, 0.65);
    galRelief = mix(galRelief, 0.5, 0.7);
  `,
  // board-marked concrete: 16 cm boards, each a slightly different tone, a dark line between
  boards: `{
    float b = floor(wuv.y / 0.16);
    float f = fract(wuv.y / 0.16);
    float tone = 0.88 + 0.14 * fract(sin(b * 12.9898) * 43758.5453);
    float joint = smoothstep(0.0, 0.05, f) * smoothstep(1.0, 0.95, f);
    float grain = 0.96 + 0.04 * sin(wuv.x * 11.0 + sin(wuv.x * 1.7 + b * 3.1) * 3.0);
    diffuseColor.rgb *= tone * grain * mix(0.5, 1.0, joint);
    galRelief = mix(galRelief, 0.5, 0.5) * mix(0.75, 1.0, joint);
  }`,
  // hexagon panels in satin plaster (refined for Sam, 5 Nov). Each panel its own shade, the cloud
  // of the plaster calmed inside them, and a chamfer on every edge lit by the way that edge faces:
  // the upper slants catch the wash, the lower ones fall into shadow, the upright sides sit between.
  // The joint is a crisp dark line, its width held steady on screen.
  hex: `{
    vec2 p = wuv / 0.62;
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 c = mod(p - h, r) - h;
    bool inA = dot(a, a) < dot(c, c);
    vec2 g = inA ? a : c;
    vec2 cell = inA ? floor(p / r) : floor((p - h) / r) + 0.5;
    vec2 q = abs(g);
    float slant = dot(q, vec2(0.5, 0.8660254));
    float e = 0.5 - max(slant, q.x);
    float aa = fwidth(e);
    float joint = smoothstep(0.011 - aa, 0.011 + aa, e);
    float chamfer = (1.0 - smoothstep(0.011, 0.07, e)) * joint;
    float facing = slant > q.x ? sign(g.y) : 0.0;
    float tone = 0.92 + 0.1 * fract(sin(dot(cell, vec2(41.3, 289.1))) * 43758.5453);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuse, 0.6) * tone * mix(0.3, 1.0, joint);
    galRelief = mix(galRelief, 0.5, 0.8) + chamfer * facing * 0.55 + 0.05 * g.y * joint;
  }`,
  // limestone ashlar, 1.2 x 0.6 m blocks in running bond (refined for Sam, 5 Nov). Each block is cut
  // from its own piece of stone: the plaster's cloud is read at a different place for every block,
  // so the grain breaks at each joint, with faint bedding lines along it. The top arris of a block
  // catches the wash and the foot of the block above shades the joint under it.
  ashlar: `{
    float row = floor(wuv.y / 0.6);
    vec2 bp = vec2(wuv.x / 1.2 + 0.5 * mod(row, 2.0), wuv.y / 0.6);
    vec2 id = floor(bp);
    vec2 f = fract(bp);
    float n1 = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
    float n2 = fract(sin(dot(id, vec2(39.346, 11.135))) * 24634.6345);
    vec4 stone = texture2D(uPlaster, wuv / 1.9 + vec2(n1, n2) * 7.0);
    float dx = min(f.x, 1.0 - f.x) * 1.2;
    float dB = f.y * 0.6;
    float dT = (1.0 - f.y) * 0.6;
    float d = min(dx, min(dB, dT));
    float aa = fwidth(d);
    float joint = smoothstep(0.004 - aa, 0.004 + aa, d);
    float bedding = 1.0 + 0.03 * sin(wuv.y * 47.0 + n2 * 20.0 + sin(wuv.x * 1.7 + n1 * 6.0) * 1.2);
    diffuseColor.rgb = diffuse * stone.rgb * (0.9 + 0.12 * n1) * bedding * mix(0.4, 1.0, joint);
    float arris = (1.0 - smoothstep(0.004, 0.018, dT)) * joint;
    float foot = 1.0 - smoothstep(0.0, 0.035, dB);
    galRelief = mix(stone.a, 0.5, 0.6) + arris * 0.36 - foot * 0.2;
  }`,
  // near-black honed stone to 1.1 m (Sam, 5 Nov: the walnut panelling read brown and old-fashioned,
  // then the white-veined marble too busy; both kept in Teach/c2-v3/code/walnut-dado). Slabs 1.2 m
  // wide on fine joints, each a shade apart, only a ghost of a vein in them (contours of the
  // plaster's cloud, read at a different place for each slab), the slot's light caught in the
  // polish near the top, and a shadow gap where the stone stops.
  dado: `{
    float y = vGalPos.y;
    float ay = fwidth(y);
    float below = 1.0 - smoothstep(1.1 - ay, 1.1 + ay, y);
    float gap = smoothstep(1.1 - ay, 1.1 + ay, y) * (1.0 - smoothstep(1.114 - ay, 1.114 + ay, y));
    float sx = fract(wuv.x / 1.2);
    float slab = floor(wuv.x / 1.2);
    float dj = min(sx, 1.0 - sx) * 1.2;
    float aj = fwidth(dj);
    float joint = smoothstep(0.0015 - aj, 0.0015 + aj, dj);
    vec2 o = vec2(fract(sin(slab * 12.9898) * 43758.5453), fract(sin(slab * 78.233) * 24634.6345)) * 5.0;
    // the cloud read blurred (a coarse mip, so no fine wiggle) and stretched along a diagonal, so its
    // contours run as long drifting veins, not closed loops
    vec2 vd = vec2(dot(wuv, vec2(0.8, 0.6)) * 0.1, dot(wuv, vec2(-0.6, 0.8)) * 0.45);
    float c1 = (texture2D(uPlaster, vd + o, 3.0).r - 0.9) / 0.12;
    float c2 = (texture2D(uPlaster, vd * 1.7 + o.yx, 3.0).r - 0.9) / 0.12;
    float w1 = fwidth(c1) + 0.01;
    float w2 = fwidth(c2) + 0.008;
    float vein = (1.0 - smoothstep(0.0, w1 * 3.0, abs(c1 - 0.15))) * 0.7 + (1.0 - smoothstep(0.0, w2 * 2.0, abs(c2 + 0.3))) * 0.3;
    vec3 stone = vec3(0.016, 0.016, 0.018) * (0.94 + 0.12 * o.x / 5.0) + vec3(0.3, 0.3, 0.32) * vein * 0.045;
    stone *= (1.0 + 0.3 * smoothstep(0.55, 1.1, y)) * mix(0.4, 1.0, joint);
    diffuseColor.rgb = mix(diffuseColor.rgb, stone, below) * (1.0 - 0.8 * gap);
    float arris = (1.0 - smoothstep(0.0, 0.006 + ay, 1.1 - y)) * below;
    galRelief = mix(galRelief, 0.5 + arris * 0.4, below);
  }`,
};

// kind: 'wall' | 'floor' | 'ceiling' | 'lettering' | 'engraved' | 'plain'
export function makeGalleryMaterial(kind, params = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: params.color ?? 0xffffff,
    roughness: params.roughness ?? 0.9,
    metalness: params.metalness ?? 0,
    map: params.map ?? null,
    transparent: params.transparent ?? false,
    alphaTest: params.alphaTest ?? 0,
    polygonOffset: params.polygonOffset ?? false,
    polygonOffsetFactor: params.polygonOffset ? -2 : 0,
    polygonOffsetUnits: params.polygonOffset ? -2 : 0,
    depthWrite: params.depthWrite ?? true,
    envMap: null,
  });
  mat.userData.galleryKind = kind;
  const boost = params.lightBoost ?? 1.0;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lightUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGalPos;\nvarying vec3 vGalNormal;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvGalPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvGalNormal = normalize(mat3(modelMatrix) * objectNormal);'
      );

    let surface = '';
    if (kind === 'ceiling') {
      surface = `
        vec4 plaster = texture2D(uPlaster, vGalPos.xz / 3.4);
        diffuseColor.rgb *= plaster.rgb;
        float galRelief = 0.5;
      `;
    } else if (kind === 'wall') {
      surface = `
        vec2 wuv = abs(vGalNormal.x) > 0.5 ? vec2(vGalPos.z, vGalPos.y) : vec2(vGalPos.x, vGalPos.y);
        vec4 plaster = texture2D(uPlaster, wuv / 2.6);
        diffuseColor.rgb *= plaster.rgb;
        float galRelief = plaster.a;
        ${WALL_PATTERNS[params.pattern] ?? ''}
      `;
    } else if (kind === 'engraved') {
      // letters cut into the plaster: the map holds the cut's light and shade at half scale, and
      // the plaster (and its pattern) runs on through the letters as it does across the wall
      surface = `
        vec2 wuv = vec2(vGalPos.x, vGalPos.y);
        vec4 plaster = texture2D(uPlaster, wuv / 2.6);
        diffuseColor.rgb *= plaster.rgb * 2.0;
        float galRelief = plaster.a;
        ${WALL_PATTERNS[params.pattern] ?? ''}
      `;
    } else if (kind === 'floor') {
      surface = `
        vec4 stone = texture2D(uStone, vGalPos.xz / 2.4);
        diffuseColor.rgb *= stone.rgb;
        float galRelief = 0.5;
      `;
    } else {
      surface = 'float galRelief = 0.5;';
    }

    let reflection = '';
    if (kind === 'floor') {
      reflection = `
        {
          float rough = stone.a;
          vec4 mp = uMirrorMatrix * vec4(vGalPos, 1.0);
          vec2 muv = mp.xy / mp.w;
          vec3 sharp = texture2D(uMirror, muv).rgb;
          vec3 soft = texture2D(uMirrorBlur, muv).rgb;
          vec3 refl = mix(sharp, soft, clamp(0.12 + rough * 1.1, 0.0, 1.0));
          // soft ceiling on very bright sources, so a strip seen at your feet stays a glint
          refl = refl / (1.0 + max(max(refl.r, max(refl.g, refl.b)) - 0.8, 0.0) * 1.2);
          vec3 viewDir = normalize(cameraPosition - vGalPos);
          float cosT = clamp(viewDir.y, 0.0, 1.0);
          float fres = 0.025 + 0.975 * pow(1.0 - cosT, 5.0);
          float isJoint = step(0.98, rough);
          totalEmissiveRadiance += refl * fres * uReflect * (1.0 - isJoint) * (1.0 - rough * 0.55);
        }
      `;
    }

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\n' +
          (kind === 'floor'
            ? 'uniform sampler2D uMirror;\nuniform sampler2D uMirrorBlur;\nuniform mat4 uMirrorMatrix;\nuniform float uReflect;\n'
            : '') +
          GALLERY_PARS
      )
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + surface)
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
         totalEmissiveRadiance += diffuseColor.rgb * galleryLight(vGalPos, normalize(vGalNormal), galRelief) * ${boost.toFixed(3)};
         ${reflection}`
      );
  };
  mat.customProgramCacheKey = () => `gallery-${kind}-${boost}-${params.pattern ?? ''}`;
  return mat;
}
