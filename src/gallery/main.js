import * as THREE from 'three';
import gsap from 'gsap';
import Lenis from 'lenis';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { C2V3_FLEET, C2V3_CITIES, formatEuro, loanFee, transferNote } from './C2V3FleetData.js';
import { C2V3CarLoader } from './C2V3CarLoader.js';
import { lightUniforms, initLightTextures, roomCenterZ, makeGalleryMaterial } from './C2V3Light.js';
import { C2V3Showroom } from './C2V3Showroom.js';
import { C2V3Mirror } from './C2V3Mirror.js';
import { buildShowroomEnvironment, bakeContactShadow, makeFinalMaterial } from './C2V3Studio.js';
import { loadLetteringFonts, makeLettering } from './C2V3Lettering.js';
import { makeThreshold } from './C2V3Threshold.js';
import { makeTurntable } from './C2V3Turntable.js';
import { makeHallRise } from './C2V3HallRise.js';
import { makeGuide } from './C2V3Guide.js';
import { makeProjectors } from './Projector.js';
import { makeTrailer } from './Trailer.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPhone = () => window.innerWidth < 768;

// ---------- named eases (gsap core, no plugin) ----------
function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-5) break;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    return sy(Math.min(1, Math.max(0, t)));
  };
}
// gallery: a heavy door settling. drain: light leaving a fitting. strike: a lamp catching.
gsap.registerEase('gallery', cubicBezier(0.16, 1, 0.3, 1));
gsap.registerEase('drain', cubicBezier(0.65, 0, 0.35, 1));
gsap.registerEase('strike', cubicBezier(0.2, 0.9, 0.25, 1.15));

const sineInOut = (t) => -0.5 * (Math.cos(Math.PI * THREE.MathUtils.clamp(t, 0, 1)) - 1);
// a beat can ask for the walk to arrive at speed ('in') or leave at speed ('out')
const EASES = {
  in: (t) => 1 - Math.cos((Math.PI / 2) * THREE.MathUtils.clamp(t, 0, 1)),
  out: (t) => Math.sin((Math.PI / 2) * THREE.MathUtils.clamp(t, 0, 1)),
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const deg = THREE.MathUtils.degToRad;

// ---------- staging: where each car stands and where you stand to look at it ----------
// az is measured from the car's nose (0 = straight in front). frame is where the car's centre
// should land on screen (-1..1), leaving the dark part of the frame for its label.
const STAGING = [
  {
    yaw: 24,
    phoneYaw: 12,
    desk: { az: -44, dist: 6.5, h: 1.5, fov: 40, frame: [-0.34, -0.02] },
    move: { ddist: -0.7 }, // a slow push in
    phone: { fov: 74 },
    letterX: 3.9,
    letterInset: 3.55, // out of sight through the first doorway, so the hero shows no cut-off name
  },
  {
    yaw: -32,
    phoneYaw: -16,
    desk: { az: 72, dist: 5.9, h: 1.26, fov: 40, frame: [0.3, -0.14] },
    move: { side: 0.9 }, // a low sideways track along the flank
    phone: { fov: 74 },
    letterX: -3.9,
  },
  {
    yaw: 90,
    // a front three-quarter, so it isn't a second side profile straight after the Silver
    desk: { az: -56, dist: 7.0, h: 1.5, fov: 42, frame: [-0.16, -0.2] },
    move: { side: -0.7 }, // a long-lens tracking shot along the flank, drifting away from the label
    phone: { fov: 78 },
    phoneYaw: 28,
    letterX: -3.9,
    letterInset: 3.0, // out of sight through the doorway from room 02
  },
  {
    yaw: -20,
    phoneYaw: -10,
    // low and in front, the wedge nose and the wide stance, label top left over the side wall
    desk: { az: 24, dist: 6.4, h: 1.05, fov: 40, frame: [0.3, 0.04] },
    move: { daz: 10, dh: 0.2 }, // rising slowly round the nose
    phone: { fov: 74 },
    letterX: -3.9,
    letterInset: 3.0, // left of the doorway, the part of the far wall this view looks at
  },
  {
    // nose to the left and towards you, almost side-on (Sam, 5 Nov: it was the only car showing its
    // tail). The camera keeps its place in the room: az moved with the yaw (yaw + az stays 5)
    yaw: -62,
    phoneYaw: -55,
    desk: { az: 67, dist: 6.2, h: 1.5, fov: 40, frame: [0.42, 0.08] },
    move: { daz: -11, dh: -0.25 }, // coming down and round
    phone: { fov: 74 },
    letterX: -3.9,
    letterInset: 3.2, // out of sight through the doorway from room 04
  },
  {
    yaw: -28,
    phoneYaw: -14,
    desk: { az: 42, dist: 6.2, h: 1.4, fov: 40, frame: [0.32, -0.02] },
    move: { daz: 14 }, // a slow orbit round the nose
    phone: { fov: 74 },
    letterX: -3.9,
    letterInset: 3.3, // hidden from room 05, where it would show cut off through the doorway
  },
];

// ---------- the films: where you stand to watch each room's wall ----------
// After the hold you turn to the film on a side wall (Sam, 14 Nov: "like we're in the cinema").
// Room-local metres with +x towards the screen's wall (flipped for a left-hand wall), z along the
// room from its centre, + towards the door you came in by. pos is where you turn to, look where
// you look, push how far you drift in towards the wall while the film plays.
const FILM_VIEW = {
  desk: [
    { pos: [-1.9, 1.45, 3.4], look: [7, 2.4, 0.3], fov: 40, push: 1.0 },
    { pos: [-1.9, 1.45, 3.4], look: [7, 2.4, 0.3], fov: 40, push: 1.0 },
    { pos: [-1.9, 1.45, 3.4], look: [7, 2.4, 0.3], fov: 40, push: 1.0 },
    { pos: [-1.9, 1.45, 3.4], look: [7, 2.4, 0.3], fov: 40, push: 1.0 },
    { pos: [-1.9, 1.45, 3.4], look: [7, 2.4, 0.3], fov: 40, push: 1.0 },
    { pos: [-1.9, 1.45, 3.4], look: [7, 2.4, 0.3], fov: 40, push: 1.0 },
  ],
  phone: { pos: [-2.4, 1.75, 4.6], look: [7, 2.1, 0.4], fov: 74, push: 0.6 },
};

const EYE = 1.62;
const yawOf = (i) => (window.innerWidth < 768 && STAGING[i].phoneYaw !== undefined ? STAGING[i].phoneYaw : STAGING[i].yaw);
const CAR_HALF = { w: 1.05, l: 2.42 };
const ROOMS = C2V3_FLEET.length;
const LAST = ROOMS - 1;

// ---------- app ----------
async function boot() {
  const t0 = performance.now();
  const timing = (window.__c2v3Timing = {});
  const mark = (k) => (timing[k] = Math.round(performance.now() - t0));
  const canvas = document.getElementById('c2v3-canvas');
  // the way in: the trailer plays in front while the gallery loads behind it (Trailer.js)
  const trailer = makeTrailer({ reduceMotion });

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch (err) {
    document.getElementById('no-light').hidden = false;
    document.getElementById('nav').classList.remove('is-away');
    document.body.classList.remove('is-loading');
    trailer.leave();
    return;
  }
  // the pixel ratio can only step down, if a device can't hold the frame rate
  let maxDpr = 1.5;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x050404, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030303);
  scene.fog = new THREE.Fog(0x030303, 24, 92);

  const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.08, 120);

  // text first: labels, list, form all come from the fleet data
  buildLabels();
  buildWorks();
  const form = setupForm();

  await loadLetteringFonts().catch(() => {});
  mark('fonts');
  initLightTextures();
  mark('textures');
  const envMap = buildShowroomEnvironment(renderer);

  mark('env');
  const showroom = new C2V3Showroom(scene, envMap);
  // each room lined like its car's home town (room in C2V3FleetData), the hall in oxblood plaster
  const roomWalls = C2V3_FLEET.map((car) => makeGalleryMaterial('wall', { color: car.room.wall, pattern: car.room.pattern }));
  showroom.setWallMaterials((i) => roomWalls[i]);
  const mirror = new C2V3Mirror(renderer, lightUniforms);
  mirror.hide(showroom.floor);
  mirror.onBefore = () => showroom.setReflectionPass(true);
  mirror.onAfter = () => showroom.setReflectionPass(false);
  // the uplight that opens the hall: a slot at the foot of the name wall (C2V3HallRise)
  const hallRise = makeHallRise({ scene, mirror, reduceMotion });

  // the house's name cut into the wall above the first doorway, the way a museum's is cut over its
  // entrance, in the hall's own plaster and lit by its wash. On a phone it breaks over two lines to
  // hold its size in the narrow frame.
  const cut = { color: showroom.wallMat.color.getHex() };
  const inscriptions = {
    desk: makeLettering(
      [
        { text: 'Veloce Privé', font: 'caslon', size: 1.25, tracking: -0.012 },
        { text: 'A PRIVATE COLLECTION', font: 'franklin', size: 0.17, weight: 600, tracking: 0.3, gap: 0.3 },
      ],
      { align: 'center', engrave: cut }
    ),
    phone: makeLettering(
      [
        { text: 'Veloce', font: 'caslon', size: 0.86, tracking: -0.012 },
        { text: 'Privé', font: 'caslon', size: 0.86, tracking: -0.012 },
        { text: 'A PRIVATE COLLECTION', font: 'franklin', size: 0.19, weight: 600, tracking: 0.24, gap: 0.24 },
      ],
      { align: 'center', engrave: cut }
    ),
  };
  // With no bar and no paragraph over the hall (Sam), the name, its line and the doorway are one
  // composition, centred in the frame: the hero looks at the middle of the floor-to-name height.
  inscriptions.desk.position.set(0, 4.9, 6.446);
  inscriptions.phone.position.set(0, 4.85, 6.446);
  inscriptions.phone.scale.setScalar(0.88);
  for (const m of Object.values(inscriptions)) {
    showroom.group.add(m);
    mirror.hide(m);
  }

  // each car's name lettered on the wall facing you, with a museum caption under it
  const wallNames = C2V3_FLEET.map((car, i) => {
    const st = STAGING[i];
    const words = car.title.split(' ');
    const lines =
      car.title.length > 20
        ? [words.slice(0, 1).join(' '), words.slice(1).join(' ')]
        : [car.title];
    const mesh = makeLettering(
      [
        { text: car.number, font: 'franklin', size: 0.14, weight: 500 },
        ...lines.map((t, k) => ({ text: t, font: 'caslon', size: 0.36, gap: k === 0 ? 0.12 : 0, tracking: -0.01 })),
        { text: car.origin, font: 'franklin', size: 0.12, weight: 400, gap: 0.1 },
        { text: car.engine, font: 'franklin', size: 0.12, weight: 400, gap: 0.02 },
        { text: car.run ? `${car.paintName}. ${car.run}` : car.paintName, font: 'franklin', size: 0.12, weight: 400, gap: 0.02 },
      ],
      // in ink on a pale wall
      { align: 'left', color: car.room.ink ? 0x2a2520 : undefined }
    );
    const zWall = roomCenterZ(i) - 6.0 + 0.006;
    const sz = mesh.userData.size;
    const inset = st.letterInset ?? 2.25;
    const x = st.letterX > 0 ? inset + sz.w / 2 : -inset - sz.w / 2;
    mesh.position.set(x, 2.15, zWall);
    showroom.group.add(mesh);
    lightUniforms.uLabel.value[i].set(x, 2.15);
    mirror.hide(mesh);
    return mesh;
  });

  // (room 01's bench is gone: it made no sense in a gallery of cars, Sam, 5 Nov)

  // Reserved, on the wall: tone mapping can't make the brand's red, so the dot is a page element
  // placed over the lettering each frame, beside the room number, during that room's hold.
  const wallDots = wallNames.map((mesh, i) => {
    const el = document.createElement('span');
    el.className = 'red-dot wall-dot';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    const { laid, pad, size } = mesh.userData;
    const first = laid[0];
    const xm = (pad + first.w) / 420 + 0.16 - size.w / 2;
    const ym = size.h / 2 - (pad + first.top + first.lineH * 0.55) / 420;
    const label = document.querySelector(`.label[data-car="${C2V3_FLEET[i].id}"]`);
    return { el, label, anchor: new THREE.Vector3(xm, ym, 0), mesh, on: !!C2V3_FLEET[i].reservedUntil };
  });
  window.addEventListener('c2v3:reserved', (e) => (wallDots[e.detail.roomIndex].on = true));
  const dotTmp = new THREE.Vector3();
  function placeWallDots(sec, u) {
    for (let i = 0; i < wallDots.length; i++) {
      const d = wallDots[i];
      // on the wall exactly while that room's label is up
      const show = d.on && !isPhone() && sec.kind === 'room' && sec.room === i && d.label?.classList.contains('is-on');
      d.el.classList.toggle('is-on', show);
      if (!show) continue;
      dotTmp.copy(d.anchor);
      d.mesh.localToWorld(dotTmp);
      dotTmp.project(camera);
      d.el.style.transform = `translate(${((dotTmp.x + 1) / 2) * window.innerWidth - 4.5}px, ${((1 - dotTmp.y) / 2) * window.innerHeight - 4.5}px)`;
    }
  }

  // the pointer's torch only looks for walls and floor, never the cars
  const torchTargets = [];
  showroom.group.traverse((o) => {
    const kind = o.material?.userData?.galleryKind;
    if (o.isMesh && (kind === 'wall' || kind === 'floor')) torchTargets.push(o);
  });

  // ---------- post ----------
  const rtSize = new THREE.Vector2();
  renderer.getDrawingBufferSize(rtSize);
  const composerTarget = new THREE.WebGLRenderTarget(rtSize.x, rtSize.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, composerTarget);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.3, 0.5, 2.6);
  composer.addPass(bloom);
  const finalMat = makeFinalMaterial();
  const finalPass = new ShaderPass(finalMat);
  composer.addPass(finalPass);

  const resize = () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);
    bloom.resolution.set(window.innerWidth / 2, window.innerHeight / 2);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    const db = renderer.getDrawingBufferSize(new THREE.Vector2());
    mirror.setSize(db.x, db.y);
    lightUniforms.uResolution.value.set(db.x, db.y);
    inscriptions.desk.visible = !isPhone();
    inscriptions.phone.visible = isPhone();
    wallNames.forEach((m) => (m.visible = !isPhone()));
    cars.forEach((c, i) => c && (c.yawGroup.rotation.y = deg(yawOf(i) + 180)));
    buildPaths();
  };

  // ---------- cars ----------
  const loader = new C2V3CarLoader();
  const cars = new Array(ROOMS).fill(null);
  if (DEBUG) window.__c2v3Cars = cars;

  async function placeCar(i) {
    const spec = C2V3_FLEET[i];
    const entry = await loader.loadCar(spec, envMap);
    const root = entry.root;
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(root);
    const shadow = bakeContactShadow(renderer, root, { margin: 0.75, height: 0.85 });
    root.add(shadow);
    mirror.hide(shadow);
    const yawGroup = new THREE.Group();
    // the models' noses point down -z, so a half turn makes yaw 0 face the visitor coming in
    yawGroup.rotation.y = deg(yawOf(i) + 180);
    yawGroup.add(root);
    showroom.rooms[i].stand.add(yawGroup);
    cars[i] = { entry, yawGroup, shadow, box };
    applyCarLight(i);
    // compile its shaders without blocking the main thread while the visitor scrolls
    // (visible for the call, so far-away cars are compiled too; the next frame hides them again)
    yawGroup.visible = true;
    await renderer.compileAsync(scene, camera).catch(() => {});
  }

  // ---------- light state ----------
  const lights = C2V3_FLEET.map(() => ({ s0: 0, s1: 0, s2: 0, wash: 0, lit: false, tl: null }));
  if (DEBUG) window.__c2v3Lights = lights; // read by Teach/c2-v3/tools/walk-check.mjs
  const hallLight = { v: 0 };
  const night = { v: 0 };
  // each room's after-dark glow (its walls' warm foot line, its doorway, a faint wash), on in turn
  const nightRoom = C2V3_FLEET.map(() => ({ v: 0 }));
  let closing = 0; // footer: 0 open, 1 closed for the night
  const NIGHT_WASH = 0.09;

  function roomMul(i) {
    // lights go out from the far end of the enfilade towards you, the hall first.
    // The Hypercar's room keeps a night light, so the last car stays as a silhouette.
    const start = 0.08 + i * 0.12;
    const floor = i === LAST ? 0.2 : 0;
    return 1 - (1 - floor) * THREE.MathUtils.smoothstep(closing, start, start + 0.16);
  }

  function applyCarLight(i) {
    const c = cars[i];
    if (!c) return;
    const L = lights[i];
    const pool = (L.s0 + L.s1 + L.s2) / 3;
    const level = 0.05 + 0.95 * Math.min(1, 0.6 * pool + 0.4 * L.wash);
    // in cinema light the car keeps a little of its strips, enough to read against the film
    const film = 1 - CINEMA.car * (cinema[i]?.v ?? 0);
    loader.setLightLevel(c.entry, level * roomMul(i) * film + 0.03);
  }

  // How far down the room goes while its film plays: not dark, cinema light (Sam, 14 Nov). The
  // wash on the walls goes furthest, so the picture has dark plaster round it and no milky
  // blacks, the strips over the car keep a glow, and the warm line at the foot of the walls
  // stays on like a cinema's aisle lights.
  const CINEMA = { wash: 0.88, pool: 0.7, car: 0.55, torch: 0.8 };

  function pushLights() {
    for (let i = 0; i < ROOMS; i++) {
      const L = lights[i];
      const m = roomMul(i);
      const c = cinema[i].v;
      const wash = 1 - CINEMA.wash * c;
      const pool = 1 - CINEMA.pool * c;
      lightUniforms.uWash.value[i] = Math.max(L.wash, NIGHT_WASH * night.v * nightRoom[i].v) * m * wash;
      lightUniforms.uNightRoom.value[i] = nightRoom[i].v;
      lightUniforms.uPool.value[i] = ((L.s0 + L.s1 + L.s2) / 3) * m * pool;
      showroom.setBankLevels(i, [L.s0 * m * pool, L.s1 * m * pool, L.s2 * m * pool]);
      applyCarLight(i);
    }
    lightUniforms.uHall.value = hallLight.v * (1 - THREE.MathUtils.smoothstep(closing, 0.0, 0.14));
    hallRise.update(1 - THREE.MathUtils.smoothstep(closing, 0.0, 0.14));
    showroom.setHallLevel(lightUniforms.uHall.value);
    lightUniforms.uNight.value = night.v * (1 - 0.6 * closing);
    // the first doorway's steel also catches the uplight at the foot of the wall
    showroom.updateDoorLines(lightUniforms.uNight.value, lightUniforms.uNightRoom.value, Math.max(lightUniforms.uHall.value, 0.8 * hallRise.level));
  }

  // three banks over the car, centre first, each striking with one flicker
  function strike(i, delay = 0) {
    const L = lights[i];
    if (L.lit) return;
    L.lit = true;
    L.tl?.kill();
    if (reduceMotion) {
      Object.assign(L, { s0: 1, s1: 1, s2: 1, wash: 1 });
      return;
    }
    const tl = gsap.timeline({ delay });
    ['s1', 's0', 's2'].forEach((k, n) => {
      const t = n * 0.22;
      tl.to(L, { [k]: 0.75, duration: 0.05, ease: 'power1.in' }, t)
        .to(L, { [k]: 0.3, duration: 0.04, ease: 'power1.out' }, t + 0.05)
        .to(L, { [k]: 1, duration: 0.16, ease: 'strike' }, t + 0.09);
    });
    tl.to(L, { wash: 1, duration: 0.95, ease: 'gallery' }, 0.5);
    L.tl = tl;
  }

  // each room's film on its side wall (Projector.js), on while you watch it
  const projectors = makeProjectors({ fleet: C2V3_FLEET, showroom, mirror, reduceMotion });
  // and its sound, once the visitor switches it on in the bar
  const soundBtn = document.getElementById('snd');
  function setSound(on) {
    projectors.setSound(on);
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.querySelector('.snd-label').textContent = on ? 'Sound on' : 'Sound off';
  }
  soundBtn.addEventListener('click', () => setSound(!projectors.soundOn));
  // or with Watch trailer: that click is the gesture sound waits for, so the films have theirs too
  trailer.arm(() => setSound(true));

  // ---------- the walk ----------
  const sections = [...document.querySelectorAll('main .sec')].map((el) => ({
    el,
    id: el.id,
    kind: el.dataset.sec,
    room: el.dataset.room !== undefined ? Number(el.dataset.room) : null,
    reveals: [...el.querySelectorAll('.reveal')].map((r) => ({
      el: r,
      win: (r.dataset.window || '0,1').split(',').map(Number),
    })),
  }));

  // ---------- the film stretch ----------
  // Each room's section has FILM_VH of extra scroll for its film, right after the hold, when the
  // price has gone: you turn to the wall as the room dims, the film plays while you drift in, and
  // scrolling on stops it, brings the lights back and turns you back to the car.
  // Everything else reads the section on its old scale (vu), where the stretch takes no room at
  // all, so the walk, the labels, the doorways and the turntable keep their places.
  // base: the section's height without the film (style.css adds FILM_VH to each).
  const FILM_VH = 150;
  const FILM_BASE = { 's-room-1': 210, 's-room-2': 130, 's-room-3': 250, 's-room-4': 210, 's-room-5': 170, 's-room-6': 180 };
  // the turn in, the film, the turn back, as shares of the stretch
  const FILM_IN = 0.2;
  const FILM_OUT = 0.8;
  for (const s of sections) {
    const base = FILM_BASE[s.id];
    if (!base) continue;
    s.film = { base };
    s.h0 = () => (s.el.offsetHeight * base) / (base + FILM_VH);
  }
  // where the stretch comes in on the old scale: after the hold's slow move, or at the end of a
  // section that stops at its hold (the Silver's, the Hypercar's)
  const filmAt = (s) => (s.id === 's-room-2' || s.id === 's-room-6' ? 1 : 0.68 * threshold.share(s.id));

  // a scroll position in a section, as u on the old scale and fp through the film (-1 outside it)
  function scrollU(s, y) {
    const p = y - s.el.offsetTop;
    const H = s.el.offsetHeight;
    if (!s.film) return { u: p / H, fp: -1 };
    const H0 = s.h0();
    const F = H - H0;
    const at = filmAt(s) * H0;
    if (p < at) return { u: p / H0, fp: -1 };
    if (p <= at + F) return { u: filmAt(s), fp: (p - at) / F };
    return { u: (p - F) / H0, fp: -1 };
  }
  // and back: the page's scroll for a u on the old scale (fp to land in the film)
  function scrollYOf(s, u, fp = -1) {
    if (!s.film) return s.el.offsetTop + u * s.el.offsetHeight;
    const H0 = s.h0();
    const F = s.el.offsetHeight - H0;
    if (fp >= 0) return s.el.offsetTop + filmAt(s) * H0 + fp * F;
    return s.el.offsetTop + u * H0 + (u > filmAt(s) ? F : 0);
  }
  // how far the room is turned over to its film (0 to 1): down as you turn, back up as you leave
  const sm = THREE.MathUtils.smoothstep;
  const cinemaOf = (fp) => (fp < 0 ? 0 : sm(fp, 0.02, FILM_IN) * (1 - sm(fp, FILM_OUT, 0.97)));
  // the projector: on as the lights go down, off the moment you scroll on past the film
  const filmOf = (fp) => (fp < 0 ? 0 : sm(fp, 0.08, FILM_IN) * (1 - sm(fp, FILM_OUT, FILM_OUT + 0.06)));
  const cinema = C2V3_FLEET.map(() => ({ v: 0, want: 0 }));
  const filmWant = C2V3_FLEET.map(() => 0);
  if (DEBUG) {
    window.__c2v3Film = {
      scrollYOf: (i, fp) => scrollYOf(sections.find((s) => s.room === i && s.kind === 'room'), 0, fp),
      cinema,
      filmWant,
      projectors,
      bloom,
      // try a view from the console: __c2v3Film.view(0, { pos: [-1, 1.5, 4.4] })
      view: (i, v) => {
        Object.assign(FILM_VIEW.desk[i], v);
        buildPaths();
      },
    };
  }

  // the doorways between rooms: the walk through them, and the next room lighting up
  const threshold = makeThreshold({ V, EYE, sections, lights, reduceMotion, isPhone, showroom, mirror });
  // each car turns on a turntable over its hold, with its condition report pinned to it
  const turntable = makeTurntable({ fleet: C2V3_FLEET, cars, sections, threshold, yawOf, reduceMotion, isPhone, showroom, mirror });

  function carPos(i) {
    return V(0, 0, roomCenterZ(i));
  }

  function holdPose(i, layout, move = null) {
    const st = STAGING[i];
    const base = st[layout];
    const h = move ? { ...base, az: base.az + (move.daz ?? 0), dist: base.dist + (move.ddist ?? 0), h: base.h + (move.dh ?? 0) } : base;
    const c = carPos(i);
    if (layout === 'phone') {
      // on a phone you stand in the doorway, a little higher, and look down at the car
      const pos = V(h.x ?? 0, 1.9, c.z + 6.08);
      return { pos, look: frameLook(pos, V(0, 0.55, c.z), [0, 0.32], h.fov), fov: h.fov };
    }
    const a = deg(yawOf(i) + h.az);
    const pos = V(c.x + Math.sin(a) * h.dist, h.h, c.z + Math.cos(a) * h.dist);
    if (move?.side) {
      // slide sideways, across the line of sight
      const toCar = c.clone().sub(pos).setY(0).normalize();
      pos.add(new THREE.Vector3(-toCar.z, 0, toCar.x).multiplyScalar(move.side));
    }
    // keep the visitor inside the room and out of the walls
    pos.x = THREE.MathUtils.clamp(pos.x, -6.2, 6.2);
    const zFront = c.z + 5.7;
    if (pos.z > zFront && Math.abs(pos.x) > 1.3) pos.z = zFront;
    const target = V(c.x, 0.62, c.z);
    const look = frameLook(pos, target, h.frame, h.fov);
    return { pos, look, fov: h.fov };
  }

  // Turn the gaze so the target lands at `frame` on screen instead of the centre.
  function frameLook(pos, target, frame, fov) {
    const dir = target.clone().sub(pos);
    const dist = dir.length();
    dir.normalize();
    const aspect = window.innerWidth / window.innerHeight;
    const tanV = Math.tan(deg(fov / 2));
    const yawOff = Math.atan(frame[0] * tanV * aspect);
    const pitchOff = Math.atan(frame[1] * tanV);
    const right = new THREE.Vector3().crossVectors(dir, V(0, 1, 0)).normalize();
    dir.applyAxisAngle(V(0, 1, 0), yawOff);
    dir.applyAxisAngle(right, -pitchOff);
    return pos.clone().add(dir.multiplyScalar(dist));
  }

  const beat = (u, pos, look, fov) => ({ u, pos, look, fov });

  function roomBeats(i, layout, mode) {
    const zC = roomCenterZ(i);
    const fov0 = layout === 'phone' ? 62 : 38;
    const hold = holdPose(i, layout);
    const c = carPos(i);
    const side = hold.pos.x >= 0.4 ? 1 : hold.pos.x <= -0.4 ? -1 : STAGING[i].letterX > 0 ? -1 : 1;
    const tIn = beat(0, V(0, EYE, zC + 6.22), V(0, 0.95, zC), fov0);
    const approach = beat(
      0.16,
      V(THREE.MathUtils.lerp(0, hold.pos.x, 0.5), THREE.MathUtils.lerp(EYE, hold.pos.y, 0.5), THREE.MathUtils.lerp(zC + 6.0, hold.pos.z, 0.55)),
      hold.look.clone().lerp(c.clone().setY(0.7), 0.4),
      THREE.MathUtils.lerp(fov0, hold.fov, 0.5)
    );
    // the hold is not still: each room has its own slow move, scrubbed by the scroll
    const hold2 = layout === 'phone' ? null : holdPose(i, layout, STAGING[i].move);
    const push = hold2 ? hold2.pos : hold.pos.clone().lerp(c.clone().setY(hold.pos.y), 0.05);
    const pushLook = hold2 ? hold2.look : hold.look;
    if (mode === 'toHold') {
      const beats = [tIn, { ...approach, u: 0.24 }, beat(0.42, hold.pos, hold.look, hold.fov), beat(1, push, pushLook, hold.fov)];
      return threshold.enter(beats);
    }
    // then round the car and through the next doorway
    return threshold.room([tIn, approach, beat(0.3, hold.pos, hold.look, hold.fov), beat(0.68, push, pushLook, hold.fov)], i, side, fov0);
  }

  function heroBeats(layout) {
    const phone = layout === 'phone';
    const fov = phone ? 70 : 39;
    const z0 = phone ? 13.2 : 16.7;
    const lookY = phone ? 2.75 : 2.87;
    return [
      beat(0, V(0, 1.66, z0), V(0, lookY, 6.44), fov),
      beat(0.3, V(0, 1.66, z0 - 0.35), V(0, lookY, 6.44), fov),
      beat(0.72, V(0, 1.64, 10.6), V(0, 1.2, -2), fov),
      beat(1, V(0, EYE, 6.22), V(0, 0.95, 0), phone ? 62 : 38),
    ];
  }

  function termsBeats(layout, from) {
    const z1 = roomCenterZ(1);
    const phone = layout === 'phone';
    const pos = phone ? V(3.9, 1.85, z1 + 5.4) : V(-3.4, 1.62, z1 + 5.2);
    const fov = phone ? 62 : 40;
    const look = frameLook(pos, V(0, 0.6, z1), phone ? [0, 0.52] : [0.8, -0.46], fov);
    const beats = [beat(0, from.pos, from.look, from.fov), beat(0.22, pos, look, fov), beat(0.86, pos.clone().add(V(0.14, 0, -0.16)), look, fov)];
    // leave round the same side you stood on, never across the car
    return threshold.terms(beats, Math.sign(pos.x), phone ? 62 : 38);
  }

  function worksBeats(layout, from) {
    const z4 = roomCenterZ(LAST);
    const phone = layout === 'phone';
    // turned round at the end wall: the Hypercar close, every doorway behind it lit
    const pos = phone ? V(-1.6, 1.8, z4 - 5.3) : V(-1.25, 1.78, z4 - 5.5);
    const fov = phone ? 60 : 42;
    // looking back towards the entrance, +x is screen left: Hypercar and doorway left, the list right
    const look = phone ? frameLook(pos, V(0, 0.7, z4), [0.1, 0.62], fov) : V(-6.2, 0.55, z4 + 40);
    // round the Hypercar's open side to the end wall, then turn
    return [
      beat(0, from.pos, from.look, from.fov),
      // keep your eyes on the car as you walk round it
      beat(0.14, V(3.9, EYE, z4 + 1.2), V(0, 0.6, z4), phone ? 62 : 38),
      beat(0.28, V(3.5, EYE, z4 - 3.8), V(0, 0.7, z4 - 1.2), phone ? 62 : 40),
      beat(0.44, pos, look, fov),
      beat(1, pos.clone().add(V(0.05, 0, 0.08)), look, fov),
    ];
  }

  function requestBeats(layout, from) {
    const z4 = roomCenterZ(LAST);
    const phone = layout === 'phone';
    const pos = phone ? V(-2.6, 1.6, z4 - 4.6) : V(-5.2, 1.48, z4 - 4.2);
    const target = V(0, 0.65, z4);
    const look = phone ? frameLook(pos, target, [0, 0.62], 60) : frameLook(pos, target, [0.56, 0.0], 38);
    const fov = phone ? 60 : 38;
    return [beat(0, from.pos, from.look, from.fov), beat(0.32, pos, look, fov), beat(1, pos.clone().add(V(0.04, 0, 0.06)), look, fov)];
  }

  // where you stand to watch each room's film (FILM_VIEW), on this layout
  let filmViews = [];
  function filmView(i, layout) {
    const f = C2V3_FLEET[i].film;
    if (!f) return null;
    const side = f.wall === 'left' ? -1 : 1;
    const v = layout === 'phone' ? FILM_VIEW.phone : FILM_VIEW.desk[i];
    const zC = roomCenterZ(i);
    const P = (a) => V(side * a[0], a[1], zC + a[2]);
    const pos = P(v.pos);
    const look = P(v.look);
    const pos2 = pos.clone().add(look.clone().sub(pos).setY(0).normalize().multiplyScalar(v.push ?? 0));
    return { a: { pos, look, fov: v.fov }, b: { pos: pos2, look, fov: v.fov } };
  }

  let paths = [];
  function makePath(beats) {
    const posCurve = new THREE.CatmullRomCurve3(beats.map((b) => b.pos), false, 'centripetal');
    const lookCurve = new THREE.CatmullRomCurve3(beats.map((b) => b.look), false, 'centripetal');
    return { beats, posCurve, lookCurve };
  }

  function buildPaths() {
    const layout = isPhone() ? 'phone' : 'desk';
    const list = [];
    const hero = heroBeats(layout);
    list.push(hero);
    list.push(roomBeats(0, layout));
    const r2 = roomBeats(1, layout, 'toHold');
    list.push(r2);
    list.push(termsBeats(layout, r2[r2.length - 1]));
    for (let i = 2; i < LAST; i++) list.push(roomBeats(i, layout));
    const rLast = roomBeats(LAST, layout, 'toHold');
    list.push(rLast);
    const works = worksBeats(layout, rLast[rLast.length - 1]);
    list.push(works);
    list.push(requestBeats(layout, works[works.length - 1]));
    paths = list.map(makePath);
    threshold.match(paths);
    filmViews = C2V3_FLEET.map((_, i) => filmView(i, layout));
    if (DEBUG) checkClearance();
  }

  function checkClearance() {
    const p = new THREE.Vector3();
    paths.forEach((path, s) => {
      for (let k = 0; k <= 400; k++) {
        path.posCurve.getPoint(k / 400, p);
        for (let i = 0; i < ROOMS; i++) {
          const a = -deg(yawOf(i));
          const dx = p.x;
          const dz = p.z - roomCenterZ(i);
          const lx = dx * Math.cos(a) + dz * Math.sin(a);
          const lz = -dx * Math.sin(a) + dz * Math.cos(a);
          const ox = Math.max(Math.abs(lx) - CAR_HALF.w, 0);
          const oz = Math.max(Math.abs(lz) - CAR_HALF.l, 0);
          const d = Math.hypot(ox, oz);
          if (d < 0.9) {
            console.info(`[clearance] section ${sections[s]?.id} passes ${d.toFixed(2)} m from car ${i + 1}`);
            break;
          }
        }
      }
    });
  }

  // the beat a reduced-motion visitor is cut to, per section
  const HOLD_BEAT = { hero: 0, room: 2, terms: 1, works: 3, request: 1 };
  const holdIndex = (sec, beats) => Math.min(HOLD_BEAT[sec.kind] ?? 0, beats.length - 1);

  function sampleCamera(scrollY, out) {
    const vh = window.innerHeight;
    let si = 0;
    for (let s = 0; s < sections.length; s++) {
      if (scrollY >= sections[s].el.offsetTop) si = s;
    }
    const sec = sections[si];
    const at = scrollU(sec, scrollY);
    const u = THREE.MathUtils.clamp(at.u, 0, 1);
    const fp = sec.kind === 'room' ? at.fp : -1;
    const path = paths[si];
    const b = path.beats;
    let k = 0;
    while (k < b.length - 2 && u > b[k + 1].u) k++;
    let s;
    if (reduceMotion) {
      const hk = holdIndex(sec, b);
      out.pos.copy(b[hk].pos);
      out.look.copy(b[hk].look);
      out.fov = b[hk].fov;
      // the film: cut to it while it plays
      const fv = filmViews[sec.room];
      if (fv && fp > 0.1 && fp < 0.9) {
        out.pos.copy(fv.a.pos);
        out.look.copy(fv.a.look);
        out.fov = fv.a.fov;
      }
      return { si, u, fp };
    }
    const x = (u - b[k].u) / Math.max(1e-4, b[k + 1].u - b[k].u);
    s = (EASES[b[k + 1].ease] ?? sineInOut)(x);
    const t = (k + s) / (b.length - 1);
    path.posCurve.getPoint(t, out.pos);
    path.lookCurve.getPoint(t, out.look);
    out.fov = THREE.MathUtils.lerp(b[k].fov, b[k + 1].fov, s);
    if (fp >= 0) filmCamera(sec.room, fp, out);
    return { si, u, fp, vh };
  }

  // Turn from wherever the walk is to the film's wall, drift in while it plays, turn back.
  const filmTmp = new THREE.Vector3();
  function filmCamera(i, fp, out) {
    const fv = filmViews[i];
    if (!fv) return;
    const w = fp < FILM_IN ? sineInOut(fp / FILM_IN) : fp > FILM_OUT ? 1 - sineInOut((fp - FILM_OUT) / (1 - FILM_OUT)) : 1;
    const p = THREE.MathUtils.clamp((fp - FILM_IN) / (FILM_OUT - FILM_IN), 0, 1);
    filmTmp.lerpVectors(fv.a.pos, fv.b.pos, p);
    out.pos.lerp(filmTmp, w);
    out.look.lerp(fv.a.look, w);
    out.fov = THREE.MathUtils.lerp(out.fov, fv.a.fov, w);
  }

  // ---------- scrolling ----------
  let lenis = null;
  if (!reduceMotion) {
    lenis = new Lenis({ lerp: 0.07, smoothWheel: true, wheelMultiplier: 0.9 });
    // no walking while the trailer is up
    if (trailer.covering()) lenis.stop();
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  function goTo(id, onDone) {
    const el = document.getElementById(id);
    if (!el) return;
    const vh = window.innerHeight;
    let y = el.offsetTop;
    const kind = el.dataset.sec;
    if (kind === 'room') y = scrollYOf(sections.find((s) => s.id === id), 0.48);
    if (kind === 'terms') y += el.offsetHeight * 0.5;
    if (kind === 'works') y += el.offsetHeight * 0.62;
    if (kind === 'request') y += el.offsetHeight * 0.42;
    if (id === 's-hero') y = 0;
    y = Math.min(y, document.documentElement.scrollHeight - vh);
    if (lenis) lenis.scrollTo(y, { duration: 2.4, easing: gsap.parseEase('power3.inOut'), onComplete: onDone });
    else {
      window.scrollTo(0, y);
      onDone?.();
    }
  }

  // the bar says where you are, and Index opens the visitor's guide. It stays off the hall until
  // you start walking into the first doorway (NAV_IN of the hero's scroll).
  const nav = document.getElementById('nav');
  const NAV_IN = 0.62;
  const guide = makeGuide({ fleet: C2V3_FLEET, goTo, lenis, reduceMotion });

  document.querySelectorAll('[data-go]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      // arriving at the request from the nav puts you straight in the first field
      const focusForm = a.dataset.go === 's-request' ? () => document.getElementById('f-car').focus({ preventScroll: true }) : undefined;
      goTo(a.dataset.go, focusForm);
    })
  );
  document.querySelector('.skip-link').addEventListener('click', (e) => {
    e.preventDefault();
    goTo('s-request', () => document.getElementById('f-car').focus({ preventScroll: true }));
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-request]');
    if (!btn) return;
    e.preventDefault();
    form.choose(btn.dataset.request);
    goTo('s-request', () => document.getElementById('f-from').focus({ preventScroll: true }));
  });


  // ---------- pointer torch (desktop) ----------
  const torch = { ndc: new THREE.Vector2(), active: false, pos: V(0, -10, 0), target: V(0, -10, 0), w: 0 };
  if (DEBUG) window.__c2v3Torch = torch;
  const ray = new THREE.Raycaster();
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    torch.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    const over = document.elementFromPoint(e.clientX, e.clientY);
    torch.active = !over || over === canvas || over.classList.contains('pin') || over.tagName === 'MAIN' || over.classList.contains('sec');
  });
  document.addEventListener('pointerleave', () => (torch.active = false));
  // on a phone, a tap in the dark lights a small pool there for a moment
  let tapUntil = 0;
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    if (over && over !== canvas && over.closest('a, button, input, select, label, p, h1, h2, h3, li')) return;
    torch.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    tapUntil = performance.now() + 1400;
  });

  // ---------- frame loop ----------
  const camState = { pos: V(0, 1.66, 16.7), look: V(0, 3.05, 6.44), fov: 36 };
  const camTarget = { pos: V(), look: V(), fov: 36 };
  let snap = true;
  window.__snapScroll = () => (snap = true);
  const footer = document.getElementById('s-footer');
  const termEls = [...document.querySelectorAll('.term')];
  let ready = false;
  let lastT = performance.now();
  let frames = 0;
  let lastSi = -1;
  let slowSum = 0;
  let slowN = 0;
  let wallDotU = 0;

  function updateScroll(y) {
    const vh = window.innerHeight;
    const info = sampleCamera(y, camTarget);
    const { si, u } = info;
    const sec = sections[si];
    turntable.target(sec, u, si);
    const footerP = THREE.MathUtils.clamp((y + vh - footer.offsetTop) / footer.offsetHeight, 0, 1);

    // text windows
    for (const s of sections) {
      const sAt = scrollU(s, y);
      const su = sAt.u;
      // the room's label steps aside while its film plays (with reduced motion it is up for the
      // whole room otherwise)
      const watching = sAt.fp > 0.02 && sAt.fp < 0.98;
      for (const r of s.reveals) {
        // with reduced motion the camera cuts straight to the hold, so the text is there for the whole section
        const w0 = reduceMotion ? 0.02 : r.win[0];
        const w1 = reduceMotion ? 1.01 : r.win[1];
        let on = s === sec && su >= w0 && su <= w1 && ready;
        if (s.kind === 'request') on = s === sec && su >= r.win[0] && footerP < 0.22 && ready;
        if (s.kind === 'hero') on = s === sec && su <= r.win[1] && heroShown;
        if (watching) on = false;
        r.el.classList.toggle('is-on', on);
      }
    }

    // the film: how far each room is turned over to it
    for (let i = 0; i < ROOMS; i++) {
      const mine = sec.kind === 'room' && sec.room === i && ready;
      cinema[i].want = mine ? cinemaOf(info.fp) : 0;
      filmWant[i] = mine ? filmOf(info.fp) : 0;
    }

    // u on V2's scale, before the doorway's own stretch of scroll
    const tu = u / threshold.share(sec.id);

    // conditions on phone: two at a time
    if (sec.kind === 'terms' && isPhone()) {
      const page = tu < 0.42 ? 0 : tu < 0.63 ? 1 : 2;
      termEls.forEach((t) => t.classList.toggle('is-page', Number(t.dataset.page) === page));
    } else if (!isPhone()) {
      termEls.forEach((t) => t.classList.add('is-page'));
    }

    // lights: the next room lights up bank by bank while you walk round the car before it, so
    // you see it come on through the doorway and it is lit by the time you get there
    if (ready && heroDone) threshold.lights(si, u);
    closing = reduceMotion ? 0 : footerP;
    if (reduceMotion && footerP > 0.6) closing = 1;
    finalMat.uniforms.uFade.value = 1 - 0.2 * THREE.MathUtils.smoothstep(footerP, 0.7, 1);

    // the house's name fades as you walk under it, so it never sits sliced at the top of the frame
    const nameFade = sec.kind !== 'hero' ? 0 : reduceMotion ? 1 : 1 - THREE.MathUtils.smoothstep(u, 0.42, 0.6);
    inscriptions.desk.material.opacity = inscriptions.phone.material.opacity = nameFade;

    // A car's name is on the wall only while you're in its room: it comes up as you step in and
    // dims as you turn for the next doorway, so it's never seen sliced through a doorway or
    // swelling past you on the way out. The Silver's also goes while you read the conditions.
    // (with reduced motion the camera cuts between holds, so it's simply the room you're in)
    const roomNowSec = sec.kind === 'room' ? sec.room : sec.kind === 'terms' ? 1 : sec.kind === 'hero' ? -1 : LAST;    wallNames.forEach((m, i) => {
      const inside = reduceMotion
        ? Number(i === roomNowSec)
        : i === 0
        ? sec.kind === 'hero' ? THREE.MathUtils.smoothstep(u, 0.85, 1) : 1
        : THREE.MathUtils.smoothstep(threshold.exit(i - 1, si, u), 0.8, 0.97);
      const leaving = i < LAST ? THREE.MathUtils.smoothstep(threshold.exit(i, si, u), 0.3, 0.55) : 0;
      const reading = i === 1 && sec.kind === 'terms' ? THREE.MathUtils.smoothstep(tu, 0.0, 0.1) : 0;
      // and it goes down with the lights while the film plays (it sat cut off at the frame's edge)
      const film = cinema[i].v;
      m.material.opacity = inside * (1 - leaving) * (1 - reading) * (1 - film);
    });

    // which cars need drawing
    const showAll = sec.kind === 'hero' || sec.kind === 'works' || sec.kind === 'request';
    const near = sec.kind === 'room' ? sec.room : sec.kind === 'terms' ? 1 : 0;
    cars.forEach((c, i) => {
      if (!c) return;
      c.yawGroup.visible = showAll || Math.abs(i - near) <= 1 || (sec.kind === 'terms' && i === 2);
    });

    // the bar says where you are: in a room's own section that room is "here", even while you stand in
    // its doorway, until the next room's name comes up on its wall (the end of a section
    // carries you across: the bar used to name the room behind you while you faced the next car)
    const here = sec.kind === 'room' ? sec.room : sec.kind === 'terms' ? 1 : null;
    const roomNow =
      here === null
        ? THREE.MathUtils.clamp(Math.floor((6.22 - camTarget.pos.z) / 12.44), -1, LAST)
        : here < LAST && threshold.exit(here, si, u) > 0.8
        ? here + 1
        : here;
    guide.update(sec, roomNow, y);
    nav.classList.toggle('is-away', sec.kind === 'hero' && u < NAV_IN);

    wallDotU = u;
    if (si !== lastSi) {
      lastSi = si;
      document.body.dataset.section = sec.id;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const y = window.scrollY;
    updateScroll(y);

    // the camera follows the walk with a little weight
    const k = snap || reduceMotion ? 1 : 1 - Math.exp(-dt / 0.13);
    snap = false;
    camState.pos.lerp(camTarget.pos, k);
    camState.look.lerp(camTarget.look, k);
    camState.fov += (camTarget.fov - camState.fov) * k;
    camera.position.copy(camState.pos);
    camera.lookAt(camState.look);
    if (Math.abs(camera.fov - camState.fov) > 1e-3) {
      camera.fov = camState.fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    turntable.step(dt, camera);

    // torch
    const tapping = now < tapUntil;
    if (((torch.active && !isPhone()) || tapping) && !reduceMotion) {
      ray.setFromCamera(torch.ndc, camera);
      const hit = ray.intersectObjects(torchTargets, false)[0];
      if (hit) torch.target.copy(hit.point);
      torch.w += ((tapping ? 2.2 : 1.6) - torch.w) * (1 - Math.exp(-dt / 0.3));
    } else {
      torch.w += (0 - torch.w) * (1 - Math.exp(-dt / 0.4));
    }
    torch.pos.lerp(torch.target, 1 - Math.exp(-dt / 0.12));
    const dimNow = Math.max(...cinema.map((c) => c.v));
    lightUniforms.uTorch.value.set(torch.pos.x, torch.pos.y, torch.pos.z, torch.w * (1 - closing) * (1 - CINEMA.torch * dimNow));

    for (const c of cinema) c.v += (c.want - c.v) * (reduceMotion ? 1 : 1 - Math.exp(-dt / 0.25));
    pushLights();
    projectors.update(dt, filmWant);
    threshold.update();
    placeWallDots(sections[lastSi] ?? sections[0], wallDotU);
    finalMat.uniforms.uTime.value = now / 1000;
    // nothing to draw while the trailer's black screen covers the stage (the trailer gets the GPU)
    if (!trailer.covering()) {
      mirror.update(scene, camera);
      composer.render(dt);
    }

    frames++;
    if (frames === 3 && ready) window.__c2v3Ready = true;

    // adaptive resolution: a slow device drops a quarter step of pixel ratio, never climbs back
    // (?hq turns it off for captures, where four headless browsers share one GPU). It only judges
    // once every car is in and compiled, and ignores a hitch: it used to judge during the loading
    // right after the opening, drop on any machine, and leave the doorways' thin lines pixelated
    // for the rest of the visit (Sam, 5 Nov).
    if (heroDone && window.__c2v3AllLoaded && !document.hidden && !params.has('hq') && dt < 0.05) {
      slowSum += dt;
      slowN++;
      if (slowN === 90) {
        const avg = slowSum / slowN;
        if (avg > 0.019 && renderer.getPixelRatio() > 1.0) {
          maxDpr = Math.max(1, renderer.getPixelRatio() - 0.25);
          resize();
          timing.dprStep = (timing.dprStep || 0) + 1;
        }
        slowSum = 0;
        slowN = 0;
      }
    }
  }

  // ---------- go ----------
  resize();
  window.addEventListener('resize', () => {
    resize();
    snap = true;
  });

  let heroShown = false;
  let heroDone = false;
  mark('showroom');
  await placeCar(0);
  mark('redspider');
  ready = true;
  requestAnimationFrame(frame);

  // the rest of the collection in the order you walk past it, loading behind the trailer: with
  // the models packed (public/models-c2v3, 5 Nov) none is heavy any more, and the next room is
  // always the next to arrive
  const order = [1, 2, 3, 4, 5];
  window.__c2v3AllCars = (async () => {
    for (const i of order) {
      try {
        await placeCar(i);
      } catch (err) {
        markRoomDark(i);
      }
    }
    window.__c2v3AllLoaded = true;
  })();

  // the gallery opens when the trailer ends or is skipped (at once with ?nointro)
  await trailer.finished;
  window.scrollTo(0, 0);
  lenis?.scrollTo(0, { immediate: true });
  lenis?.start();
  document.body.classList.add('is-lit');
  if (reduceMotion) document.body.classList.remove('is-loading');
  else gsap.delayedCall(2.4, () => document.body.classList.remove('is-loading'));

  // after hours: the lights come on
  if (reduceMotion) {
    for (let i = 0; i < ROOMS; i++) Object.assign(lights[i], { s0: 1, s1: 1, s2: 1, wash: 1, lit: true });
    hallLight.v = 1;
    night.v = 1;
    nightRoom.forEach((r) => (r.v = 1));
    hallRise.play(gsap, 0);
    heroShown = true;
    heroDone = true;
  } else {
    // In order, the way a gallery is opened in the evening (Sam's ask): the slot at the foot of the
    // name wall strikes and its light climbs the wall to the name, the hall's wash comes up, room
    // 01's three banks strike, then each room
    // down the enfilade catches in turn, its doorway and the foot of its walls glowing one after
    // another into the distance.
    hallRise.play(gsap, 0.9);
    gsap.to(hallLight, { v: 1, duration: 1.4, ease: 'gallery', delay: 2.0 });
    gsap.to(night, { v: 1, duration: 1.2, ease: 'gallery', delay: 2.2 });
    strike(0, 2.6);
    nightRoom.forEach((r, i) => {
      const t = i === 0 ? 2.6 : 3.4 + (i - 1) * 0.4;
      // a lamp catching: a flicker, a dip, then up to full
      gsap.timeline({ delay: t })
        .to(r, { v: 0.75, duration: 0.05, ease: 'power1.in' })
        .to(r, { v: 0.3, duration: 0.04, ease: 'power1.out' })
        .to(r, { v: 1, duration: 0.7, ease: 'gallery' });
    });
    gsap.delayedCall(2.7, () => (heroShown = true));
    gsap.delayedCall(3.0, () => (heroDone = true));
  }

}

function markRoomDark(i) {
  const label = document.querySelector(`.label[data-car="${C2V3_FLEET[i].id}"]`);
  if (label) {
    const p = document.createElement('p');
    p.className = 'label-reserved';
    p.textContent = 'The lights are off in this room tonight. The car is still in the collection: request it below.';
    label.insertBefore(p, label.querySelector('.ulink-btn'));
  }
}

// ---------- labels ----------
// keep model codes like "" on one line
const nowrapModel = (t) => t.replace(/(LP \d+-\d)/, '<span class="nw">$1</span>');

function rateRows(car) {
  const r = car.rates;
  const month = r.month ? formatEuro(r.month) : 'On request';
  return `
    <li><span>One day</span><span class="num">${formatEuro(r.day)}</span></li>
    <li><span>Three days</span><span class="num">${formatEuro(r.three)}</span></li>
    <li><span>A week</span><span class="num">${formatEuro(r.week)}</span></li>
    <li><span>A month</span><span class="num">${month}</span></li>`;
}

function reservedText(car) {
  if (!car.reservedUntil) return '';
  const d = new Date(car.reservedUntil + 'T12:00:00');
  return `On loan until ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'long' })}`;
}

function buildLabels() {
  document.querySelectorAll('.label[data-car]').forEach((el) => {
    const car = C2V3_FLEET.find((c) => c.id === el.dataset.car);
    const reserved = car.reservedUntil;
    el.innerHTML = `
      <p class="label-num"><span class="num">${car.number}</span>${
        reserved ? `<span class="red-dot" title="Reserved"></span><span>${reservedText(car)}</span>` : '<span class="red-dot" hidden></span>'
      }</p>
      <h2 class="label-title">${nowrapModel(car.title)}</h2>
      <p class="label-origin">${car.origin}. Kept in ${car.city}.</p>
      <p class="label-kept">Kept in ${car.city}, delivered to all five cities.</p>
      <p class="label-line">${car.line}</p>
      <ul class="label-rates">${rateRows(car)}</ul>
      <p class="label-terms"><strong>Deposit ${formatEuro(car.deposit)}.</strong> ${car.kmPerDay}\u00a0km a day included, then ${formatEuro(
        car.extraKm
      )} a\u00a0km. Borrowers from ${car.minAge}, licence held ${car.licenceYears === 3 ? 'three' : 'five'} years.</p>
      ${reserved ? '<p class="label-reserved">Requests are open from 15 November.</p>' : ''}
      <button type="button" class="ulink-btn" data-request="${car.id}">Request this car</button>
    `;
    // a label that sits on a pale wall is printed on a card (the ones low on the screen sit on the floor)
    el.classList.toggle('on-light', !!car.room.ink && el.matches('.label-tl, .label-tr, .label-ml'));
  });
}

function buildWorks() {
  const rows = document.getElementById('works-rows');
  rows.innerHTML = C2V3_FLEET.map((car) => {
    const r = car.rates;
    const aria = `Request ${car.title}: ${formatEuro(r.day)} a day, kept in ${car.city}`;
    return `<button type="button" class="works-row" data-request="${car.id}" aria-label="${aria}">
      <span class="w-num num">${car.number}</span>
      <span class="w-title"><span class="w-name"><span>${nowrapModel(car.title)}</span><span class="red-dot" ${car.reservedUntil ? '' : 'hidden'} id="works-dot-${car.id}"></span></span><span class="w-city">Kept in ${car.city}</span><span class="w-more num">${formatEuro(r.week)} a week, deposit ${formatEuro(car.deposit)}</span></span>
      <span class="r w-day num">${formatEuro(r.day)}</span>
      <span class="r num">${formatEuro(r.three)}</span>
      <span class="r num">${formatEuro(r.week)}</span>
      <span class="r num nw">${r.month ? formatEuro(r.month) : 'On request'}</span>
      <span class="r num w-muted">${formatEuro(car.deposit)}</span>
    </button>`;
  }).join('');
}

// ---------- the request ----------
function setupForm() {
  const f = {
    form: document.getElementById('loan-form'),
    car: document.getElementById('f-car'),
    city: document.getElementById('f-city'),
    from: document.getElementById('f-from'),
    to: document.getElementById('f-to'),
    name: document.getElementById('f-name'),
    contact: document.getElementById('f-contact'),
    fee: document.getElementById('fee'),
    btn: document.getElementById('btn-request'),
    confirm: document.getElementById('confirm'),
  };
  f.car.innerHTML = C2V3_FLEET.map((c) => `<option value="${c.id}">${c.number}  ${c.title}</option>`).join('');
  f.city.innerHTML = C2V3_CITIES.map((c) => `<option>${c}</option>`).join('');

  const iso = (d) => d.toISOString().slice(0, 10);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);
  const start = new Date(today.getTime() + 14 * 86400000);
  const end = new Date(start.getTime() + 3 * 86400000);
  f.from.min = iso(tomorrow);
  f.to.min = iso(new Date(tomorrow.getTime() + 86400000));
  f.from.value = iso(start);
  f.to.value = iso(end);

  const carById = (id) => C2V3_FLEET.find((c) => c.id === id) || C2V3_FLEET[0];
  const dayCount = () => {
    const a = new Date(f.from.value + 'T12:00:00');
    const b = new Date(f.to.value + 'T12:00:00');
    return Math.round((b - a) / 86400000);
  };
  const monthOf = (d) => d.toLocaleString('en-GB', { month: 'long' });
  const longDate = (s) => {
    const d = new Date(s + 'T12:00:00');
    return `${d.getDate()}\u00a0${monthOf(d)}`;
  };
  // "18 to 21 November", or "29 November to 2 December"
  const rangeText = (a, b) => {
    const d1 = new Date(a + 'T12:00:00');
    const d2 = new Date(b + 'T12:00:00');
    return d1.getMonth() === d2.getMonth()
      ? `${d1.getDate()} to ${d2.getDate()}\u00a0${monthOf(d2)}`
      : `${longDate(a)} to ${longDate(b)}`;
  };
  const WORDS = ['', 'One day', 'Two days', 'Three days', 'Four days', 'Five days', 'Six days', 'A week', 'Eight days', 'Nine days', 'Ten days', 'Eleven days', 'Twelve days', 'Thirteen days', 'Two weeks'];
  const numberWord = (n) => WORDS[n] || (n === 21 ? 'Three weeks' : n === 28 ? 'Four weeks' : `${n} days`);

  function datesProblem(car) {
    if (!f.from.value || !f.to.value) return 'Choose the day it arrives and the day it leaves.';
    const days = dayCount();
    if (days < 1) return 'The car leaves after it arrives. Try the dates the other way round.';
    if (f.from.value < f.from.min) return 'We need a day’s notice. The first possible day is tomorrow.';
    if (days > 60) return 'For loans over two months, call the registrar.';
    if (car.reservedUntil && f.from.value <= car.reservedUntil) return `${car.title} is on loan until ${longDate(car.reservedUntil)}. The first free day is 15 November.`;
    return '';
  }

  // the dates in words over the fields, the way the rest of the page writes them
  const dayMonth = (v) => (v ? new Date(v + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : '');
  function showDates() {
    document.getElementById('f-from-shown').textContent = dayMonth(f.from.value);
    document.getElementById('f-to-shown').textContent = dayMonth(f.to.value);
  }

  function updateFee() {
    showDates();
    const car = carById(f.car.value);
    const problem = datesProblem(car);
    if (problem && f.from.value && f.to.value && dayCount() >= 1 && !(car.reservedUntil && f.from.value <= car.reservedUntil)) {
      f.fee.textContent = problem;
      return;
    }
    if (car.reservedUntil && f.from.value && f.from.value <= car.reservedUntil) {
      f.fee.innerHTML = `${reservedText(car)}. <span class="fee-note">Requests are open from 15 November. Move your dates and the fee appears here.</span>`;
      return;
    }
    const days = Math.max(1, dayCount());
    const fee = loanFee(car, days);
    const km = car.kmPerDay * days;
    const note = transferNote(car, f.city.value);
    f.fee.innerHTML = `${rangeText(f.from.value, f.to.value)}, ${numberWord(days).toLowerCase()} in ${f.city.value}. Loan fee <strong class="num">${formatEuro(fee)}</strong>. Deposit held ${formatEuro(car.deposit)}. ${km.toLocaleString('en-GB')}\u00a0km included.${
      note ? `<span class="fee-note">${note}</span>` : ''
    }`;
  }

  function setError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.closest('.field').classList.toggle('has-error', !!msg);
  }

  f.car.addEventListener('change', () => {
    f.city.value = carById(f.car.value).city;
    updateFee();
  });
  [f.city, f.from, f.to].forEach((el) => el.addEventListener('change', () => {
    if (el === f.from && f.to.value <= f.from.value) {
      const d = new Date(f.from.value + 'T12:00:00');
      f.to.value = iso(new Date(d.getTime() + 3 * 86400000));
    }
    setError('err-dates', '');
    updateFee();
  }));
  f.name.addEventListener('input', () => setError('err-name', ''));
  f.contact.addEventListener('input', () => setError('err-contact', ''));
  updateFee();

  f.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const car = carById(f.car.value);
    const dateErr = datesProblem(car);
    const nameErr = f.name.value.trim().length < 2 ? 'Your name, as it is on your licence.' : '';
    const c = f.contact.value.trim();
    const contactOk = /\S+@\S+\.\S+/.test(c) || c.replace(/\D/g, '').length >= 7;
    const contactErr = contactOk ? '' : 'A phone number or an email, so the registrar can call you back.';
    setError('err-dates', dateErr);
    setError('err-name', nameErr);
    setError('err-contact', contactErr);
    const firstBad = dateErr ? f.from : nameErr ? f.name : contactErr ? f.contact : null;
    if (firstBad) {
      firstBad.focus();
      return;
    }
    f.btn.classList.add('is-sending');
    f.btn.querySelector('span').textContent = 'Sending';
    setTimeout(() => {
      const first = f.name.value.trim().split(/\s+/)[0];
      const shortCap = car.short.charAt(0).toUpperCase() + car.short.slice(1);
      document.getElementById('confirm-work').textContent = car.title;
      document.getElementById('confirm-line').textContent = `Thank you, ${first}. ${shortCap} is held for you from ${longDate(
        f.from.value
      )} while our registrar calls to confirm, usually within the hour.`;
      f.form.hidden = true;
      f.confirm.hidden = false;
      document.querySelector('.request-title').innerHTML = 'Requested<span class="period">.</span>';
      f.confirm.focus({ preventScroll: true });
      reserve(car);
    }, 700);
  });

  return {
    choose(id) {
      const car = carById(id);
      f.car.value = car.id;
      f.city.value = car.city;
      if (car.reservedUntil && f.from.value <= car.reservedUntil) {
        f.from.value = '2026-11-15';
        f.to.value = '2026-11-18';
      }
      updateFee();
    },
  };
}

function reserve(car) {
  const held = document.getElementById(`ix-held-${car.id}`);
  if (held) held.hidden = false;
  const wd = document.getElementById(`works-dot-${car.id}`);
  if (wd) wd.hidden = false;
  const label = document.querySelector(`.label[data-car="${car.id}"]`);
  const ld = label?.querySelector('.label-num .red-dot');
  if (ld) {
    ld.hidden = false;
    if (!label.querySelector('.held')) {
      const s = document.createElement('span');
      s.className = 'held';
      s.textContent = 'Held for you';
      ld.after(s);
    }
  }
  window.dispatchEvent(new CustomEvent('c2v3:reserved', { detail: car }));
}

boot();
