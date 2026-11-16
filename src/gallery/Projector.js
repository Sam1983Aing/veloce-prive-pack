import * as THREE from 'three';
import { films, filmUrl } from '../shared/films.js';
import { roomCenterZ, ROOM_HALF_WIDTH, ROOM_HEIGHT } from './C2V3Light.js';

// A film for each car, thrown across a whole side wall of its room by a projector up on the
// opposite wall. After the hold you turn to that wall, the room goes down to cinema light, the
// film plays from its start, and when you scroll on it stops and the lights come back (main.js
// drives the level of each room's projector from the scroll).
//
// Each car's `film` in the fleet data says which wall and where. With no file at `src`, the
// projector throws a placeholder card instead, so the page works before any film exists.
//
// Sound (Sam, 14 Nov: "with the film"): each film's own sound comes up with its picture and goes
// with it. A browser plays no sound before the visitor clicks, and scrolling isn't a click, so it
// waits for the Sound switch in the bar (setSound). The films are levelled to the same loudness
// when they're encoded (tools/encode-film.sh), so no room is louder than the next.
//
// v1 threw a 3.4 m picture into a lit room, with a darkened patch of wall behind it. Two things
// made it milky (Sam, 14 Nov): the lit plaster added its own light under the film's blacks, and
// the page's tone mapping (AgX, in the final pass) flattens everything it draws, so the film's
// white came out at 57% grey. Now the room dims while the film plays, the darkened patch (the
// shadow Sam saw round the picture) is gone, and the screen undoes the tone mapping on its way
// in, so what reaches your eye is the film's own colour.

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// three.js's AgX, run backwards. Forward it goes: to Rec.2020, the inset matrix, a log2
// encoding, a sigmoid, the outset matrix, a 2.2 power, back to sRGB. Backwards, the sigmoid is
// found by bisection (it rises steadily over 0..1) and the matrices are the inverses, built in JS.
const AGX_INVERSE = /* glsl */ `
  uniform mat3 uPre;   // inverse of Rec.2020 to sRGB
  uniform mat3 uOutI;  // inverse of the outset matrix
  uniform mat3 uPost;  // inverse of (inset * sRGB to Rec.2020)
  vec3 agxCurve(vec3 x) {
    vec3 x2 = x * x;
    vec3 x4 = x2 * x2;
    return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
  }
  vec3 agxInverse(vec3 t) {
    vec3 y = uPre * t;
    y = pow(max(y, vec3(0.0)), vec3(1.0 / 2.2));
    y = clamp(uOutI * y, vec3(-0.00232), vec3(0.99858));
    vec3 lo = vec3(0.0);
    vec3 hi = vec3(1.0);
    for (int i = 0; i < 14; i++) {
      vec3 m = 0.5 * (lo + hi);
      vec3 below = step(agxCurve(m), y);
      lo = mix(lo, m, below);
      hi = mix(m, hi, below);
    }
    y = 0.5 * (lo + hi);
    y = exp2(y * (4.026069 + 12.47393) - 12.47393);
    return max(uPost * y, vec3(0.0));
  }
`;

// Light added to the wall: dark parts of the film leave the (dimmed) plaster as it is, bright
// parts light it. Crisp edges like a real throw, a touch of falloff to the corners, the plaster's
// grain breaking the image up slightly. uPeak keeps the film's white just under the display's.
const SCREEN_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uLevel;
  uniform float uPeak;
  varying vec2 vUv;
  ${AGX_INVERSE}
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // the film's pixels as light: video frames arrive still sRGB-encoded in a custom shader (three
  // only decodes them in its own materials), and reading them raw made every mid-tone too bright
  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
  }
  void main() {
    vec2 uv = vUv;
    vec3 c = srgbToLinear(texture2D(uMap, uv).rgb);
    vec2 e2 = smoothstep(vec2(0.0), vec2(0.0025, 0.0045), uv) * smoothstep(vec2(0.0), vec2(0.0025, 0.0045), 1.0 - uv);
    float edge = e2.x * e2.y;
    vec2 d = uv - 0.5;
    float fall = 1.0 - 0.22 * dot(d, d) * 2.0;
    float grain = 0.95 + 0.05 * hash(floor(uv * vec2(1600.0, 900.0)));
    vec3 want = c * uPeak * fall * grain;
    gl_FragColor = vec4(agxInverse(want) * edge * uLevel, 1.0);
  }
`;

// The beam: faint, brightest at the lens, fading towards the wall and towards its own edges.
const BEAM_FRAG = /* glsl */ `
  uniform float uLevel;
  varying vec2 vUv;
  void main() {
    float along = vUv.y;            // 0 at the lens, 1 at the wall
    float across = abs(vUv.x - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.55, 1.0, across)) * mix(1.0, 0.25, along) * smoothstep(0.0, 0.06, along);
    gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * a * 0.02 * uLevel, 1.0);
  }
`;

// the matrices for agxInverse, from the constants in three's tonemapping_pars_fragment
const colMat = (cols) => new THREE.Matrix3().fromArray(cols.flat()); // GLSL mat3(vec3 columns...)
const SRGB_TO_2020 = colMat([[0.6274, 0.0691, 0.0164], [0.3293, 0.9195, 0.088], [0.0433, 0.0113, 0.8956]]);
const REC2020_TO_SRGB = colMat([[1.6605, -0.1246, -0.0182], [-0.5876, 1.1329, -0.1006], [-0.0728, -0.0083, 1.1187]]);
const AGX_INSET = colMat([
  [0.856627153315983, 0.137318972929847, 0.11189821299995],
  [0.0951212405381588, 0.761241990602591, 0.0767994186031903],
  [0.0482516061458583, 0.101439036467562, 0.811302368396859],
]);
const AGX_OUTSET = colMat([
  [1.1271005818144368, -0.1413297634984383, -0.14132976349843826],
  [-0.11060664309660323, 1.157823702216272, -0.11060664309660294],
  [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405],
]);
const AGX_UNIFORMS = {
  uPre: { value: REC2020_TO_SRGB.clone().invert() },
  uOutI: { value: AGX_OUTSET.clone().invert() },
  uPost: { value: AGX_INSET.clone().multiply(SRGB_TO_2020).invert() },
};

function placeholderTexture(car) {
  const W = 1280;
  const H = 720;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#0d0b0a';
  g.fillRect(0, 0, W, H);
  const grad = g.createRadialGradient(W * 0.5, H * 0.5, 40, W * 0.5, H * 0.5, W * 0.6);
  grad.addColorStop(0, 'rgba(255,236,214,0.10)');
  grad.addColorStop(1, 'rgba(255,236,214,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(236,230,219,0.9)';
  g.textAlign = 'center';
  g.font = '500 30px "Libre Franklin", sans-serif';
  g.fillText(car.number, W / 2, H / 2 - 84);
  g.font = '400 92px "Libre Caslon Display", serif';
  g.fillText('Your film here', W / 2, H / 2 + 16);
  g.font = '400 26px "Libre Franklin", sans-serif';
  g.fillStyle = 'rgba(236,230,219,0.55)';
  g.fillText(`public/films/room-${car.number}.mp4`, W / 2, H / 2 + 84);
  // left raw (no colour space), like the video: the screen shader decodes both itself
  return new THREE.CanvasTexture(cv);
}

export function makeProjectors({ fleet, showroom, mirror, reduceMotion }) {
  // one video per file: rooms that share a film (the stand-ins) share its player and texture
  const reels = new Map();
  function reel(src, room) {
    if (reels.has(src)) return reels.get(src);
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    const r = { src, video, tex: null, mats: [], playing: false, gain: null, vol: 0 };
    video.addEventListener('loadeddata', () => {
      r.tex = new THREE.VideoTexture(video); // raw: SCREEN_FRAG decodes it
      r.mats.forEach((m) => (m.uniforms.uMap.value = r.tex));
    });
    // the pack: only films listed in public/films/films.json are asked for
    films.then((l) => { if (l.rooms.includes(String(room))) video.src = src; });
    reels.set(src, r);
    return r;
  }

  // ---------- sound ----------
  // Each film's sound runs through its own gain in Web Audio, so it can rise and fall with the
  // picture on any device (an iPhone ignores a video's own volume).
  const MASTER = 0.85;
  let audio = null;
  let soundOn = false;
  function wire(r) {
    if (r.gain || !audio) return;
    r.gain = audio.createGain();
    r.gain.gain.value = 0;
    audio.createMediaElementSource(r.video).connect(r.gain).connect(audio.destination);
  }
  function play(r) {
    r.video.play().catch(() => {
      // sound refused: play the picture silent rather than not at all
      r.video.muted = true;
      r.video.play().catch(() => {});
    });
  }

  const items = fleet.map((car, i) => {
    const f = car.film;
    if (!f) return null;
    const zC = roomCenterZ(i);
    const side = f.wall === 'left' ? -1 : 1;
    const w = f.width ?? 7.4;
    const h = w * 9 / 16;
    const centre = new THREE.Vector3(side * (ROOM_HALF_WIDTH - 0.004), f.y ?? 2.45, zC + (f.z ?? 0));

    const screenMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: placeholderTexture(car) }, uLevel: { value: 0 }, uPeak: { value: f.peak ?? 0.9 }, ...AGX_UNIFORMS },
      vertexShader: VERT,
      fragmentShader: SCREEN_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat);
    screen.position.copy(centre);
    screen.rotation.y = -side * Math.PI / 2; // facing into the room
    screen.renderOrder = 2;
    screen.visible = false;
    screen.name = `film-screen-${car.number}`;
    showroom.rooms[i].group.add(screen);

    // the projector, high on the opposite wall, square to the screen
    const lens = new THREE.Vector3(-side * (ROOM_HALF_WIDTH - 0.45), ROOM_HEIGHT - 0.3, centre.z);
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.16, 0.36),
      new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.55, metalness: 0.2 })
    );
    body.position.copy(lens).add(new THREE.Vector3(-side * 0.2, 0.02, 0));
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32), body.material);
    arm.position.copy(body.position).add(new THREE.Vector3(0, 0.24, 0));
    showroom.rooms[i].group.add(body, arm);

    // a pyramid from the lens to the four corners of the picture
    const toWorld = new THREE.Matrix4().compose(centre, new THREE.Quaternion().setFromEuler(screen.rotation), new THREE.Vector3(1, 1, 1));
    const corners = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ].map(([u, v]) => new THREE.Vector3(u, v, 0).applyMatrix4(toWorld));
    const pos = [];
    const uv = [];
    for (let k = 0; k < 4; k++) {
      const a = corners[k];
      const b = corners[(k + 1) % 4];
      pos.push(lens.x, lens.y, lens.z, a.x, a.y, a.z, b.x, b.y, b.z);
      uv.push(0.5, 0, 0, 1, 1, 1);
    }
    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    beamGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uLevel: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.renderOrder = 3;
    beam.visible = false;
    showroom.rooms[i].group.add(beam);
    mirror.hide(beam);

    // the film itself, if there is one
    const r = reel(f.src ?? filmUrl(`room-${car.number}.mp4`), car.number);
    r.mats.push(screenMat);
    if (r.tex) screenMat.uniforms.uMap.value = r.tex;

    return { i, reel: r, screen, beam, screenMat, beamMat, level: 0 };
  });

  return {
    items,
    get soundOn() {
      return soundOn;
    },
    // from the Sound switch, inside its click: the one moment a browser lets sound start
    setSound(on) {
      soundOn = on;
      if (!on) return;
      if (!audio) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audio = new AC();
      }
      audio.resume().catch(() => {});
      for (const r of reels.values()) {
        wire(r);
        r.video.muted = false;
        // Safari only lets a film play with sound later if it was started inside a click once,
        // so each one gets a silent start here (its gain is at 0) and stops again if it isn't on
        if (!r.playing) r.video.play().then(() => !r.playing && r.video.pause()).catch(() => {});
      }
    },
    // want[i]: how far room i's projector is on (0 to 1), from the scroll. The picture comes up
    // quickly and goes quickly, the way a projector's lamp does.
    update(dt, want) {
      for (const it of items) {
        if (!it) continue;
        const target = want[it.i] ?? 0;
        const k = reduceMotion ? 1 : 1 - Math.exp(-dt / (target > it.level ? 0.18 : 0.12));
        it.level += (target - it.level) * k;
        if (it.level < 0.002 && target === 0) it.level = 0;
        it.screenMat.uniforms.uLevel.value = it.level;
        it.beamMat.uniforms.uLevel.value = it.level;
        it.screen.visible = it.beam.visible = it.level > 0;
      }
      // a film plays while any room showing it is lit, from the start each time it comes on,
      // and stops the moment the picture goes (its sound eases out first, so it never clicks off)
      for (const r of reels.values()) {
        let on = false;
        let level = 0;
        for (const it of items) {
          if (!it || it.reel !== r || !((want[it.i] ?? 0) > 0)) continue;
          level = Math.max(level, it.level);
          if (it.level > 0.02) on = true;
        }
        const target = soundOn && on ? level * MASTER : 0;
        r.vol += (target - r.vol) * (1 - Math.exp(-dt / (target > r.vol ? 0.25 : 0.12)));
        if (r.vol < 0.001 && target === 0) r.vol = 0;
        if (r.gain) r.gain.gain.value = r.vol;
        if (on && !r.playing) {
          r.video.currentTime = 0;
          play(r);
          r.playing = true;
        } else if (!on && r.playing && r.vol === 0) {
          r.video.pause();
          r.playing = false;
        }
      }
    },
  };
}
