// The cars section ("Who's waiting for you?"), V4 and V5: Runway Walk, the option Sam kept from the demo round of
// 14 Nov 2026 (V3's page still has all four options behind ?cars=, as the record of that round).
// The five cars stand down the centreline of a private runway, each turned its own way and lit in its own
// pool. The camera opens high behind the threshold, comes down, and walks round each car on a different
// bearing and height, then rises at the far end and looks back down the line.
import * as THREE from 'three';
import { buildEnvScene } from '../world/Apron.js';
import { CityWord } from './CityWord.js';
import { fbm } from '../world/bake.js';
import { polish, softTex } from '../world/Polish.js';

const smooth = THREE.MathUtils.smoothstep;
const smoother = (x) => THREE.MathUtils.smootherstep(x, 0, 1);
const clamp = THREE.MathUtils.clamp;
const rad = THREE.MathUtils.degToRad;
const dirOf = (deg, out = new THREE.Vector3()) => out.set(Math.sin(rad(deg)), 0, Math.cos(rad(deg)));
const PAINT = 'rgb(100,100,97)';

// a soft round glow for the edge lights (a hard disc reads as a white ball up close)
function softGlow(px = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.45)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, px, px);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- the runway

const RW = { z: 44, x0: -100, x1: 80, half: 15 };

function bakeRunway() {
  const m = 20; // pixels per metre
  const L = RW.x1 - RW.x0, W = RW.half * 2;
  const c = document.createElement('canvas');
  c.width = L * m; c.height = W * m;
  const g = c.getContext('2d');
  const X = (x) => (x - RW.x0) * m;
  const Z = (z) => (z - (RW.z - RW.half)) * m;
  g.fillStyle = PAINT;
  // edge lines
  for (const z of [RW.z - RW.half + 0.6, RW.z + RW.half - 0.6]) g.fillRect(X(RW.x0), Z(z) - 0.45 * m, L * m, 0.9 * m);
  // threshold bars, four each side of the centreline
  for (const s of [-1, 1]) for (let k = 1; k <= 4; k++) g.fillRect(X(RW.x0 + 6), Z(RW.z + s * 2.7 * k) - 0.9 * m, 30 * m, 1.8 * m);
  // the runway's number, read from the threshold
  g.save();
  g.translate(X(RW.x0 + 46), Z(RW.z));
  g.rotate(Math.PI / 2);
  g.font = `500 condensed ${9 * m}px "Archivo", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('07', 0, 0);
  g.restore();
  // centreline dashes
  for (let x = RW.x0 + 56; x < RW.x1 - 6; x += 20) g.fillRect(X(x), Z(RW.z) - 0.22 * m, 12 * m, 0.45 * m);
  // a little wear, so it's paint on tarmac, not a sticker
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let y = 0; y < c.height; y += 1) {
    for (let x = 0; x < c.width; x += 1) {
      const i = (y * c.width + x) * 4;
      if (!d[i + 3]) continue;
      d[i + 3] = Math.round(d[i + 3] * (0.72 + 0.28 * THREE.MathUtils.smoothstep(fbm(x / 40, y / 40, 3, 5), 0.25, 0.6)));
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function buildRunway(api) {
  const group = new THREE.Group();
  group.visible = false;
  api.scene.add(group);
  const L = RW.x1 - RW.x0, W = RW.half * 2;
  const paint = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: bakeRunway(), transparent: true, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  paint.position.set((RW.x0 + RW.x1) / 2, 0.003, RW.z);
  group.add(paint);

  // edge lights on short posts, every 15 m; green across the threshold
  const glowTex = softGlow();
  const postGeo = new THREE.CylinderGeometry(0.045, 0.07, 0.32, 8);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.6, metalness: 0.5 });
  const bulbGeo = new THREE.SphereGeometry(0.085, 12, 8);
  const lights = [];
  const add = (x, z, color, glowK) => {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(x, 0.16, z);
    const bulbMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.2), fog: false });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(x, 0.37, z);
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: color.clone().multiplyScalar(glowK), blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const glow = new THREE.Sprite(glowMat);
    glow.position.copy(bulb.position);
    glow.scale.setScalar(0.9);
    group.add(post, bulb, glow);
    const l = { x, z, color, glowK, bulbMat, glowMat, k: 1, set(k) {
      if (Math.abs(k - l.k) < 1e-3) return;
      l.k = k;
      bulbMat.color.copy(color).multiplyScalar(0.06 + 2.14 * k);
      glowMat.color.copy(color).multiplyScalar(glowK * k);
    } };
    lights.push(l);
  };
  const WHITE = new THREE.Color(1, 0.93, 0.82);
  const GREEN = new THREE.Color(0.25, 1, 0.45);
  for (let x = RW.x0 + 3; x <= RW.x1; x += 15) for (const s of [-1, 1]) add(x, RW.z + s * (RW.half + 0.7), WHITE, 0.85);
  for (let z = RW.z - RW.half + 1; z <= RW.z + RW.half - 1; z += 3.5) add(RW.x0 + 1, z, GREEN, 0.5);
  return { group, lights };
}

// What a car's paint sees on the runway: the apron's lights from its own spot, the two rows of edge
// lights as small hot cards (they read as strings of points along a flank), a soft key from the camera's
// side, and a pale floor close under it so sills and wheels aren't black.
function runwayEnv(api, pos, yaw) {
  const env = new THREE.Scene();
  const g = new THREE.Group();
  g.add(...buildEnvScene(true, api.world.terminalGlass).children);
  const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.93, 0.82).multiplyScalar(6), side: THREE.DoubleSide });
  for (let x = RW.x0 + 3; x <= RW.x1; x += 15) for (const s of [-1, 1]) {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), hot);
    card.position.set(x, 0.4, RW.z + s * (RW.half + 0.7));
    card.lookAt(pos.x, 0.5, pos.z);
    g.add(card);
  }
  // the key from the camera's side, feathered now (V4's was a hard-edged card: a slab on the doors)
  const soft = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.5), new THREE.MeshBasicMaterial({ map: softTex(0.3, 0.4), color: new THREE.Color(1, 0.96, 0.9).multiplyScalar(2.2), side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  soft.position.set(pos.x - 6, 6, pos.z);
  soft.lookAt(pos.x, 0.5, pos.z);
  g.add(soft);
  // V5: the polish (world/Polish.js) replaces V4's hard grey floor disc; this group is already drawn 0.5 m lower
  g.add(polish(pos, rad(yaw), 1, 0));
  g.position.set(-pos.x, -0.5, -pos.z);
  env.add(g);
  const pm = new THREE.PMREMGenerator(api.renderer);
  const tex = pm.fromScene(env, 0, 0.05, 300).texture;
  pm.dispose();
  return tex;
}

// the cars placed on the runway, their cities, entering and leaving
function runwayBase(api, layout) {
  const rw = buildRunway(api);
  let envs = null;
  const words = [];
  const place = (r) => {
    const i = api.FLEET.findIndex((c) => c.id === r.spec.id);
    const p = layout[i];
    r.root.position.set(p.x, 0, p.z);
    r.root.rotation.y = rad(p.yaw);
    r.lights(false);
    r.setEnv(envs[i], 1.5);
    if (!r.root.parent) api.scene.add(r.root);
  };
  return {
    rw, words,
    enter() {
      if (!envs) envs = layout.map((p) => runwayEnv(api, new THREE.Vector3(p.x, 0, p.z), p.yaw));
      if (!words.length) api.FLEET.forEach((c) => { const w = new CityWord(api.scene); w.set(c.city); words.push(w); });
      rw.group.visible = true;
      api.world.ground.marks.visible = false;
      for (const r of api.rigs.values()) place(r);
    },
    leave() {
      rw.group.visible = false;
      api.world.ground.marks.visible = true;
      words.forEach((w) => w.show(false));
    },
    placeLate() {
      for (const r of api.rigs.values()) if (!r.root.parent) place(r);
      api.world.hangar.open(0); // the film leaves it open; its light would sit in the back of frame
    },
  };
}

const V = () => new THREE.Vector3();
const bez = (a, c, b, t, out) => out.set(
  (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
  (1 - t) * (1 - t) * a.z + 2 * (1 - t) * t * c.z + t * t * b.z,
);

// a motor that chases the scroll with a top speed, as the ring's camera does. V6: a lower top speed and a
// softer follow, so a turn round a car takes at least about two seconds however hard you scroll (Sam: "make
// the camera rotation a little slower than the current pacing"; V5 could do a car's turn in 1.2 s)
function chaser(rate = 0.055) {
  let u = -1;
  return (lp, dt, reduced) => {
    if (u < 0 || reduced) u = lp;
    else u += clamp((lp - u) * (1 - Math.exp(-dt / 0.35)), -rate * dt, rate * dt);
    return u;
  };
}

// put the car right of the card on a wide screen: look a little to the camera's left of it
const RIGHT = V(), UPV = new THREE.Vector3(0, 1, 0), FWD = V();
function lookWithOffset(camera, target, offset) {
  FWD.copy(target).sub(camera.position).normalize();
  RIGHT.crossVectors(FWD, UPV).normalize();
  camera.up.copy(UPV);
  camera.lookAt(target.x - RIGHT.x * offset, target.y, target.z - RIGHT.z * offset);
}

// A monotone cubic through knots [[x, y], ...] (Fritsch and Carlson): smooth, never overshoots, flat where
// two knots are equal and at both ends, so a value can hold still and then move off without a jolt.
function monotone(k) {
  const n = k.length, xs = k.map((p) => p[0]), ys = k.map((p) => p[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-9, xs[i + 1] - xs[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// ---------------------------------------------------------------- the walk

// The section's timeline, in its scroll (0 when the section pins, 1 at its end). V5 added the lights coming
// up before the walk and the Hypercar's drive off after it. V6 doubles the scroll each car takes (Sam: "we
// scroll a little bit and it goes already to the next one, slow it down about 50%"), so the times are kept
// as lengths of scroll, in vh, over the section's scroll: 1092vh tall, 992vh of scroll (690 and 590 in V5).
const SPAN = 992;
const vh = (x) => x / SPAN;
const L0 = vh(-40); // the film has gone dark and the title is coming up the screen: the runway starts to light
const HOLD = vh(20); // the lights are up; the camera starts down
const INTRO = HOLD + vh(40); // down onto the runway, at the Red Spider
const ARC = vh(105), MOVE = vh(70); // each car's walk, and the move to the next (V5: 52.5 and 35)
const DRIVE = INTRO + 5 * ARC + 4 * MOVE; // after the Hypercar's walk: it drives off down the runway (127vh)

export function makeRunwayWalk(api) {
  // V7 (Sam: "it rotates around it, then it jumps to another angle for the next one... make it one continuous
  // motion"): every walk now happens on the threshold side of its car, the side the camera comes from, sweeping
  // across from one side of the runway to the other. The camera ends each walk still facing down the runway,
  // so it glides past the car to the next one without turning round. In V4 to V6 each walk ended on the far
  // side of its car, looking back, and the move to the next car was a half turn: up to 219 degrees in a
  // second, which read as a cut. The cars are turned so each still shows a different side.
  const layout = [
    { x: -62, z: RW.z, yaw: 270 }, // Red, nose to the threshold: across the nose
    { x: -38, z: RW.z, yaw: 180 }, // Silver, nose across the runway: its long side
    { x: -14, z: RW.z, yaw: 90 }, // V12, nose down the runway: over the tail
    { x: 10, z: RW.z, yaw: 300 }, // Track Car, nose to the threshold, a little turned: head on, round to its side
    { x: 34, z: RW.z, yaw: 90 }, // Hypercar, nose down the runway, away from the others, ready to go
  ];
  // the walk round each car: camera bearing from the car (0 is +Z, 90 is down the runway, 270 back up it to the
  // threshold), start to end, radius, height. The sides alternate, so each move to the next car stays on one
  // side of the runway and passes the car it leaves at a safe distance.
  //   Red: front three-quarter, across the nose, to the other three-quarter, eye height
  //   Silver: the long side profile, low, from the tail to the nose
  //   V12: high over the tail, the engine cover and the wing
  //   Track Car: head on, very low, round to its side
  //   Hypercar: its side, round to behind it, where the camera stays to watch it go
  const arcs = [
    { a0: 225, a1: 315, r: 6.6, h: 1.05 },
    { a0: 315, a1: 225, r: 7.2, h: 0.5 },
    { a0: 225, a1: 315, r: 7.4, h: 2.7 },
    { a0: 315, a1: 225, r: 6.2, h: 0.42 },
    { a0: 180, a1: 270, r: 7.6, h: 1.25 },
  ];
  // which side of the runway each walk ends on (+1 is +Z)
  const sideOf = (i) => Math.sign(Math.cos(rad(arcs[i].a1))) || 1;
  const base = runwayBase(api, layout);
  const n = layout.length;
  const motor = chaser();
  const camAt = (i, a, phone, out) => {
    const p = layout[i], c = arcs[i], r = c.r * (phone ? 1.45 : 1);
    dirOf(a, out).multiplyScalar(r);
    return out.set(p.x + out.x, c.h + (phone ? 0.25 : 0), p.z + out.z);
  };
  const carC = (i, out) => out.set(layout[i].x, 0.55, layout[i].z);
  const P = V(), A = V(), B = V(), C = V(), T = V(), T2 = V();
  const startPose = (phone) => ({ pos: new THREE.Vector3(RW.x0 - 20, phone ? 17 : 13, RW.z + 3), look: new THREE.Vector3(-18, 0, RW.z) });
  // The camera's path (V7): a Catmull-Rom curve through the start, five points round each car's walk, one
  // point bowed out to the side between each pair of cars, and the spot behind the Hypercar where it watches it
  // go. The scroll maps to distance along the curve through knots at the start and end of every walk and move,
  // joined by a monotone cubic, so the speed changes smoothly and only stops at the two ends. The look point
  // has its own knots: still on each car through its walk, sliding to the next car through the move.
  const paths = {};
  function pathFor(phone) {
    const key = phone ? 'p' : 'd';
    if (paths[key]) return paths[key];
    const pts = [], knots = [], look = [];
    const s0 = startPose(phone);
    s0.pos.lerp(s0.look, 0.04);
    knots.push([HOLD, pts.length]); pts.push(s0.pos.clone());
    look.push([HOLD, s0.look.x, s0.look.y]);
    pts.push(new THREE.Vector3(RW.x0 + 6, 7, RW.z + 9 * (Math.sign(Math.cos(rad(arcs[0].a0))) || 1)));
    for (let i = 0; i < n; i++) {
      const u0 = INTRO + i * (ARC + MOVE);
      for (let j = 0; j < 5; j++) {
        if (j === 0) knots.push([u0, pts.length]);
        if (j === 4) knots.push([u0 + ARC, pts.length]);
        pts.push(camAt(i, THREE.MathUtils.lerp(arcs[i].a0, arcs[i].a1, j / 4), phone, new THREE.Vector3()));
      }
      look.push([u0, layout[i].x, 0.55], [u0 + ARC, layout[i].x, 0.55]);
      if (i < n - 1) {
        camAt(i, arcs[i].a1, phone, A);
        camAt(i + 1, arcs[i + 1].a0, phone, B);
        pts.push(new THREE.Vector3((A.x + B.x) / 2, Math.max(arcs[i].h, arcs[i + 1].h) + 1.0 + (phone ? 0.25 : 0), RW.z + sideOf(i) * (phone ? 11 : 8.5)));
      }
    }
    const car = layout[n - 1];
    knots.push([DRIVE + 0.24 * (1 - DRIVE), pts.length]);
    pts.push(new THREE.Vector3(car.x - (phone ? 12 : 9.5), phone ? 1.3 : 0.95, car.z + 0.7));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const D = 4000;
    const lengths = curve.getLengths(D);
    const sOf = (idx) => lengths[Math.round((idx / (pts.length - 1)) * D)];
    return (paths[key] = {
      curve, L: lengths[D],
      s: monotone(knots.map(([uu, idx]) => [uu, sOf(idx)])),
      tx: monotone(look.map(([uu, x]) => [uu, x])),
      ty: monotone(look.map(([uu, , y]) => [uu, y])),
    });
  }
  let spot;
  const pools = [];
  return {
    takesOver: true,
    // the point in the section where car i's walk is halfway round
    lpOf: (i) => INTRO + i * (ARC + MOVE) + ARC / 2,
    enter() {
      base.enter();
      if (!spot) {
        spot = new THREE.SpotLight(0xfff3e6, 260, 45, rad(24), 0.85, 1.4);
        base.rw.group.add(spot, spot.target);
        // and each car stands in its own pool of light, so the long shots down the runway read
        for (const p of layout) {
          const s = new THREE.SpotLight(0xfff3e6, 200, 26, rad(28), 0.85, 1.4);
          s.position.set(p.x - 2, 9, p.z + 3);
          s.target.position.set(p.x, 0.3, p.z);
          base.rw.group.add(s, s.target);
          pools.push(s);
        }
      }
    },
    leave() { base.leave(); },
    // V7, for the warm-up: the cities are hidden until a car is reached, and a compile skips what's hidden
    showWords(v) { base.words.forEach((w) => { w.mesh.visible = v; }); },
    frame(lpRaw, dt) {
      base.placeLate();
      const phone = api.isPhone();
      const lp = clamp(lpRaw, 0, 1);
      let u = motor(lp, dt, api.reduced);
      // reduced motion: no glides. The opening shot holds, then the page cuts from car to car, each seen
      // from the middle of its walk
      if (api.reduced) {
        const seg = ARC + MOVE;
        u = lp < INTRO ? 0 : INTRO + Math.min(n - 1, Math.floor((lp - INTRO) / seg)) * seg + ARC / 2;
      }

      // ---- the lights come up (V5): while the title comes up the screen on black, the airfield fades in,
      // then the runway lights from the threshold away down its length, and each car's pool as the wave
      // passes it. Scrolled, so it runs backwards too.
      const k = api.reduced ? 1 : smooth(lpRaw, L0, HOLD * 0.8);
      const wave = RW.x0 - 6 + smooth(k, 0.2, 1) * (RW.x1 - RW.x0 + 30);
      for (const l of base.rw.lights) l.set(smooth(wave - l.x, 0, 9));
      pools.forEach((s, i) => { s.intensity = 200 * smooth(wave - layout[i].x, 2, 16); });
      spot.intensity = 260 * smooth(k, 0.55, 1);

      // where on the walk: the intro down onto the runway, each car's walk and the move to the next, the drive.
      // These say which car is in focus and how far through a move it is (for the card, the cities, the lens);
      // the camera itself flies one smooth path below.
      let focus = 0, inArc = false, drive = -1, move = -1, intro = -1;
      if (u < INTRO) {
        intro = smoother(clamp((u - HOLD) / (INTRO - HOLD), 0, 1));
      } else if (u < DRIVE) {
        const v = u - INTRO;
        const seg = ARC + MOVE;
        const i = Math.min(n - 1, Math.floor(v / seg));
        const w = v - i * seg;
        focus = i;
        if (w < ARC || i === n - 1) inArc = true;
        else {
          move = smoother((w - ARC) / MOVE);
          if (move > 0.5) focus = i + 1;
        }
      } else {
        focus = n - 1;
        drive = clamp((u - DRIVE) / (1 - DRIVE), 0, 1);
      }
      // V7: the camera flies one curve through every walk and every move, at a speed that changes smoothly and
      // never stops, and looks at a point that slides from car to car on its own smooth curve. V6 eased to a
      // stop at each end of each piece, and the direction of travel turned there.
      const path = pathFor(phone);
      if (u < HOLD) {
        const s0 = startPose(phone);
        P.copy(s0.pos).lerp(s0.look, 0.04 * k);
        T.copy(s0.look);
      } else {
        path.curve.getPointAt(clamp(path.s(u) / path.L, 0, 1), P);
        T.set(path.tx(u), path.ty(u), RW.z);
      }
      if (drive >= 0) {
        // ---- the drive (V5): once behind the Hypercar the engine opens and it goes, headlights down the runway,
        // until its tail lights are a red point in the dark; then black. A slow push after it once it's gone.
        P.x += 3.5 * smooth(drive, 0.3, 0.9);
        T.x += goDist(drive);
      }
      api.camera.position.copy(P);
      // V7: what V6 switched in one frame at each end of a walk (a 7 to 8 degree jump, measured) now blends:
      // the look stays offset to put the car right of the card the whole way, eased in down the descent and
      // out as the Hypercar drives off; the depth of field opens and closes across a move
      const offK = phone ? 0 : intro >= 0 ? smooth(intro, 0.5, 1) : drive >= 0 ? 1 - smooth(drive, 0, 0.24) : 1;
      lookWithOffset(api.camera, T, 0.9 * offK);
      const fov = phone ? 50 : 30;
      if (Math.abs(api.camera.fov - fov) > 1e-3) { api.camera.fov = fov; api.camera.updateProjectionMatrix(); }
      const fstop = move >= 0 ? 2.4 + 3.6 * Math.sin(Math.PI * move) : drive >= 0 ? 2.4 + 0.8 * smooth(drive, 0, 0.24) : intro >= 0 ? 6 - 3.6 * smooth(intro, 0.5, 1) : 2.4;
      api.setLens(api.camera.position.distanceTo(T), fstop);
      // the key light rides above the camera's left shoulder, aimed at the car in front of it
      RIGHT.crossVectors(FWD.copy(T).sub(P).normalize(), UPV).normalize();
      spot.position.copy(P).addScaledVector(RIGHT, -1.8).add(UPV.clone().multiplyScalar(2.6));
      spot.target.position.copy(T);
      // the cars idle with their lamps lit; the cities stand behind each car, on the far side from the walk
      for (const r of api.rigs.values()) r.set(api.CAST);
      const hyper = api.rigs.get(api.FLEET[n - 1].id);
      if (hyper) {
        const d = drive >= 0 ? goDist(drive) : 0;
        hyper.root.position.x = layout[n - 1].x + d;
        if (drive >= 0) {
          // beams on down the runway, the rear squats as it launches and settles as it pulls away
          const g = clamp((drive - GO0) / 0.08, 0, 1);
          hyper.set({ ...api.CAST, beam: 1, pitch: drive > GO0 ? -0.9 * Math.sin(g * Math.PI) * (1 - g * 0.5) : 0 });
        }
      }
      // the engine: idle, a blip as the camera settles behind, then the throttle open as it goes
      if (drive >= 0 && !api.reduced) {
        const d = goDist(drive);
        const blip = Math.exp(-Math.pow((drive - 0.2) / 0.03, 2));
        api.rev(drive < GO0 ? (blip > 0.05 ? 0.35 * blip : null) : 0.55 + 0.45 * clamp((drive - GO0) / 0.25, 0, 1));
        api.engine(1 - smooth(d, 25, 140));
      } else {
        api.rev(null);
        api.engine(smooth(lp, HOLD, INTRO));
      }
      base.words.forEach((wd, j) => {
        const p = layout[j], c = arcs[j];
        const mid = (c.a0 + c.a1) / 2;
        const back = dirOf(mid + 180, A).multiplyScalar(phone ? 5.2 : 6.4);
        const face = camAt(j, mid, phone, B);
        const high = c.h > 2;
        wd.placeAt(p.x + back.x, p.z + back.z, high ? 0.2 : phone ? 1.6 : 1.0, phone ? 4.6 : 7, face, 0.86);
        // a car's city fades out as the camera leaves it and the next one fades in as it arrives
        let on = 0;
        if (inArc && focus === j) on = 1;
        if (move >= 0) {
          const leaving = j === (move > 0.5 ? focus - 1 : focus), arriving = j === (move > 0.5 ? focus : focus + 1);
          // the city stands just past its car, where the camera glides by: gone before it gets there
          if (leaving) on = 1 - smooth(move, 0, 0.12);
          if (arriving) on = smooth(move, 0.8, 1);
        }
        if (drive >= 0 && j === n - 1) on = 1 - smooth(drive, 0, 0.2);
        if (intro >= 0 && j === 0) on = smooth(intro, 0.7, 1);
        wd.fade(on);
      });
      api.focus(focus);
      api.down(inArc);
      api.title(1 - smooth(lp, HOLD + vh(2.4), HOLD + vh(23.6)));
      // the picture: up from black with the lights, down to black once the Hypercar is gone
      if (api.reduced) return 1;
      return smooth(k, 0, 0.4) * (drive >= 0 ? 1 - smooth(drive, 0.7, 0.9) : 1);
    },
  };
}

// how far down the runway the Hypercar is at point d of the drive: still until GO0, then away, harder and harder
const GO0 = 0.3;
function goDist(drive) {
  const g = clamp((drive - GO0) / (0.82 - GO0), 0, 1);
  return 150 * Math.pow(g, 2.3);
}
