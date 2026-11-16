import '../shared/noLogos.js';
// Waiting, V6. A film you scroll, then the cars, the running order and the request.
// V6 (Sam, 14 Nov): the cars' title centred, the runway at half the pace with slower turns, the Hypercar in
// the running order, and no sound ("it doesn't sound like the actual car, so just sound off").
// V5 (Sam, 14 Nov): opens on a dark screen (the car flashes its headlamps, then the apron's lights come up),
// no clock and no skip, the film goes dark before "Who's waiting for you?" and the runway lights up under it,
// the Hypercar drives off the runway into the running order, and parks for the request, the last screen.
import * as THREE from 'three';
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';
import { buildApron } from './world/Apron.js';
import { loadCar } from './car/CarRig.js';
import { createPost } from './post/Post.js';
import { FLEET, byId } from './fleet.js';
import { SHOTS, PAGE_CAMS, totalVh } from './film/shots.js';
import { CityWord } from './film/CityWord.js';
import { makeRunwayWalk } from './film/Runway.js';

gsap.registerPlugin(CustomEase);
// shutter: a heavy start and a soft landing, for the title and the form. settle: for the nav.
CustomEase.create('shutter', 'M0,0 C0.74,0 0.14,1 1,1');
CustomEase.create('settle', 'M0,0 C0.18,0.82 0.3,1 1,1');

// Everything waits on the fonts and the first car, so the page boots in one async function
// (top-level await is not in Vite's default build target).
async function boot() {
  const q = new URLSearchParams(location.search);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || q.has('reduced');
  const clamp = THREE.MathUtils.clamp;
  const smooth = THREE.MathUtils.smoothstep;
  const $ = (s) => document.querySelector(s);
  const isPhone = () => innerWidth < 768;

  const el = {
    body: document.body,
    film: $('.film'), cars: $('.cars'), order: $('.order'), request: $('.request'),
    black: $('.stage__black'),
    sub: $('.picture__subtitle'), cap: $('.picture__caption'),
    title: $('.title'),
    bars: [$('.letterbox--top'), $('.letterbox--bottom')],
    nav: $('.nav'),
    cast: $('.cars__cast'), card: $('.cars__card'), carName: $('.cars__name'), carKept: $('.cars__kept'), carFact: $('.cars__fact'), carPrice: $('.cars__price'), choose: $('.cars__choose'),
    form: $('.request__form'), done: $('.request__done'), rate: $('.request__rate'), error: $('.request__error'), select: $('.request__form select'),
  };
  el.film.style.height = `${totalVh + 100}vh`;
  el.body.dataset.zone = 'film';
  el.nav.inert = true;

  // ------------------------------------------------------------------ renderer and world

  const canvas = $('.stage__canvas');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch (e) {
    // the designed empty state: say so plainly, keep the page usable
    el.body.classList.add('no-webgl');
    el.body.classList.remove('is-loading');
    $('.stage__fallback').hidden = false;
    throw e;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = Number(q.get('exp') || 0.62);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  let shadowKey = '';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 20000);
  await Promise.all([
    document.fonts.load('500 64px "Archivo"'),
    document.fonts.load('400 expanded 200px "Archivo"'),
    document.fonts.load('300 expanded 200px "Archivo"'),
    document.fonts.load('400 21px "Archivo"'),
  ]);
  const world = buildApron(renderer, scene);
  const post = createPost(renderer, scene, camera, { samples: Number(q.get('msaa') ?? 2) });
  // profiling switches for the perf tool
  if (q.has('norefl')) world.ground.skin.visible = false;
  if (q.has('nopts')) world.farLights.points.visible = false;
  if (q.has('nobloom')) post.bloom.enabled = false;
  // the film's title stands in the apron in the first shot, lit, reflected in the wet ground
  const titleWord = new CityWord(scene);
  titleWord.set('Waiting');
  // V6: no sound. The film still calls these at the same moments; they do nothing here. (V5, frozen in
  // versions/c3-v5/, has the synthesised engine and the airfield.)
  const sound = { on: false, mix() {}, unlock() {}, profile() {}, start() {}, idle() {}, stop() {}, rev() {} };

  // ------------------------------------------------------------------ the cars

  // on stand 7 the paint sees the apron's lights a little stronger than physical, so the close-ups keep their finish
  const FILM_ENV = 1.4;
  const rigs = new Map();
  const loading = new Map();
  function getRig(id) {
    if (rigs.has(id)) return Promise.resolve(rigs.get(id));
    if (!loading.has(id)) {
      loading.set(id, loadCar(byId(id), world.envMap).then((r) => { r.setEnv(world.envMap, FILM_ENV); rigs.set(id, r); return r; }));
    }
    return loading.get(id);
  }
  let rig = await getRig('redspider');
  scene.add(rig.root);
  // the car the visitor chose, if any. Until then the running order and the request show the Hypercar,
  // which parks for the request after its drive off the runway.
  let picked = null;
  // V6: the running order shows the Hypercar, the car that just drove off the runway (Sam), as does the request
  const orderCar = () => picked ?? 'bluehyper';
  const requestCar = () => picked ?? 'bluehyper';
  function mount(id) {
    const next = rigs.get(id);
    if (!next || next === rig) return !!next;
    scene.remove(rig.root);
    next.vapour.clear();
    scene.add(next.root);
    rig = next;
    return true;
  }

  // ------------------------------------------------------------------ casting list and form options

  FLEET.forEach((c, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" data-i="${i}">${c.name}</button>`;
    el.cast.appendChild(li);
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = `${c.name}, kept in ${c.city}`;
    el.select.appendChild(o);
  });
  const castButtons = [...el.cast.querySelectorAll('button')];

  // ------------------------------------------------------------------ scroll

  const lenis = reduced ? null : new Lenis({ lerp: 0.07, smoothWheel: true });
  if (lenis) {
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  function scrollTo(target) {
    const y = typeof target === 'number' ? target : document.querySelector(target).getBoundingClientRect().top + scrollY;
    if (lenis) lenis.scrollTo(y, { duration: 1.6, easing: (x) => 1 - Math.pow(1 - x, 4) });
    else window.scrollTo(0, y);
  }

  // ------------------------------------------------------------------ links
  document.querySelectorAll('.nav a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    scrollTo(a.getAttribute('href') === '#top' ? 0 : a.getAttribute('href'));
  }));
  castButtons.forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.i);
    scrollTo(el.cars.offsetTop + runway.lpOf(i) * (el.cars.offsetHeight - innerHeight));
  }));
  el.choose.addEventListener('click', (e) => {
    e.preventDefault();
    setChosen(FLEET[castIndex].id);
    scrollTo('#request');
  });
  el.select.addEventListener('change', () => setChosen(el.select.value));
  function setChosen(id) {
    picked = id;
    showRate(id);
    getRig(id);
  }
  function showRate(id) {
    el.select.value = id;
    el.rate.textContent = `From ${byId(id).rate} a day.`;
  }
  showRate(requestCar());

  // ------------------------------------------------------------------ the request

  let confirmed = '';
  const escapeHtml = (t) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(el.form);
    const need = [['where', 'the airport or address'], ['when', 'the date and time'], ['name', 'your name'], ['phone', 'your phone']];
    const missing = need.filter(([k]) => !String(f.get(k) || '').trim());
    el.form.querySelectorAll('.field').forEach((x) => x.classList.remove('is-missing'));
    el.form.querySelectorAll('.field__error').forEach((x) => { x.textContent = ''; });
    if (missing.length) {
      missing.forEach(([k]) => el.form.querySelector(`[name="${k}"]`).closest('.field').classList.add('is-missing'));
      el.error.textContent = '';
      el.form.querySelectorAll('.field__error').forEach((x) => { x.textContent = ''; });
      const first = el.form.querySelector(`[name="${missing[0][0]}"]`).closest('.field');
      first.querySelector('.field__error').textContent = `We still need ${missing[0][1]}.`;
      el.form.querySelector(`[name="${missing[0][0]}"]`).focus();
      return;
    }
    el.error.textContent = '';
    const when = String(f.get('when')).trim().replace(/[.\s]+$/, '');
    el.form.querySelector('.request__button').classList.add('is-sending');
    setTimeout(() => {
      confirmed = `${when}. It will be there.`;
      // bring the whole request back into view, so the moment (letterbox, clock, subtitle) is seen
      scrollTo(el.request.offsetTop + 2);
      el.body.classList.add('is-confirmed');
      el.done.innerHTML = `<strong>Thank you, ${escapeHtml(String(f.get('name')).trim().split(' ')[0])}.</strong>Your concierge will call ${escapeHtml(String(f.get('phone')).trim())} within twenty minutes to confirm the car and the stand.`;
      gsap.to(el.form, {
        opacity: 0, duration: 0.5, ease: 'shutter',
        onComplete: () => {
          el.form.hidden = true;
          el.done.hidden = false;
          gsap.fromTo(el.done, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'none' });
        },
      });
    }, 650);
  });

  // ------------------------------------------------------------------ ripples: the pointer disturbs the water
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let lastRip = 0, ripX = 0, ripY = 0;
  function ripple(e, force) {
    const now = performance.now();
    if (!force && (now - lastRip < 140 || Math.hypot(e.clientX - ripX, e.clientY - ripY) < 24)) return;
    lastRip = now; ripX = e.clientX; ripY = e.clientY;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(ground, hit) && hit.distanceTo(camera.position) < 60) world.ground.ripple(hit.x, hit.z, force ? 1 : 0.6);
  }
  addEventListener('pointermove', (e) => ripple(e, false), { passive: true });
  addEventListener('pointerdown', (e) => ripple(e, true), { passive: true });

  // ------------------------------------------------------------------ cursor: hides while the film plays, like a player

  let idleTimer = 0;
  addEventListener('pointermove', () => {
    el.body.classList.remove('is-still');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (zone === 'film') el.body.classList.add('is-still'); }, 1800);
  });

  // ------------------------------------------------------------------ the director

  const curveCache = new Map();
  const rigOf = (def) => (isPhone() ? def.phone : def.desk);
  function curve(points) {
    if (!curveCache.has(points)) {
      const v = points.map((p) => new THREE.Vector3(...p));
      curveCache.set(points, v.length === 1 ? { getPoint: (t, o) => o.copy(v[0]) } : new THREE.CatmullRomCurve3(v, false, 'centripetal'));
    }
    return curveCache.get(points);
  }
  const P = new THREE.Vector3(), L = new THREE.Vector3(), U = new THREE.Vector3();
  const CAR_C = new THREE.Vector3(0, 0.6, 0);
  let lens = { focus: 20, fstop: 4 };
  function setCamera(def, u, shake = 0) {
    const r = rigOf(def);
    curve(r.pos).getPoint(u, P);
    curve(r.look).getPoint(u, L);
    if (r.up) curve(r.up).getPoint(u, U); else U.set(0, 1, 0);
    if (shake) { P.x += shake * 0.7; P.y += shake; }
    camera.position.copy(P);
    camera.up.copy(U).normalize();
    camera.lookAt(L);
    if (camera.fov !== r.fov) { camera.fov = r.fov; camera.updateProjectionMatrix(); }
    lens = { focus: r.focus === 'far' ? 320 : P.distanceTo(CAR_C), fstop: r.fstop || 2.8 };
  }

  let zone = 'film';
  let filmP = 0;
  let shotKey = '';
  let cutUntil = 0;
  let barsOpen = false;
  let castIndex = 0;
  let castShown = -1;
  let castTitleK = '';
  let castOn = false;
  let fadeFrom = -1e9;
  const START = SHOTS.findIndex((s) => s.id === 'start');
  const sig = { unlock: -1, lights: -1, start: -1, catchAt: -1, running: false };
  const cut = (ms = 120) => { cutUntil = performance.now() + ms; };

  function filmRaw() {
    const r = el.film.getBoundingClientRect();
    return clamp(-r.top / (r.height - innerHeight), 0, 1);
  }
  function localOf(section) {
    const r = section.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, r.height - innerHeight), 0, 1);
  }
  function zoneNow() {
    const y = scrollY, h = innerHeight;
    if (y < el.cars.offsetTop - h * 0.4) return 'film';
    if (y < el.order.offsetTop - h * 0.45) return 'cars';
    if (y < el.request.offsetTop - h * 0.45) return 'order';
    return 'request';
  }

  let titleShown = -1;
  function setTitle(k) {
    const r = Math.round(k * 100) / 100;
    if (r === titleShown) return;
    titleShown = r;
    el.title.style.opacity = String(r);
    el.title.style.visibility = r < 0.01 ? 'hidden' : 'visible';
  }
  function setLine(node, text) {
    if (node.dataset.text === text) return;
    node.dataset.text = text;
    if (text) { node.textContent = text; node.classList.add('is-on'); } else node.classList.remove('is-on');
  }
  function setBars(open) {
    if (open === barsOpen) return;
    barsOpen = open;
    const d = reduced ? 0.01 : 1.2;
    gsap.to(el.bars[0], { yPercent: open ? -100 : 0, duration: d, ease: 'expo.inOut', overwrite: true });
    gsap.to(el.bars[1], { yPercent: open ? 100 : 0, duration: d, ease: 'expo.inOut', overwrite: true });
  }

  // The signature: scroll decides when, real time decides how (flash lengths, the sweep, the catch).
  const flash = (ms) => ((ms >= 0 && ms < 120) || (ms >= 280 && ms < 400) ? 1 : 0);
  function signature(t, now) {
    if (t >= 0.12) { if (sig.unlock < 0) { sig.unlock = now; sound.unlock(); } } else sig.unlock = -1;
    if (t >= 0.22) { if (sig.lights < 0) sig.lights = now; } else sig.lights = -1;
    if (t >= 0.34) {
      if (sig.start < 0) {
        sig.start = now;
        sig.catchAt = now + 720;
        sound.profile(rig.spec);
        sound.start();
        sig.running = true;
      }
    } else if (sig.start >= 0) {
      sig.start = -1; sig.running = false; sound.stop(); rig.vapour.clear();
    }
    const lit = sig.lights >= 0;
    const ms = lit ? now - sig.lights : 0;
    const caught = sig.start >= 0 && now >= sig.catchAt;
    const k = caught ? (now - sig.catchAt) / 1000 : 9;
    // the lights sag while the starter turns and come up to full at the catch, as they do on a real car
    const cranking = sig.start >= 0 && !caught;
    const sag = cranking ? 0.5 + 0.12 * Math.sin(now * 0.09) : 1;
    const beams = caught ? clamp(k / 0.25, 0, 1) : 0;
    return {
      indicator: sig.unlock >= 0 ? Math.max(flash(now - sig.unlock), t < 0.135 ? 1 : 0) : 0,
      drl: lit ? clamp(ms / 240, 0, 1) : 0,
      head: lit ? beams : 0,
      drlSag: sag,
      tail: lit ? clamp((ms - 220) / 180, 0, 1) * (caught ? 1 : 0.6) : 0,
      roll: !reduced && caught && k < 1.4 ? 0.8 * Math.exp(-k * 4.2) * Math.sin(k * 16) : 0,
      pitch: !reduced && caught && k < 1.4 ? -0.25 * Math.exp(-k * 5) * Math.sin(k * 13) : 0,
      vapour: caught ? 1 : 0,
      shake: !reduced && caught && k < 0.6 ? 0.004 * Math.exp(-k * 7) * Math.sin(k * 90) : 0,
    };
  }
  const RUNNING = { indicator: 0, drl: 1, head: 1, tail: 1, roll: 0, pitch: 0, vapour: 1, drlSag: 1, beam: 1 };
  const OFF = { indicator: 0, drl: 0, head: 0, tail: 0, roll: 0, pitch: 0, vapour: 0, drlSag: 1, beam: 1 };
  // in the ring every car idles with its lamps lit, no beams: they would all point at the camera
  const CAST = { indicator: 0, drl: 1, head: 1, tail: 1, roll: 0, pitch: 0, vapour: 1, drlSag: 1, beam: 0 };
  function keepRunning() {
    if (!sig.running) { sound.profile(rig.spec); sound.idle(); sig.running = true; }
  }
  function settleDown() {
    if (sig.start >= 0 || sig.running) { sig.start = -1; sig.unlock = -1; sig.lights = -1; sig.running = false; sound.stop(); rig.vapour.clear(); }
  }

  // The opening (V5), on a clock rather than the scroll: a dark screen, the car flashes its headlamps
  // twice, the mast's heads strike one after another (a flicker, then the climb to full), the rest of the
  // airfield comes up behind, the title stands up in the scene, and last the title card in the bars.
  // A scroll at any point ends it with everything on. Reduced motion starts with everything on.
  const OPEN = { flash: [[0.85, 1.0], [1.24, 1.39]], heads: [2.0, 2.32, 2.62, 2.86], rest: [2.5, 4.3], word: [3.2, 4.6], card: 4.0, end: 5.0 };
  // its clock runs on rendered frames, a 24th of a second at most each, from the third frame on: the first
  // frame compiles every shader and takes seconds, and a clock on the wall would spend the dark beat and the
  // flash inside that stall (the first recording of V5 showed the page already lit when it appeared)
  let openS = 0;
  let opened = reduced;
  const strike = (t) => (t < 0 ? 0 : t < 0.16 ? (Math.sin(t * 95) > 0.2 ? 0.5 : 0.06) : 0.3 + 0.7 * smooth(t, 0.16, 1.2));
  function opening(dt) {
    if (opened) return null;
    if (frames > 3) openS += Math.min(dt, 1 / 24);
    // ?open=2.4 holds the opening at that second (look-dev, like ?cam)
    const s = q.has('open') ? Number(q.get('open')) : filmP > 0.002 ? 99 : openS;
    if (s >= OPEN.card) el.body.classList.add('is-lit');
    if (s >= OPEN.end) {
      opened = true;
      world.power([1, 1, 1, 1], 1);
      rig.envScale(1);
      return null;
    }
    const heads = OPEN.heads.map((t0) => strike(s - t0));
    world.power(heads, smooth(s, OPEN.rest[0], OPEN.rest[1]));
    // the paint's reflections come up with the lights it reflects: dark until the heads strike
    rig.envScale(Math.max(0.03, 0.75 * (heads[0] + heads[1] + heads[2]) / 3 + 0.25 * smooth(s, OPEN.rest[0], OPEN.rest[1])));
    return { flash: OPEN.flash.some(([a, b]) => s >= a && s < b) ? 1 : 0, word: smooth(s, OPEN.word[0], OPEN.word[1]) };
  }
  if (reduced) el.body.classList.add('is-lit');

  function film(dt, now) {
    const raw = filmRaw();
    filmP = reduced || Math.abs(raw - filmP) > 0.08 ? raw : filmP + (raw - filmP) * (1 - Math.exp(-dt / 0.1));
    const p = filmP;
    let si = SHOTS.findIndex((s) => p < s.p1);
    if (si < 0) si = SHOTS.length - 1;
    const shot = SHOTS[si];
    const t = clamp((p - shot.p0) / (shot.p1 - shot.p0), 0, 1);
    let ci = 0, from = 0;
    for (let i = 0; i < shot.cams.length; i++) {
      const until = shot.cams[i].until ?? 1;
      if (t < until || i === shot.cams.length - 1) { ci = i; break; }
      from = until;
    }
    const cam = shot.cams[ci];
    let u = clamp((t - from) / ((cam.until ?? 1) - from), 0, 1);
    if (cam.move) u = clamp((u - cam.move[0]) / (cam.move[1] - cam.move[0]), 0, 1);
    if (reduced) u = cam.move ? 1 : 0.5;
    const key = `${si}:${ci}`;
    if (key !== shotKey) { if (shotKey) cut(); shotKey = key; }

    // the car stays dark and still until the start
    let state = OFF;
    if (si === START) state = signature(t, now);
    else if (si > START) { keepRunning(); state = RUNNING; }
    else settleDown();
    const open = opening(dt);
    // the opening's flash: headlamps and their beams, for a beat, in the dark
    if (open && open.flash) state = { ...OFF, drl: 1, head: 1 };
    if (rig.spec.id !== 'redspider' && rigs.has('redspider')) { mount('redspider'); }
    rig.set(state);
    setCamera(cam, u, state.shake || 0);

    // the title in the scene, only in the first shot
    if (shot.id === 'wide') {
      if (isPhone()) titleWord.placeAt(-1.8, -7, 1.7, 6.0, new THREE.Vector3(3.2, 0, 10.5), 0.95);
      else titleWord.placeAt(-2.0, -12, 0.2, 11, new THREE.Vector3(-4.0, 0, 9.0), 0.95);
      titleWord.fade(open ? open.word : 1);
    } else titleWord.show(false);

    // the world
    world.hangar.open(shot.id === 'door' ? smooth(t, 0.12, 0.7) : si > 4 ? 1 : 0);
    world.plane.visible = shot.id === 'final';
    let jet = 0, roar = 0, jetPitch = 0;
    if (shot.id === 'final') {
      const pt = smooth(t, 0.04, 1.0);
      const { p: pp } = world.plane.place(pt, camera);
      const d = pp.distanceTo(camera.position);
      jet = clamp(1 - Math.log10(d / 400) / 1.4, 0, 1) * (pt < 0.8 ? 1 : 0.5);
      jetPitch = pt;
      roar = pt > 0.8 ? Math.sin(clamp((pt - 0.8) / 0.2, 0, 1) * Math.PI * 0.9) : 0;
    } else world.plane.place(0, camera);

    // words
    setLine(el.sub, (shot.lines || []).find((l) => t >= l.at[0] && t < l.at[1])?.text || '');
    let capText = '';
    if (!sound.on) {
      const c = (shot.captions || []).find((l) => t >= l.at[0] && t < l.at[1]);
      if (c) capText = c.text === 'engine' ? rig.spec.caption : c.text;
    }
    setLine(el.cap, capText);
    setTitle(1 - smooth(p, 0.004, 0.028));
    const over = shot.id === 'evening' && t > 0.3;
    setBars(isPhone() || over);
    el.body.classList.toggle('is-page', over);
    el.nav.inert = !over;

    const bed = si === START ? 1 - smooth(t, 0, 0.12) : si > START ? 0.25 : 1;
    const door = shot.id === 'door' && t > 0.12 && t < 0.7 ? 1 : 0;
    // the film goes dark at the end, so "Who's waiting for you?" comes up the screen on black
    const out = shot.id === 'evening' ? 1 - smooth(t, 0.42, 0.9) : 1;
    sound.mix({ bed, jet, jetPitch, roar, door, engine: (sig.running ? 1 : 0) * (0.35 + 0.65 * out) });
    return out;
  }

  function writeCard(i) {
    const c = FLEET[i];
    el.carName.textContent = c.name;
    el.carKept.textContent = `Kept in ${c.city}. Delivered anywhere we work.`;
    el.carFact.textContent = c.fact;
    el.carPrice.textContent = `From ${c.rate} a day.`;
    el.choose.textContent = `Choose the ${c.short}`;
    castButtons.forEach((b, k) => b.setAttribute('aria-current', k === i ? 'true' : 'false'));
    // the card changes as the next car turns into frame
    el.card.classList.remove('is-in');
    void el.card.offsetWidth;
    el.card.classList.add('is-in');
  }
  // the cars on the runway (film/Runway.js): into the section, out of it, and each frame in it
  function enterCasting() {
    castOn = true;
    // the cut onto the runway takes the film's last line with it
    for (const node of [el.sub, el.cap]) { node.dataset.text = ''; node.textContent = ''; node.classList.remove('is-on'); }
    castShown = -1;
    runway.enter();
  }
  function leaveCasting() {
    runway.leave();
    castOn = false;
    // the card and the car list go with the runway (V5 left them up when you scrolled back into the film
    // fast from a car, so the list sat under the rising title)
    el.cars.classList.remove('is-down');
    for (const r of rigs.values()) {
      r.root.position.set(0, 0, 0);
      r.root.rotation.y = 0;
      r.lights(true);
      r.setEnv(world.envMap, FILM_ENV);
      if (r !== rig) scene.remove(r.root);
    }
    if (!rig.root.parent) scene.add(rig.root);
  }
  // the section's progress, not clamped: below 0 while it comes up the screen (the runway lights up then)
  const carsRaw = () => { const r = el.cars.getBoundingClientRect(); return -r.top / Math.max(1, r.height - innerHeight); };
  const cars = (dt) => runway.frame(carsRaw(), dt);
  function settled(id, camDef, lp, dimK, engine) {
    if (rigs.has(id) && rig.spec.id !== id) { mount(id); sig.running = false; }
    rig.root.position.set(0, 0, 0);
    rig.root.rotation.y = 0;
    keepRunning();
    rig.set(RUNNING);
    setCamera(camDef, reduced ? 0.5 : lp);
    world.hangar.open(1);
    sound.mix({ bed: engine ? 0.22 : 0.1, engine });
    return dimK;
  }

  // The request (V5): the car comes up the apron out of the dark at the left of the frame, swings in at an
  // angle, straightens and stops on stand 7 where the Red Spider stood, with a dip of the nose as it brakes.
  // On a clock from the moment you reach the request from the running order, so it never stops halfway
  // because the scroll did. (A first try came in from the right, behind the form, and turned its lamps
  // straight into the lens.)
  const PARK = { D: 36, A: 4.2, S: 15, T: 5.2 };
  let parkFrom = -1e9;
  function parkPose(sec) {
    const u = clamp(sec / PARK.T, 0, 1);
    const rem = PARK.D * Math.pow(1 - u, 2); // what's left of the path: fast in, easing to a stop
    // straight up the apron, offset to one side, then an S into the stand over the last S metres
    const r = Math.min(rem, PARK.S);
    const x = PARK.A * (1 - Math.cos((Math.PI * r) / PARK.S)) / 2;
    const slope = rem < PARK.S ? PARK.A * (Math.PI / (2 * PARK.S)) * Math.sin((Math.PI * r) / PARK.S) : 0;
    const yaw = Math.atan2(-slope, 1);
    // the nose dips as it brakes, then rocks back once it's still; it leans out a little in the swing
    const k = sec - PARK.T;
    const pitch = k < 0 ? 0.55 * smooth(u, 0.55, 0.97) : 0.55 * Math.exp(-k * 4.5) * Math.cos(k * 10);
    const roll = -0.9 * Math.sin((Math.PI * r) / PARK.S) * (rem < PARK.S ? 1 : 0) * (1 - u * 0.6);
    return { x, z: -rem, yaw, pitch, roll };
  }
  function request(lp, now) {
    const dimK = settled(requestCar(), PAGE_CAMS.request, lp, isPhone() ? 0.5 : 0.78, 0);
    if (reduced) return dimK;
    const sec = (now - parkFrom) / 1000;
    const p = parkPose(sec);
    rig.root.position.set(p.x, 0, p.z);
    rig.root.rotation.y = p.yaw;
    // lamps low and no beams in the mist while it comes up the apron (their pools on the wet ground flared
    // white at the lens), full once it has stopped and its lamps point past the camera
    rig.set({ ...RUNNING, beam: 0, head: 0.25 + 0.75 * smooth(sec, PARK.T - 0.2, PARK.T + 1.4), pitch: p.pitch, roll: p.roll });
    // heard as it pulls in, then the engine settles and goes quiet under the form, as the brief's plan has it
    sound.mix({ bed: 0.1, engine: 0.8 * (1 - smooth(sec, PARK.T - 0.6, PARK.T + 1.6)) });
    return dimK;
  }
  const orderItems = [...document.querySelectorAll('.order__list li')];
  const orderClockEl = document.querySelector('.order__clock');
  function orderClock() {
    let best = orderItems[0], bd = Infinity;
    for (const li of orderItems) {
      const r = li.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - innerHeight / 2);
      if (d < bd) { bd = d; best = li; }
    }
    const tx = best.querySelector('time').textContent;
    if (orderClockEl.textContent !== tx) orderClockEl.textContent = tx;
  }

  // ------------------------------------------------------------------ nav hides on the way down, returns on the way up

  let lastY = scrollY;
  let navHidden = false;
  function navUpdate() {
    const y = scrollY;
    if (y > lastY + 2 && !navHidden && y > 200) { navHidden = true; gsap.to(el.nav, { yPercent: -110, duration: 0.5, ease: 'settle' }); }
    if (y < lastY - 2 && navHidden) { navHidden = false; gsap.to(el.nav, { yPercent: 0, duration: 0.6, ease: 'settle' }); }
    lastY = y;
  }

  // ------------------------------------------------------------------ the loop

  const clock = new THREE.Clock();
  let started = false;
  let slow = 0, frames = 0;
  function govern(dt) {
    frames++;
    if (frames < 120) return;
    slow = slow * 0.97 + (dt > 0.0195 ? 0.03 : 0);
    const pr = renderer.getPixelRatio();
    if (slow > 0.5 && pr > 1.01) {
      renderer.setPixelRatio(Math.max(1, pr - 0.25));
      renderer.setSize(innerWidth, innerHeight);
      post.resize(innerWidth, innerHeight);
      world.ground.resize(innerWidth, innerHeight, renderer.getPixelRatio());
      slow = 0;
    }
  }
  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    const time = clock.elapsedTime;
    govern(dt);
    const now = performance.now();
    const zNext = zoneNow();
    if (zNext !== zone) {
      if (zNext === 'cars') { enterCasting(); cut(180); }
      // the cars end on black (the Hypercar gone down the runway), so the running order comes up out of it
      else if (zone === 'cars') { leaveCasting(); fadeFrom = now; }
      else cut();
      // the parking plays when you come down to the request from the running order; any other way in, it's parked
      if (zNext === 'request') parkFrom = zone === 'order' ? now : -1e9;
      zone = zNext;
      el.body.dataset.zone = zone;
      if (zone !== 'film') { el.body.classList.remove('is-still'); setBars(true); el.body.classList.add('is-page'); el.nav.inert = false; }
    }
    let dim = 1;
    if (zone === 'film') dim = film(dt, now);
    else {
      world.plane.visible = false;
      world.plane.place(0, camera);
      const moment = confirmed && zone === 'request';
      el.body.classList.toggle('is-confirmed', !!moment);
      setBars(isPhone() || !moment);
      setLine(el.sub, moment ? confirmed : '');
      setLine(el.cap, '');
      if (zone === 'cars') dim = cars(dt);
      // on a phone the text sits right over the car, so the picture steps further back behind it
      else if (zone === 'order') { dim = settled(orderCar(), PAGE_CAMS.order, localOf(el.order), isPhone() ? 0.3 : 0.5, 0.28) * smooth((now - fadeFrom) / 1000, 0.1, 1); orderClock(); }
      // the request: the car parks behind the form (a gradient in the CSS keeps the form readable)
      else dim = request(localOf(el.request), now);
    }
    if (zone !== 'film') titleWord.show(false);
    if (zone !== 'film') setTitle(0);
    navUpdate();

    if (q.get('cam')) {
      // look-dev: a fixed camera from the URL
      camera.position.set(...q.get('cam').split(',').map(Number));
      camera.up.set(0, 1, 0);
      camera.lookAt(...(q.get('look') || '0,0.6,0').split(',').map(Number));
      camera.fov = Number(q.get('fov') || 32);
      camera.updateProjectionMatrix();
      lens = { focus: camera.position.distanceTo(CAR_C), fstop: Number(q.get('n') || 2.8) };
      if (q.get('on')) rig.set(RUNNING);
    }

    if (castOn) for (const r of rigs.values()) r.update(dt, time);
    else rig.update(dt, time);
  world.ground.tick(time);
    // the shadows only change when the car, its body or the hangar door moves
    const rp = rig.root.position;
    // on the runway the shadows are drawn once: the mast's shadow light is aimed at stand 7, far from the
    // runway, and V6 redrew the map (five cars) each time the focus moved to the next car
    const sk = castOn ? `cast:${rigs.size}` : `${rig.spec.id}:${rp.x.toFixed(2)}:${rp.z.toFixed(2)}:${rig.root.rotation.y.toFixed(3)}:${rig.sprung.rotation.z.toFixed(4)}:${rig.sprung.rotation.x.toFixed(4)}:${world.hangarOpen.toFixed(3)}`;
    if (sk !== shadowKey) { shadowKey = sk; renderer.shadowMap.needsUpdate = true; }
    const focalPx = (innerHeight / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const f = 0.012 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const cocK = (f * f) / (lens.fstop * Math.max(0.5, lens.focus - f)) / 0.024 * innerHeight;
    for (const Lt of [world.farLights, world.planeLights]) Lt.setLens({ time, focus: lens.focus, cocK, focalPx, pixelRatio: renderer.getPixelRatio() });

    post.render(time, now < cutUntil ? 0 : dim);
    if (!started) {
      started = true;
      window.__c3FirstFrame = performance.now();
      el.body.classList.remove('is-loading');
      // the scene itself starts dark now (the opening), so the curtain only has to lift
      gsap.to(el.black, { opacity: 0, duration: reduced ? 0.01 : 0.5, ease: 'power2.inOut', delay: 0.05 });
    }
    requestAnimationFrame(frame);
  }
  // ------------------------------------------------------------------ the runway (the cars section)
  let revving = false;
  const runway = makeRunwayWalk({
    scene, camera, renderer, world, rigs, FLEET, CAST, OFF, isPhone, reduced,
    setLens(focus, fstop) { lens = { focus, fstop }; },
    focus(i) {
      if (i === castShown) return;
      castShown = i; castIndex = i; writeCard(i);
      if (rigs.has(FLEET[i].id)) { rig = rigs.get(FLEET[i].id); sig.running = false; }
    },
    engine(k) { keepRunning(); sound.mix({ bed: 0.25, engine: 0.85 * k }); },
    // the Hypercar's launch: 0..1 opens the throttle, null hands the engine back to its idle
    rev(k) {
      if (k == null) { if (revving) { revving = false; sound.rev(null); } return; }
      revving = true;
      sound.rev(rig.spec.engine.idle + k * 5400, 0.35 + 0.65 * k);
    },
    title(k) { const tk = k.toFixed(2); if (tk !== castTitleK) { castTitleK = tk; el.cars.style.setProperty('--title-k', tk); } },
    down(v) { el.cars.classList.toggle('is-down', v); },
  });

  frame();

  // the other cars load quietly once the film is running
  (async () => {
    for (const c of FLEET) { try { await getRig(c.id); } catch (e) { /* the page stays on the car it has */ } }
    // Warm the runway's shaders up while the film plays, so the first look at each car doesn't stall on a
    // compile: set the runway up, ask for the programs, and put everything back before the next frame.
    if (castOn) return;
    runway.enter();
    runway.showWords(true);
    // V7: compile with an offscreen target bound. The page draws the scene into the post effects' buffer, and
    // three builds different shaders for that (no tone mapping, linear colour) than for the screen, so V4 to
    // V6 warmed up the screen variants and the runway still compiled 28 shaders on its first frame (the 300 to
    // 430 ms stall on the way in, measured with the profiler).
    const warmRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    renderer.setRenderTarget(warmRT);
    const done = renderer.compileAsync(scene, camera).catch(() => {});
    renderer.setRenderTarget(null);
    runway.showWords(false);
    // V7: and the textures. Compiling doesn't upload them, so the first look at the runway uploaded four cars'
    // worth at once (a 433 ms frame, measured) and the first close look at the Red Spider three more slow frames.
    // Gather them while the runway is set up, then upload two a frame while the film plays.
    const texs = new Set();
    scene.traverse((o) => {
      if (!o.material) return;
      for (const m of [].concat(o.material)) {
        if (!m) continue;
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'specularIntensityMap', 'envMap']) if (m[k] && m[k].isTexture) texs.add(m[k]);
      }
    });
    leaveCasting();
    await done;
    let i = 0;
    for (const t of texs) {
      if (castOn) break; // already on the runway: let the page upload the rest as it needs them
      try { renderer.initTexture(t); } catch (e) { /* a texture three can't upload ahead (a cube or PMREM target) */ }
      if (++i % 2 === 0) await new Promise((r) => requestAnimationFrame(r));
    }
    window.__c3.warm = true; // the capture tools wait for this
  })();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    post.resize(innerWidth, innerHeight);
    world.ground.resize(innerWidth, innerHeight);
    curveCache.clear();
  });

  // for the capture tools in Teach/c3-v7/tools
  window.__c3 = {
    ready: true,
    world, camera, renderer, sound, rigs, THREE,
    get rig() { return rig; },
    get counts() { return rig.counts; },
    film(p) {
      const y = el.film.offsetTop + p * (el.film.offsetHeight - innerHeight);
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y);
      filmP = p;
    },
    to(sel, frac = 0) {
      const s = document.querySelector(sel);
      const y = s.offsetTop + frac * Math.max(0, s.offsetHeight - innerHeight);
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y);
    },
    loaded: () => FLEET.every((c) => rigs.has(c.id)),
  };
}

boot();
