import * as THREE from 'three';
import gsap from 'gsap';
import { roomCenterZ, ROOM_HALF_DEPTH, WALL, DOOR_HALF } from './C2V3Light.js';

// The doorways (Sam's pick from three demos, "Handoff"): as you leave a car, the next room
// lights up bank by bank through the doorway behind it, its light reaches your floor, and you
// walk through without stopping.
//
// V2's walk stopped dead inside the wall, because every segment of the path eased in and out
// and the section boundary sat in the doorway. Here the walk steps back towards the axis after
// the car, arrives at the wall at speed and leaves it at speed into the next room.

// u of each exit beat, written for a room section's exit (the hold ends at 0.68).
// clear - side = pass - clear, so the walk keeps its speed through the clear beat.
const EXIT = { side: 0.76, clear: 0.83, pass: 0.9 };

// the doorway at the end of room d (0..4) leads into room d + 1
const EXIT_IDS = ['s-room-1', 's-terms', 's-room-3', 's-room-4', 's-room-5'];
const ENTER_IDS = ['s-room-2', 's-room-3', 's-room-4', 's-room-5', 's-room-6'];
const doorZ = (d) => roomCenterZ(d) - ROOM_HALF_DEPTH - WALL / 2;
const NEUTRAL = new THREE.Color(1.0, 0.9, 0.78);

// The threshold has its own stretch of scroll: each section you leave by a doorway is EXTRA vh
// taller than in V2 (heights in style.css), and everything before the exit keeps its V2 place,
// so its beats are scaled by k (the label windows in the html are scaled the same way).
const EXTRA = 50;
const HEIGHT = { 's-room-1': 210, 's-terms': 200, 's-room-3': 250, 's-room-4': 210, 's-room-5': 170 };

export function makeThreshold(ctx) {
  const { V, EYE, sections, lights, reduceMotion, isPhone } = ctx;
  // on a phone the gaze through a doorway is the next hold's: pitched down at the car, so the
  // far ends of the ceiling strips stay above the frame
  const gazeAt = (zN) => (isPhone() ? V(0, -0.8, zN + 0.5) : V(0, 0.95, zN));
  const idx = (id) => sections.findIndex((s) => s.id === id);
  const exitSi = EXIT_IDS.map(idx);
  const enterSi = ENTER_IDS.map(idx);
  const k = EXIT_IDS.map((id) => 1 - EXTRA / HEIGHT[id]);
  const exitU0 = EXIT_IDS.map((id, d) => (id === 's-terms' ? 0.86 : 0.68) * k[d]);

  // ---------- the walk ----------
  // a beat's u on a room section's exit (0.68 to 1), mapped onto the real one
  const at = (u, d) => exitU0[d] + ((u - 0.68) / 0.32) * (1 - exitU0[d]);

  function exitBeats(d, side, fov) {
    const zC = roomCenterZ(d);
    const zN = roomCenterZ(d + 1);
    return [
      // round the car, wide enough that its nose never fills the frame, eyes on the doorway
      { u: at(EXIT.side, d), pos: V(side * 4.8, EYE, zC + 1.0), look: V(side * 0.3, 1.25, zC - 6.6), fov },
      // past the car's far corner (every car ends within 2.7 m of its centre), still walking,
      // close enough to the axis that the next car shows through the doorway, not the pier
      // (a phone looks lower, under the next room's strips)
      { u: at(EXIT.clear, d), pos: V(side * 2.0, EYE, zC - 3.7), look: V(-side * 0.2, isPhone() ? -0.5 : 1.2, zC - 9.5), fov, ease: 'in' },
      // on the axis, 1.4 m short of the wall: the doorway is the whole frame
      { u: at(EXIT.pass, d), pos: V(side * 0.8, EYE, zC - 4.6), look: gazeAt(zN), fov, ease: 'out' },
      // through the wall still moving
      { u: 1, pos: V(0, EYE, zC - 6.22), look: gazeAt(zN), fov, ease: 'in' },
    ];
  }

  // into a room: leave the doorway at speed
  function enter(beats) {
    beats[1].ease = 'out';
    if (isPhone()) {
      beats[0].look = gazeAt(beats[0].pos.z - 6.22);
      beats[1].look = beats[2].look.clone();
    }
    return beats;
  }

  // a room you walk in, hold in and leave by the next doorway
  function room(beats, i, side, fov) {
    enter(beats);
    beats.forEach((b) => (b.u *= k[i]));
    return [...beats, ...exitBeats(i, side, fov)];
  }

  // the conditions stand in room 02 and leave by its doorway
  function terms(beats, side, fov) {
    beats.forEach((b) => (b.u *= k[1]));
    return [...beats, ...exitBeats(1, side, fov)];
  }

  // Leave the doorway at the speed you reached it with: the first step into the next room
  // gets as much scroll as keeps the pace (sections have different heights).
  function match(paths) {
    for (let d = 0; d < EXIT_IDS.length; d++) {
      const out = paths[exitSi[d]]?.beats;
      const inn = paths[enterSi[d]]?.beats;
      if (!out || !inn) continue;
      const pass = out[out.length - 2];
      const door = out[out.length - 1];
      const d1 = pass.pos.distanceTo(door.pos);
      const d2 = inn[0].pos.distanceTo(inn[1].pos);
      // heights without a room's film stretch (main.js), which the walk never sees
      const h = (s) => s.h0?.() ?? s.el.offsetHeight;
      const h1 = h(sections[exitSi[d]]);
      const h2 = h(sections[enterSi[d]]);
      const u = (d2 * (1 - pass.u) * h1) / Math.max(1e-3, d1 * h2);
      inn[1].u = THREE.MathUtils.clamp(u, 0.06, inn[2].u - 0.08);
    }
  }

  // the share of a section that comes before its threshold, to read a u on V2's scale
  const share = (id) => k[EXIT_IDS.indexOf(id)] ?? 1;

  // how far through doorway d you are: 0 at the end of the hold, 1 in the wall
  function exitP(d, si, u) {
    if (si > exitSi[d]) return 1;
    if (si < exitSi[d]) return 0;
    return THREE.MathUtils.clamp((u - exitU0[d]) / (1 - exitU0[d]), 0, 1);
  }
  const sm = THREE.MathUtils.smoothstep;

  // ---------- the next room, a bank for each step ----------
  // null until the first frame, so a room lit by the reduced-motion start is put right at once
  const banks = lights.map(() => [null, null, null]);
  function setBank(i, bank, on) {
    if (banks[i][bank] === on) return;
    banks[i][bank] = on;
    const key = ['s1', 's0', 's2'][bank];
    const L = lights[i];
    gsap.killTweensOf(L, key);
    if (reduceMotion) {
      L[key] = on ? 1 : 0;
      return;
    }
    if (on) {
      gsap.timeline()
        .to(L, { [key]: 0.75, duration: 0.05, ease: 'power1.in' })
        .to(L, { [key]: 0.3, duration: 0.04, ease: 'power1.out' })
        .to(L, { [key]: 1, duration: 0.16, ease: 'strike' });
    } else {
      gsap.to(L, { [key]: 0, duration: 0.4, ease: 'drain' });
    }
  }

  function updateLights(si, u) {
    for (let d = 0; d < EXIT_IDS.length; d++) {
      const i = d + 1;
      const e = exitP(d, si, u);
      // you see it through the doorway behind the car you're leaving, centre bank first
      [0.04, 0.12, 0.2].forEach((t, b) => setBank(i, b, e > t));
      const L = lights[i];
      L.tl?.kill();
      L.wash = sm(e, 0.14, 0.5);
      L.lit = e > 0.2;
    }
  }

  // ---------- its light through the doorway, laid on the floor of the room you stand in ----------
  const spills = [];
  for (let d = 0; d < EXIT_IDS.length; d++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uLevel: { value: 0 }, uColor: { value: NEUTRAL.clone() } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      // a faint glow of the next room's light, no edges anywhere, gone 3 m from the door. Light
      // from ceiling strips through a doorway is diffuse, and it can never be brighter on your
      // floor than on theirs: additive light on a dark floor needs far less than you'd guess.
      fragmentShader: `
        uniform float uLevel; uniform vec3 uColor; varying vec2 vP;
        void main(){
          float y = 1.75 - vP.y;             // metres from the doorway
          float spread = ${DOOR_HALF.toFixed(2)} + y * 0.35;
          float a = 1.0 - smoothstep(spread * 0.3, spread * 1.3, abs(vP.x));
          a *= exp(-y * 1.1) * smoothstep(0.0, 0.3, y) * (1.0 - smoothstep(2.0, 3.4, y));
          gl_FragColor = vec4(uColor * a * uLevel * 0.035, 1.0);
        }`,
    });
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 3.5), mat);
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(0, 0.003, doorZ(d) + WALL / 2 + 1.75);
    spill.renderOrder = 2;
    spill.visible = false;
    ctx.showroom.group.add(spill);
    ctx.mirror.hide(spill);
    spills.push(spill);
  }

  function update() {
    spills.forEach((s, d) => {
      const L = lights[d + 1];
      s.material.uniforms.uLevel.value = ((L.s0 + L.s1 + L.s2) / 3) * 0.7 + L.wash * 0.3;
      s.visible = s.material.uniforms.uLevel.value > 0.01;
    });
  }

  return { room, terms, enter, match, share, exit: exitP, lights: updateLights, update };
}
