import '../shared/noLogos.js';
// Concept 1 V7 (from V6, 14 Nov): the showroom with the whole fleet in it, in a soft-lit studio. See briefs/06-c1-v3-enhancement.md.
// One number, bayPos, says where the camera stands along the row. Every camera pose on the page is
// written relative to it, so changing car moves every section's camera at once.
import * as THREE from 'three';
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';
import { FLEET, BAY_SPACING, STEPS, euro, priceFor, availability } from './fleet.js';
import { CarLoader } from './carLoader.js';
import { Showroom } from './showroom.js';
import { createPostFX } from './postfx.js';
import { createSections } from './sections.js';
import { SupercarAudioEngine } from '../audio/SupercarAudioEngine.js';

gsap.registerPlugin(CustomEase);
// A camera on a dolly track: a slow push away, a long glide, a soft landing.
CustomEase.create('dolly', 'M0,0 C0.6,0 0.14,1 1,1');
// Type settles like a heavy door closing, and leaves with a short intake of breath.
CustomEase.create('settle', 'M0,0 C0.12,0.9 0.24,1 1,1');
CustomEase.create('leave', 'M0,0 C0.5,0 0.78,0.3 1,1');

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const $ = (s) => document.querySelector(s);
const N = FLEET.length;
const clamp = THREE.MathUtils.clamp;
const smooth = (u) => u * u * u * (u * (u * 6 - 15) + 10);

const state = {
  active: 0,
  bayPos: 0,
  phone: innerWidth <= 768,
  section: 'showroom',
  sound: false,
  holding: false,
  rev: { level: 0, squat: 0 },
  hoverBay: -1,
  dragging: false,
  travel: 0,
  hushP: 0,
  logActive: 0,
  breathP: 0,
  open: false,
  driveP: 0,
  startP: 0,
};
const holdUntil = new Float32Array(N); // a bay's light waits until this time (the dolly is still travelling)
const flicking = new Uint8Array(N);

// ---------- Renderer ----------
const canvas = $('#gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('#no-gl').hidden = false;
  document.documentElement.classList.add('is-open');
  throw e;
}
const pixelRatio = () => Math.min(devicePixelRatio || 1, state.phone ? 1.5 : 1.75);
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); console.warn('webgl context lost'); });
canvas.addEventListener('webglcontextrestored', () => console.warn('webgl context restored'));
renderer.setPixelRatio(pixelRatio());
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(state.phone ? 50 : 34, innerWidth / innerHeight, 0.1, 140);
const room = new Showroom(renderer, scene);
const post = createPostFX(renderer, scene, camera);
const BASE_BLOOM = 0.22; // C2 V3 runs 0.3 at threshold 2.6
const loader = new CarLoader();
const audio = new SupercarAudioEngine();
const cars = new Array(N).fill(null);

// ---------- Camera poses ----------
// Car space: the car's centre on the floor, nose towards -Z. The row runs along -X, so the hero
// camera stands at the front right of the car and the other bays recede to the right behind it.
// shift moves the picture sideways (a lens shift), as a fraction of the screen width.
const P = (px, py, pz, tx, ty, tz, shift = 0, world = false) => ({ p: new THREE.Vector3(px, py, pz), t: new THREE.Vector3(tx, ty, tz), shift, world });
const ROW_MID = -BAY_SPACING * 2;
function poses(phone) {
  if (phone) {
    return {
      HERO: P(11.6, 2.1, -10.8, -0.6, -1.75, 0.5, -0.08),
      HERO_W: P(11.6, 2.1, -10.8, -0.6, -1.75, 0.5, -0.08),
      OPEN_WIDE: P(13, 8, -14, -5, -1.5, 2),
      A: P(3.5, 0.9, -4.2, 0.65, -0.05, -1.25),
      B: P(3.4, 2.9, 1.3, 0.05, 0.1, -0.3),
      C: P(3.5, 2.6, 5.3, -0.05, -0.35, 0.9),
      REAR: P(3.5, 1.1, 6.0, 0.0, 0.2, 0.1),
      HUSH: P(3.5, 1.2, 6.0, 0.0, 1.7, -0.6),
      BEHIND: P(0, 1.0, 5.8, 0, 0.1, -18),
      ARRIVE: P(0.6, 0.95, -8.6, -0.1, 0.1, 8.0),
      HOW_A: P(3.9, 1.0, -6.6, 0.0, -0.15, -0.2),
      HOW_B: P(1.2, 0.95, -7.6, 0.0, -0.1, 0.0),
      OVER: P(19, 21, 0, ROW_MID - 0.2, -11.4, 1.0, 0.06, true),
      TERMS: P(4.8, 2.6, -5.8, 0.0, -1.5, 0.0),
      LOG_A: P(2.0, 2.1, -12.5, -0.6, -0.6, 0.8, 0, true),
      LOG_B: P(-23.6, 2.1, -12.5, -26.2, -0.6, 0.8, 0, true),
      REQ: P(5.0, 1.8, 7.9, 0.0, -1.15, 0.2),
      FOOT: P(5.8, 3.4, 9.6, 0.0, -0.6, 0.2),
    };
  }
  return {
    HERO: P(5.8, 1.15, -4.95, -1.15, 0.27, 0.38, 0.08),
    HERO_W: P(5.8, 1.15, -4.95, -1.15, 0.27, 0.38, 0.2),
    // where the opening starts: high and wide on the dark row, before it descends onto bay 01
    OPEN_WIDE: P(9, 5.2, -11, -4, 0.2, 1.5),
    A: P(2.05, 0.5, -2.75, 0.86, 0.36, -1.33, 0.35),
    B: P(2.9, 2.7, 1.9, 0.1, 0.4, -0.35, -0.22),
    C: P(2.6, 1.85, 4.15, -0.15, 0.62, 0.85, -0.14),
    REAR: P(2.7, 0.95, 4.7, 0.0, 0.66, 0.1),
    HUSH: P(2.7, 1.05, 4.7, 0.0, 1.95, -0.6),
    BEHIND: P(0, 0.78, 4.4, 0, 1.25, -18),
    ARRIVE: P(0.9, 0.7, -7.0, -0.2, 0.62, 8.0),
    HOW_A: P(4.4, 0.85, -6.6, 0.15, 0.42, -0.3, -0.27),
    HOW_B: P(1.7, 0.75, -7.6, 0.0, 0.42, 0.0, -0.27),
    OVER: P(13, 13.5, -18.5, ROW_MID + 1.6, -4.0, 1.4, 0.1, true),
    TERMS: P(4.3, 1.55, -4.2, -0.2, 0.32, 0.3, 0.25),
    // the logbook: a low long look at the row from in front, sliding from bay 01 to bay 05
    LOG_A: P(3.0, 1.25, -9.4, -1.6, 0.5, 0.8, 0, true),
    LOG_B: P(-22.6, 1.25, -9.4, -27.2, 0.5, 0.8, 0, true),
    REQ: P(3.9, 1.15, 6.6, 0.0, -0.75, 0.4, -0.22),
    FOOT: P(4.4, 1.9, 7.2, 0.0, -1.1, 0.4, -0.2),
  };
}
let POSE = poses(state.phone);

const camNow = { p: new THREE.Vector3(), t: new THREE.Vector3(), shift: 0 };
const camWant = { p: new THREE.Vector3(), t: new THREE.Vector3(), shift: 0 };
const tmpA = { p: new THREE.Vector3(), t: new THREE.Vector3(), shift: 0 };
const tmpB = { p: new THREE.Vector3(), t: new THREE.Vector3(), shift: 0 };

function toWorld(pose, out) {
  out.p.copy(pose.p);
  out.t.copy(pose.t);
  out.shift = pose.shift;
  if (!pose.world) {
    const x = -state.bayPos * BAY_SPACING;
    out.p.x += x;
    out.t.x += x;
  }
  return out;
}

function applyShift(f) {
  // A lens shift: move the frustum sideways without changing the perspective.
  const fw = camera.getFilmWidth();
  camera.filmOffset = -f * camera.aspect * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * fw;
}

// ---------- Layout: where each section sits in the scroll ----------
const SECTIONS = ['s-showroom', 's-walk', 's-hush', 's-start', 's-drive', 's-breath', 's-how', 's-log', 's-fleet', 's-terms', 's-request', 's-footer'];
const L = {};
let keys = [];
function measure() {
  const vh = innerHeight;
  for (const id of SECTIONS) {
    const el = document.getElementById(id);
    const r = el.getBoundingClientRect();
    const top = r.top + scrollNow();
    L[id] = { top, h: r.height, len: Math.max(1, r.height - vh), end: top + r.height };
  }
  L.max = document.documentElement.scrollHeight - vh;
  const hu = L['s-hush'];
  const w = L['s-walk'], d = L['s-drive'], br = L['s-breath'], h = L['s-how'], f = L['s-fleet'], tm = L['s-terms'], q = L['s-request'];
  keys = [
    [0, POSE.HERO],
    [w.top + w.len * 0.02, POSE.HERO_W],
    [w.top + w.len * 0.14, POSE.HERO_W],
    [w.top + w.len * 0.24, POSE.A],
    [w.top + w.len * 0.34, POSE.A],
    [w.top + w.len * 0.45, POSE.B],
    [w.top + w.len * 0.62, POSE.B],
    [w.top + w.len * 0.74, POSE.C],
    [w.top + w.len * 0.88, POSE.C],
    [w.top + w.len, POSE.REAR],
    [hu.top - vh * 0.25, POSE.HUSH],
    [hu.top + vh * 0.1, POSE.HUSH],
    [L['s-start'].top, POSE.REAR],
    [d.top, POSE.REAR],
    [d.top + d.len * 0.18, POSE.BEHIND],
    [d.top + d.len, POSE.BEHIND],
    [d.top + d.len + 1, POSE.ARRIVE],
    [br.top + br.len * 0.86, POSE.ARRIVE],
    [h.top + h.len * 0.04, POSE.HOW_A],
    [h.top + h.len, POSE.HOW_B],
    [L['s-log'].top + vh * 0.05, POSE.LOG_A],
    [L['s-log'].top + L['s-log'].len, POSE.LOG_B],
    [f.top + f.len * 0.36, POSE.OVER],
    [f.top + f.len, POSE.OVER],
    [tm.top + vh * 0.2, POSE.TERMS],
    [tm.end - vh * 0.9, POSE.TERMS],
    [q.top + vh * 0.15, POSE.REQ],
    [L['s-footer'].top - vh * 0.2, POSE.REQ],
    [L.max + 1, POSE.REQ],
  ];
}

function cameraAt(y, out) {
  let i = 0;
  while (i < keys.length - 2 && y > keys[i + 1][0]) i++;
  const [ya, pa] = keys[i];
  const [yb, pb] = keys[i + 1];
  const u = smooth(clamp((y - ya) / Math.max(1, yb - ya), 0, 1));
  toWorld(pa, tmpA);
  toWorld(pb, tmpB);
  out.p.lerpVectors(tmpA.p, tmpB.p, u);
  out.t.lerpVectors(tmpA.t, tmpB.t, u);
  out.shift = THREE.MathUtils.lerp(tmpA.shift, tmpB.shift, u);
  return out;
}

const progress = (id, y) => clamp((y - L[id].top) / L[id].len, 0, 1);

function sectionAt(y) {
  const vh = innerHeight;
  if (y < L['s-walk'].top) return 'showroom';
  if (y < L['s-hush'].top - vh * 0.5) return 'walk';
  if (y < L['s-start'].top) return 'hush';
  if (y < L['s-drive'].top) return 'start';
  if (y < L['s-drive'].end - vh + 1) return 'drive';
  if (y < L['s-how'].top) return 'breath';
  if (y < L['s-log'].top - vh * 0.3) return 'how';
  if (y < L['s-fleet'].top) return 'log';
  if (y < L['s-fleet'].end - vh * 0.55) return 'fleet';
  if (y < L['s-request'].top - vh * 0.3) return 'terms';
  return 'request';
}

// ---------- Smooth scroll ----------
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.08, wheelMultiplier: 0.9, smoothWheel: true });
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
function scrollNow() {
  return lenis ? lenis.scroll : window.scrollY;
}
function scrollTo(target, duration = 1.6) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (lenis) lenis.scrollTo(el ?? target, { duration, easing: (t) => 1 - Math.pow(1 - t, 4) });
  else if (el && el.scrollIntoView) el.scrollIntoView();
  else window.scrollTo(0, target);
}

// ---------- Type helpers ----------
function chars(el, text) {
  el.textContent = '';
  for (const c of text) {
    const s = document.createElement('span');
    s.className = 'char';
    s.textContent = c;
    el.appendChild(s);
  }
  return el.querySelectorAll('.char');
}

// Fit a display block so its widest line is maxW wide at most, and never above maxPx.
const meter = document.createElement('span');
meter.className = 'display';
Object.assign(meter.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap', fontSize: '100px', left: '-10000px', top: '0' });
document.body.appendChild(meter);
function fitSize(lines, maxW, maxPx) {
  let widest = 0;
  for (const t of lines) {
    meter.textContent = t;
    widest = Math.max(widest, meter.getBoundingClientRect().width);
  }
  return Math.min(maxPx, (100 * maxW) / Math.max(1, widest));
}

const nameEl = $('#hero-name');
const makeEl = $('#name-make');
const modelEl = $('#name-model');
// Every name is set at the same size. A long name narrows the type (Archivo's width axis, 125 down to
// 72) before it ever gets smaller, so the block, the counter and the line above it stay put.
function nameFit(car) {
  const vw = innerWidth;
  const maxW = state.phone ? vw - 40 : vw * 0.62;
  const size = state.phone ? vw * 0.118 : Math.min(vw * 0.074, 118);
  meter.style.fontStretch = '125%';
  const at125 = fitSize([car.make, car.model], maxW, 1e6);
  if (at125 >= size) return { size, stretch: 125 };
  const stretch = Math.max(state.phone ? 76 : 84, 125 * (at125 / size));
  meter.style.fontStretch = stretch + '%';
  const fitted = fitSize([car.make, car.model], maxW, size);
  meter.style.fontStretch = '125%';
  return { size: fitted, stretch };
}
function setNameFit(car) {
  const f = nameFit(car);
  nameEl.style.fontSize = f.size + 'px';
  nameEl.style.fontStretch = f.stretch + '%';
}

// ---------- Rail and rate card ----------
const railList = $('#rail-list');
// The fleet by name only: the make small, the model as the cars are known.
railList.innerHTML = FLEET.map((c, i) => `<li><button type="button" class="rail-item" data-i="${i}" aria-current="${i === 0}" aria-label="${c.fullName}, from ${euro(c.rates.day)} a day"><span class="rail-make">${c.make}</span><span class="rail-model">${c.railShort}<span class="long">${c.railModel.slice(c.railShort.length)}</span></span><span class="rail-price">${euro(c.rates.day)} a day</span></button></li>`).join('');
const railItems = [...railList.querySelectorAll('.rail-item')];
const railBar = $('#rail-bar');
function placeRailBar(i, duration = 0) {
  const item = railItems[i].querySelector('.rail-model');
  const rail = $('.rail').getBoundingClientRect();
  const r = item.getBoundingClientRect();
  gsap.to(railBar, { x: r.left - rail.left, width: r.width, duration, ease: 'dolly', overwrite: true });
}

const rateRows = $('#rate-rows');
rateRows.innerHTML = FLEET.map((c, i) => `<tr data-i="${i}">
  <td class="c-car"><div class="rate-car"><span class="rate-num">${c.num}</span><span class="rate-name">${c.fullName}</span></div></td>
  <td class="c-city">${c.city}</td>
  <td class="c-num">${euro(c.rates.day)}</td>
  <td class="c-num">${euro(c.rates.three)}</td>
  <td class="c-num">${euro(c.rates.week)}</td>
  <td class="c-num">${c.rates.month ? euro(c.rates.month) : 'On request'}</td>
  <td class="c-num">${euro(c.rates.deposit)}</td>
  <td class="c-num">${c.rates.km}</td>
  <td class="c-sum">${euro(c.rates.day)} a day, ${euro(c.rates.week)} a week. Deposit ${euro(c.rates.deposit)}. ${availability(c)}.</td>
  <td class="c-act"><button type="button" class="link rate-choose" data-i="${i}"><span>Choose</span></button></td>
</tr>`).join('');

const logTrack = $('#log-track');
logTrack.innerHTML = FLEET.map((c, i) => `<li class="log-entry${i === 0 ? ' is-on' : ''}" data-i="${i}">
  <p class="log-date"><span>${c.log.date}</span><span class="log-car">${c.fullName}</span></p>
  <p class="statement log-route">${c.log.route}</p>
  <p class="body log-note">${c.log.note}</p>
</li>`).join('');
const logEntries = [...logTrack.children];

$('#how-list').innerHTML = STEPS.map((s) => `<li>${s.headline} ${s.body}</li>`).join('');

// ---------- The form ----------
const fCar = $('#f-car');
const fCity = $('#f-city');
const fFrom = $('#f-from');
const fTo = $('#f-to');
const fName = $('#f-name');
const fContact = $('#f-contact');
fCar.innerHTML = FLEET.map((c, i) => `<option value="${i}">${c.fullName}</option>`).join('');
const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date();
fFrom.value = iso(new Date(today.getTime() + 8 * 864e5));
fTo.value = iso(new Date(today.getTime() + 11 * 864e5));
fFrom.min = iso(today);
fTo.min = iso(today);
// Dates are written out in words over the native picker, which still opens on a click or a key.
const dateWords = (v) => (v ? new Date(v + 'T12:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' }) : '');
[fFrom, fTo].forEach((input) => {
  const show = document.createElement('span');
  show.className = 'date-show';
  show.setAttribute('aria-hidden', 'true');
  input.after(show);
  const sync = () => (show.textContent = dateWords(input.value));
  input.addEventListener('change', sync);
  input.addEventListener('input', sync);
  input.addEventListener('click', () => { try { input.showPicker(); } catch {} });
  sync();
});
const WORDS = ['No days', 'One day', 'Two days', 'Three days', 'Four days', 'Five days', 'Six days', 'A week', 'Eight days', 'Nine days', 'Ten days', 'Eleven days', 'Twelve days', 'Thirteen days', 'Two weeks'];
function days() {
  const d = Math.round((new Date(fTo.value) - new Date(fFrom.value)) / 864e5);
  return Number.isFinite(d) ? d : 0;
}
function updateQuote() {
  const car = FLEET[+fCar.value];
  const n = days();
  $('#btn-label').textContent = `Request the ${car.make}`;
  if (n < 1) {
    $('#quote').textContent = 'Choose a return date after the pick-up date and the price appears here.';
    return;
  }
  const label = n < WORDS.length ? WORDS[n] : `${n} days`;
  $('#quote').innerHTML = `${label} in ${fCity.value} comes to <strong>${euro(priceFor(car, n))}</strong>, with delivery, insurance and ${(car.rates.km * n).toLocaleString('en-GB')} km. A ${euro(car.rates.deposit)} deposit is held on your card, not charged.`;
}

// ---------- Copy for the current car ----------
const nb = (t) => t.replace(/ /g, '\u00a0');
const heroLine = (car) => `Kept in ${car.city}, brought to your door. From ${nb(euro(car.rates.day) + ' a day.')}`;
const heroSpec = (car) => `${car.year} · ${car.spec} · ${car.trim}`;
function setHeroFacts(car) {
  $('#hero-line').textContent = heroLine(car);
  $('#hero-spec').textContent = heroSpec(car);
  $('#hero-avail-text').textContent = availability(car);
  $('#hero-avail').classList.toggle('is-out', car.availInDays > 2);
}
let nearShown = 0;
const counterNow = $('#counter-now');
function rollCounter(num, dir) {
  counterNow.textContent = num;
  if (reduced) return;
  // Each bay you pass rolls the number in from the side you are travelling to. Never blank.
  gsap.fromTo(counterNow, { yPercent: 90 * dir, opacity: 0.35 }, { yPercent: 0, opacity: 1, duration: 0.42, ease: 'settle', overwrite: true });
}
function setCopy(car, { hero = true } = {}) {
  document.documentElement.style.setProperty('--paint', car.paintCss);
  if (hero) {
    makeEl.textContent = car.make;
    modelEl.textContent = car.model;
    setNameFit(car);
    setHeroFacts(car);
    counterNow.textContent = car.num;
    nearShown = FLEET.indexOf(car);
    railItems.forEach((b, i) => b.classList.toggle('is-near', i === nearShown));
  }
  $('#walk-line').textContent = car.line;
  $('#walk-dl').innerHTML = [['Year', car.year], ['Kilometres', car.km], ['Last service', car.service.replace('Serviced in ', '')], ['Trim', car.trim], ['Availability', availability(car)]]
    .map(([k, v]) => `<div class="fact"><dt><span class="line"><span class="line-in">${k}</span></span></dt><dd><span class="line"><span class="line-in">${v}</span></span></dd></div>`).join('');
  $('#terms-age').textContent = `${car.minAge} or over, with ${car.licenceYears === 3 ? 'three' : 'five'} years on your licence${car.minAge > 25 ? ` for the ${car.make}` : ''}.`;
  $('#terms-car').textContent = `With the ${car.make}: ${car.rates.km} km a day, then ${euro(car.rates.extraKm)} a kilometre, and a ${euro(car.rates.deposit)} deposit held on your card.`;
  $('#drive-line').textContent = car.driveLine.replace(/(Col de Turini|Furka Pass|Stelvio|Jebel Jais|Key West)/, (m) => nb(m));
  car.notes.forEach((n, k) => {
    const note = document.getElementById(`note-${k}`);
    note.querySelector('.note-head .line-in').textContent = n.headline;
    note.querySelector('.note-body .line-in').textContent = n.body;
  });
  fCar.value = String(FLEET.indexOf(car));
  fCity.value = car.city;
  updateQuote();
  railItems.forEach((b, i) => b.setAttribute('aria-current', String(i === state.active)));
  if (railItems.includes(document.activeElement) && document.activeElement !== railItems[state.active]) railItems[state.active].focus({ preventScroll: true });
  rateRows.querySelectorAll('tr').forEach((tr, i) => {
    tr.classList.toggle('is-current', i === state.active);
    tr.querySelector('.rate-choose span').textContent = i === state.active ? 'Chosen' : 'Choose';
  });
}

// ---------- Changing car ----------
let dolly = null;
let heroSwap = null;
function goTo(i, { from = 'rail' } = {}) {
  i = clamp(i, 0, N - 1);
  const prev = state.active;
  if (i === prev && from !== 'drag-release') return;
  const dir = Math.sign(i - prev) || 1;
  const dist = Math.abs(i - state.bayPos);
  const duration = reduced ? 0 : 1.45 + 0.4 * Math.max(0, dist - 1);
  state.active = i;
  const car = FLEET[i];
  ensureLoaded(i);
  audio.setAudioProfile(car.audioProfile);

  // The light of the next bay waits for the camera: it comes on at 62% of the move.
  holdUntil[i] = performance.now() / 1000 + duration * 0.62;
  placeRailBar(i, reduced ? 0 : duration);
  gsap.to(document.documentElement, { '--paint': car.paintCss, duration: reduced ? 0 : duration, ease: 'dolly' });

  const heroVisible = scrollNow() < innerHeight * 0.6;
  if (!heroVisible || reduced) {
    setCopy(car);
  } else {
    swapHeroCopy(car, dir, duration);
    setCopy(car, { hero: false });
  }

  if (reduced) {
    gsap.timeline()
      .to(canvas, { opacity: 0, duration: 0.25, ease: 'power2.in' })
      .add(() => { state.bayPos = i; holdUntil[i] = 0; })
      .to(canvas, { opacity: 1, duration: 0.35, ease: 'power2.out' }, '+=0.05');
    return;
  }
  if (dolly) dolly.kill();
  // While it travels, the camera lifts and pulls back a little, so the cars in between pass in parallax
  // instead of the old car's nose filling the frame.
  const lift = { t: 0 };
  dolly = gsap.timeline({ onComplete: () => (dolly = null) })
    .to(state, { bayPos: i, duration, ease: 'dolly' }, 0)
    .to(lift, { t: 1, duration, ease: 'none', onUpdate: () => (state.travel = Math.sin(Math.PI * lift.t) * Math.min(1, 0.6 + 0.2 * dist)) }, 0);
}

// The old name leaves with the car it belongs to. The new one comes in when the camera is within
// half a bay of the new car, so the words on screen never name a car that is not there.
let pendingIn = null;
function swapHeroCopy(car, dir, duration) {
  if (heroSwap) heroSwap.progress(1).kill();
  if (pendingIn) pendingIn = null;
  const outChars = [...makeEl.querySelectorAll('.char'), ...modelEl.querySelectorAll('.char')];
  const oldMake = outChars.length ? null : chars(makeEl, makeEl.textContent);
  const oldModel = outChars.length ? null : chars(modelEl, modelEl.textContent);
  const leaving = outChars.length ? outChars : [...oldMake, ...oldModel];
  const tl = gsap.timeline();
  heroSwap = tl;
  tl.to(leaving, { xPercent: -60 * dir, opacity: 0, duration: 0.42, ease: 'leave', stagger: 0.012 * dir > 0 ? 0.012 : { each: 0.012, from: 'end' } }, 0);
  tl.to(['#hero-spec', '#hero-line', '#hero-avail', '#hero-request'], { opacity: 0, yPercent: -40, duration: 0.35, ease: 'leave', stagger: 0.03 }, 0);
  const enter = () => {
    setNameFit(car);
    const a = chars(makeEl, car.make);
    const b = chars(modelEl, car.model);
    gsap.fromTo([...a, ...b], { xPercent: 70 * dir, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.95, ease: 'settle', stagger: dir > 0 ? 0.018 : { each: 0.018, from: 'end' } });
    setHeroFacts(car);
    gsap.fromTo(['#hero-spec', '#hero-line', '#hero-avail', '#hero-request'], { opacity: 0, yPercent: 40 }, { opacity: 1, yPercent: 0, duration: 0.8, ease: 'settle', stagger: 0.05 });
  };
  tl.add(() => { pendingIn = { enter, target: FLEET.indexOf(car) }; }, 0.42);
}

// ---------- Loading ----------
async function ensureLoaded(i) {
  if (cars[i]) return cars[i];
  const car = await loader.load(FLEET[i]);
  if (cars[i]) return cars[i];
  car.root.position.set(room.bayX(i), 0, 0);
  // three.js ignores a material's envMapIntensity when the light comes from scene.environment
  // (it uses scene.environmentIntensity for every material). Each car carries the map itself,
  // so its bay can dim it.
  for (const m of car.materials) {
    if (m.isMeshStandardMaterial && !m.envMap) {
      m.envMap = scene.environment;
      m.needsUpdate = true;
    }
  }
  car.setLevel(0);
  car.setLights(0.25, 0.1);
  // Compile before the car joins the scene, so it never stalls a frame mid-move.
  try { await renderer.compileAsync(car.root, camera, scene); } catch {}
  scene.add(car.root);
  cars[i] = car;
  return car;
}
async function loadRest() {
  const order = [...Array(N).keys()].filter((i) => i !== state.active).sort((a, b) => Math.abs(a - state.active) - Math.abs(b - state.active));
  for (const i of order) {
    try { await ensureLoaded(i); } catch (e) { console.warn('car failed to load', FLEET[i].id, e); }
  }
}

// ---------- Light ----------
// Two dips inside 120 ms, then on: a studio tube starting. Three tubes, 110 ms apart.
function flicker(bay, to = 1) {
  flicking[bay] = 1;
  const t = room.tubes[bay];
  const tl = gsap.timeline({ onComplete: () => (flicking[bay] = 0) });
  for (let n = 0; n < 3; n++) {
    const at = n * 0.11;
    const o = { v: t[n] };
    const set = () => (t[n] = o.v);
    tl.to(o, { v: 0.85 * to, duration: 0.025, ease: 'none', onUpdate: set }, at)
      .to(o, { v: 0.15 * to, duration: 0.025, ease: 'none', onUpdate: set }, at + 0.025)
      .to(o, { v: 0.92 * to, duration: 0.025, ease: 'none', onUpdate: set }, at + 0.05)
      .to(o, { v: 0.28 * to, duration: 0.02, ease: 'none', onUpdate: set }, at + 0.075)
      .to(o, { v: to, duration: 0.05, ease: 'power1.out', onUpdate: set }, at + 0.095);
  }
  return tl;
}

function lightTargets(sec) {
  const out = new Array(N).fill(0);
  const a = state.active;
  for (let i = 0; i < N; i++) {
    // During the opening the other bays stay dark until their turn in the sequence.
    if (!state.open && i !== a) continue;
    // A bay whose car is still on its way keeps its tubes on in the hero, so the row never flickers back.
    if (!cars[i] && sec !== 'showroom') continue;
    if (sec === 'showroom' || sec === 'walk' || sec === 'how' || sec === 'terms' || sec === 'request') {
      // The bays you pass on the way glow a little, like a showroom lighting the aisle as you walk it.
      const pass = dolly || state.dragging ? 0.26 * Math.max(0, 1 - Math.abs(state.bayPos - i) / 0.9) : 0;
      // close-ups in the walk-around: the neighbours go almost dark, so no lone wheel hangs in the black
      const rest = sec === 'walk' ? 0.06 : 0.3;
      out[i] = i === a ? 1 : i === state.hoverBay ? 0.5 : rest + pass;
    } else if (sec === 'hush') {
      // Lights down: a breath before the engine starts.
      out[i] = i === a ? THREE.MathUtils.lerp(1, 0.04, state.hushP) : 0;
    } else if (sec === 'start') {
      out[i] = i === a ? 0.32 : 0;
    } else if (sec === 'drive') {
      out[i] = i === a ? 0.18 : 0;
    } else if (sec === 'breath') {
      // The room is dark while the car comes back. Its bay switches on as it arrives.
      out[i] = i === a ? (state.breathP > 0.84 ? 1 : 0.2) : 0;
    } else if (sec === 'log') {
      out[i] = i === state.logActive ? 1 : 0.16;
    } else if (sec === 'fleet') {
      if (state.hoverBay >= 0) out[i] = i === state.hoverBay ? 1 : 0.28;
      else out[i] = i === a ? 1 : 0.78;
    }
  }
  return out;
}

function updateLights(dt, sec) {
  const now = performance.now() / 1000;
  const want = lightTargets(sec);
  for (let i = 0; i < N; i++) {
    if (flicking[i]) continue;
    const t = room.tubes[i];
    const lvl = room.level(i);
    let w = want[i];
    if (now < holdUntil[i]) w = Math.min(w, lvl);
    if (state.open && lvl < 0.15 && w >= 0.45 && cars[i]) {
      flicker(i, w);
      continue;
    }
    const k = 1 - Math.exp(-dt * (w < lvl ? 2.4 : 3));
    for (let n = 0; n < 3; n++) t[n] += (w - t[n]) * k;
  }
  room.dim = 1;
  // The car leaves through, and comes back from, beyond the back wall: no room in those two beats.
  room.wall.visible = room.ceiling.visible = !(sec === 'drive' || sec === 'breath');
  room.update();
  // The current car always takes its own bay's light (and the tunnel's) in full. The others only take
  // direct light in proportion to their own bay, so the next bay's tubes never light them.
  for (let i = 0; i < N; i++) {
    if (!cars[i]) continue;
    const l = room.level(i);
    cars[i].setLevel(l, i === state.active ? 1 : l * l);
  }
}

// ---------- Opening ----------
const sweep = { t: 0, on: false };
// The camera's descent during the opening: 0 high and wide on the row, 1 at the hero.
const openCam = { t: reduced ? 1 : 0, on: !reduced };
const opening = $('#opening');
const openMark = $('#opening-mark');
gsap.to(openMark, { opacity: 1, duration: reduced ? 0 : 0.8, ease: 'settle' });
const slow = setTimeout(() => $('#opening-slow').classList.add('is-on'), 4000);

async function open() {
  // The next bay loads alongside the first car, so the row is there in the first frame.
  const second = ensureLoaded(1).catch(() => {});
  await Promise.all([ensureLoaded(0), document.fonts.ready]);
  await Promise.race([second, new Promise((r) => setTimeout(r, 1200))]);
  clearTimeout(slow);
  room.drawMarkings();
  fitStatics();
  setCopy(FLEET[0]);
  placeRailBar(0);
  measure();
  cameraAt(0, camNow);
  const nav = $('#nav-mark').getBoundingClientRect();
  const mark = openMark.getBoundingClientRect();
  const heroIn = [makeEl, modelEl, '#hero-spec', '#hero-line', '#hero-avail', '#hero-request', '.counter'];
  // A reload halfway down the page (the browser restores the scroll) skips the opening.
  if (reduced || scrollNow() > innerHeight * 0.5) {
    openCam.on = false;
    openCam.t = 1;
    room.tubes[0] = [1, 1, 1];
    opening.remove();
    document.documentElement.classList.add('is-open');
    state.open = true;
    window.__c1v4.ready = true;
    loadRest();
    return;
  }
  gsap.set(heroIn, { yPercent: 105, opacity: 0 });
  gsap.set('.rail', { opacity: 0, y: 12 });
  const tl = gsap.timeline({
    onComplete: () => {
      document.documentElement.classList.add('is-open');
      openMark.textContent = '';
      opening.style.display = 'none';
      requestAnimationFrame(() => opening.remove());
      state.open = true;
      window.__c1v4.ready = true;
      loadRest();
    },
  });
  tl.add(() => (window.__c1v4.firstLight = Math.round(performance.now())), 0.05);
  tl.add(flicker(0, 1), 0.05);
  tl.to(openCam, { t: 1, duration: 2.7, ease: 'dolly', onComplete: () => (openCam.on = false) }, 0.2);
  // Then a bar of light runs over the paint, nose to tail, as if the overhead tube had just been
  // carried along the car. And the row wakes up behind it, one bay after another.
  tl.to(sweep, { t: 1, duration: 1.7, ease: 'power2.inOut', onStart: () => (sweep.on = true), onComplete: () => (sweep.on = false) }, 0.3);
  [1, 2, 3, 4].forEach((b, k) => tl.add(flicker(b, 0.22), 1.0 + k * 0.32));
  tl.to(opening, { backgroundColor: 'rgba(10,10,9,0)', duration: 0.55, ease: 'power2.out' }, 0.3);
  tl.to(openMark, { x: nav.left - mark.left, y: nav.top - mark.top, duration: 0.9, ease: 'power3.inOut' }, 0.5);
  tl.to(heroIn, { yPercent: 0, opacity: 1, duration: 1.1, ease: 'settle', stagger: 0.06 }, 1.85);
  tl.to('.rail', { opacity: 1, y: 0, duration: 1.1, ease: 'settle' }, 2.15);
  tl.from(railItems, { opacity: 0, x: 18, duration: 0.9, ease: 'settle', stagger: 0.05 }, 2.2);
}

// ---------- Interaction: rail, keys, drag, swipe ----------
railItems.forEach((b, i) => {
  b.addEventListener('click', () => goTo(i));
  b.addEventListener('pointerenter', () => { if (i !== state.active) state.hoverBay = i; });
  b.addEventListener('pointerleave', () => (state.hoverBay = -1));
  b.addEventListener('focus', () => { if (i !== state.active) state.hoverBay = i; });
  b.addEventListener('blur', () => (state.hoverBay = -1));
});

addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName || '';
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
  if (scrollNow() < innerHeight * 0.6 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    e.preventDefault();
    goTo(state.active + (e.key === 'ArrowRight' ? 1 : -1), { from: 'key' });
  }
});

const hero = $('.hero');
let drag = null;
hero.addEventListener('pointerdown', (e) => {
  if (e.target.closest('a, button') || e.button > 0) return;
  if (dolly) dolly.kill();
  drag = { x: e.clientX, y: e.clientY, bay: state.bayPos, id: e.pointerId, moved: false, axis: null };
});
addEventListener('pointermove', (e) => {
  moveCursor(e);
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (!drag.axis && Math.hypot(dx, dy) > 8) drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  if (drag.axis !== 'x') return;
  if (!drag.moved) {
    drag.moved = true;
    state.dragging = true;
    $('#cursor').classList.add('is-dragging');
    try { hero.setPointerCapture(e.pointerId); } catch {}
  }
  const perBay = state.phone ? innerWidth * 0.62 : 420;
  let b = drag.bay - dx / perBay;
  if (b < 0) b *= 0.3;
  if (b > N - 1) b = N - 1 + (b - (N - 1)) * 0.3;
  state.bayPos = b;
  const near = clamp(Math.round(b), 0, N - 1);
  if (near !== state.active) {
    const dir = Math.sign(near - state.active);
    state.active = near;
    const car = FLEET[near];
    ensureLoaded(near);
    audio.setAudioProfile(car.audioProfile);
    holdUntil[near] = 0;
    placeRailBar(near, 0.6);
    gsap.to(document.documentElement, { '--paint': car.paintCss, duration: 0.6 });
    swapHeroCopy(car, dir, 0.5);
    setCopy(car, { hero: false });
  }
});
function endDrag(e) {
  if (!drag || (e && e.pointerId !== drag.id)) return;
  const moved = drag.moved;
  drag = null;
  state.dragging = false;
  $('#cursor').classList.remove('is-dragging');
  if (moved) {
    const d = Math.abs(state.active - state.bayPos);
    if (dolly) dolly.kill();
    dolly = gsap.to(state, { bayPos: state.active, duration: 0.55 + 0.6 * d, ease: 'power3.out', onComplete: () => (dolly = null) });
  }
}
addEventListener('pointerup', endDrag);
addEventListener('pointercancel', endDrag);

// The cursor: a word and two ticks that follow the pointer over the stage.
const cursor = $('#cursor');
const cursorLabel = cursor.querySelector('.cursor-label');
const cur = { x: -100, y: -100, tx: -100, ty: -100 };
document.documentElement.addEventListener('pointerleave', () => {
  cursor.classList.remove('is-on');
  document.body.classList.remove('cursor-drag', 'cursor-hold');
});
function moveCursor(e) {
  if (!finePointer || e.pointerType === 'touch') return;
  cur.tx = Math.min(e.clientX, innerWidth - 90);
  cur.ty = Math.max(16, e.clientY);
  const overUi = e.target.closest && e.target.closest('a, button, input, select, label, .hero-copy, .rail, .start-copy');
  const inHero = !overUi && e.target.closest && e.target.closest('.hero');
  const inHold = !overUi && e.target.closest && e.target.closest('#hold-zone');
  const mode = inHero ? 'Drag' : inHold ? 'Hold' : '';
  cursor.classList.toggle('is-on', !!mode);
  cursor.classList.toggle('is-hold', mode === 'Hold');
  document.body.classList.toggle('cursor-drag', mode === 'Drag');
  document.body.classList.toggle('cursor-hold', mode === 'Hold');
  if (mode) cursorLabel.textContent = mode;
}

// ---------- Rate card ----------
rateRows.querySelectorAll('tr').forEach((tr) => {
  const i = +tr.dataset.i;
  tr.addEventListener('pointerenter', () => (state.hoverBay = i));
  tr.addEventListener('pointerleave', () => (state.hoverBay = -1));
});
rateRows.addEventListener('click', (e) => {
  const b = e.target.closest('.rate-choose');
  if (b) goTo(+b.dataset.i, { from: 'rates' });
});

// ---------- Hold to rev ----------
const holdZone = $('#hold-zone');
function unlockSound() {
  if (!state.sound) {
    state.sound = true;
    audio.ensureUnlocked();
    audio.setAudioProfile(FLEET[state.active].audioProfile);
    $('#hush-sound').classList.add('is-on');
  }
}
function holdStart() {
  if (state.section !== 'start' || state.holding) return;
  state.holding = true;
  gsap.killTweensOf(state.rev);
  gsap.to(state.rev, { level: 1, squat: 1, duration: 0.85, ease: 'power2.out' });
}
// Lifting off at high revs: a pop from the exhaust, an orange flash on the floor behind the car.
const crack = { v: 0 };
function crackle() {
  if (reduced) return;
  gsap.timeline()
    .to(crack, { v: 1, duration: 0.05, ease: 'none' })
    .to(crack, { v: 0.15, duration: 0.16, ease: 'leave' })
    .to(crack, { v: 0.7, duration: 0.04, ease: 'none' }, '+=0.09')
    .to(crack, { v: 0, duration: 0.4, ease: 'settle' });
}
function holdEnd() {
  if (!state.holding) return;
  if (state.rev.level > 0.45) {
    crackle();
    if (state.sound) audio.triggerExhaustBurble(0.9);
  }
  state.holding = false;
  gsap.killTweensOf(state.rev);
  gsap.to(state.rev, { level: 0, duration: 0.7, ease: 'power2.out' });
  gsap.to(state.rev, { squat: 0, duration: 0.6, ease: 'elastic.out(1, 0.5)' });
}
$('#hush-sound').addEventListener('click', () => unlockSound());
const startPrompt = $('#start-prompt');
holdZone.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, a')) return;
  unlockSound();
  holdStart();
});
addEventListener('pointerup', holdEnd);
addEventListener('pointercancel', holdEnd);
addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || state.section !== 'start') return;
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement?.tagName || '')) return;
  e.preventDefault();
  unlockSound();
  holdStart();
});
addEventListener('keyup', (e) => { if (e.code === 'Space') holdEnd(); });

// ---------- Section text ----------
function lineIn(els, delay = 0) {
  if (reduced) return gsap.set(els, { yPercent: 0, opacity: 1 });
  return gsap.fromTo(els, { yPercent: 105, opacity: 1 }, { yPercent: 0, duration: 1.1, ease: 'settle', stagger: 0.06, delay, overwrite: true });
}
function lineOut(els) {
  if (reduced) return gsap.set(els, { yPercent: 105 });
  return gsap.to(els, { yPercent: -105, duration: 0.45, ease: 'leave', stagger: 0.03, overwrite: true });
}
const walkBlocks = [
  { el: $('#walk-intro'), from: 0.0, to: 0.135 },
  { el: $('#note-0'), from: 0.24, to: 0.35 },
  { el: $('#note-1'), from: 0.46, to: 0.62 },
  { el: $('#note-2'), from: 0.76, to: 0.88 },
];
walkBlocks.forEach((b) => { b.on = false; gsap.set(b.el.querySelectorAll('.line-in'), { yPercent: 105 }); });
function updateWalk(p, inWalk) {
  for (const b of walkBlocks) {
    const on = inWalk && p >= b.from && p <= b.to;
    if (on === b.on) continue;
    b.on = on;
    const lines = b.el.querySelectorAll('.line-in');
    const label = b.el.querySelector('.note-label');
    b.el.classList.toggle('is-on', on);
    if (on) {
      lineIn(lines);
      if (label) gsap.to(label, { opacity: 1, duration: 0.8, ease: 'settle' });
    } else {
      lineOut(lines);
      if (label) gsap.to(label, { opacity: 0, duration: 0.3 });
    }
  }
}

const breathLines = [...document.querySelectorAll('#breath-text .line-in')];
gsap.set(breathLines, { yPercent: 105 });
const breathOn = [false, false];
function updateBreath(p, inBreath) {
  [0.1, 0.26].forEach((at, k) => {
    const on = inBreath && p > at && p < 0.86;
    if (on === breathOn[k]) return;
    breathOn[k] = on;
    (on ? lineIn : lineOut)(breathLines[k]);
  });
}

let howStep = 0;
const howHead = $('#how-head .line-in');
const howBody = $('#how-body .line-in');
const howDots = [...document.querySelectorAll('#how-dots li')];
howDots[0].classList.add('is-on');
function updateHow(p) {
  const s = clamp(Math.floor(p * 5), 0, 4);
  if (s === howStep) return;
  const dir = Math.sign(s - howStep);
  howStep = s;
  howDots.forEach((d, i) => d.classList.toggle('is-on', i <= s));
  gsap.to('#how-num-roll', { yPercent: (-100 * s) / 5, duration: reduced ? 0 : 1.0, ease: 'expo.inOut', overwrite: true });
  const swap = () => {
    howHead.textContent = STEPS[s].headline;
    howBody.textContent = STEPS[s].body;
  };
  if (reduced) return swap();
  gsap.timeline()
    .to([howHead, howBody], { yPercent: -105 * dir, duration: 0.38, ease: 'leave', stagger: 0.04, overwrite: true })
    .add(swap)
    .fromTo([howHead, howBody], { yPercent: 105 * dir }, { yPercent: 0, duration: 1.0, ease: 'settle', stagger: 0.06 });
}

const fleetTitle = $('#fleet-title');
let fleetTitleOn = false;
gsap.set(fleetTitle.querySelectorAll('.line-in'), { yPercent: 105 });
gsap.set('#rates', { opacity: 0, y: 24 });

document.querySelectorAll('[data-reveal]').forEach((block) => {
  const lines = block.querySelectorAll('.line-in');
  if (reduced) return;
  gsap.set(lines, { yPercent: 105 });
  const io = new IntersectionObserver((entries) => {
    if (entries.some((en) => en.isIntersecting)) {
      lineIn(lines);
      io.disconnect();
    }
  }, { rootMargin: '0px 0px -25% 0px' });
  io.observe(block);
});

// ---------- Nav ----------
const nav = $('#nav');
let lastY = 0;
function updateNav(y) {
  nav.classList.toggle('is-scrolled', y > 40);
  if (Math.abs(y - lastY) < 4) return;
  nav.classList.toggle('is-hidden', y > lastY && y > 120);
  lastY = y;
}
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    e.preventDefault();
    if (id === '#top') return scrollTo(0);
    if (id === '#s-fleet') return scrollTo(L['s-fleet'].top + L['s-fleet'].len * 0.5, 2.2);
    if (id === '#s-how') return scrollTo(L['s-how'].top + 2, 2.0);
    if (id === '#s-request') return scrollTo(L['s-request'].top + innerHeight * 0.15, 2.0);
    scrollTo(id);
  });
});

// ---------- Form ----------
document.querySelectorAll('.field-input').forEach((input) => {
  const field = input.closest('.field');
  const sync = () => field.classList.toggle('is-filled', !!input.value || input.tagName === 'SELECT' || input.type === 'date');
  input.addEventListener('focus', () => field.classList.add('is-focused'));
  input.addEventListener('blur', () => { field.classList.remove('is-focused'); sync(); });
  input.addEventListener('input', () => { sync(); field.classList.remove('has-error'); field.querySelector('.field-error').textContent = ''; });
  sync();
});
fCar.addEventListener('change', () => goTo(+fCar.value, { from: 'form' }));
[fCity, fFrom, fTo].forEach((el) => el.addEventListener('change', updateQuote));

function fieldError(input, msg) {
  const field = input.closest('.field');
  field.classList.toggle('has-error', !!msg);
  field.querySelector('.field-error').textContent = msg || '';
  return !msg;
}
$('#request-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = fName.value.trim();
  const contact = fContact.value.trim();
  let ok = true;
  ok = fieldError(fName, name ? '' : 'We need a name to ask for.') && ok;
  const looksLikeContact = /@.+\./.test(contact) || contact.replace(/\D/g, '').length >= 7;
  ok = fieldError(fContact, looksLikeContact ? '' : 'A phone number or an email, so we can call you back.') && ok;
  ok = fieldError(fTo, days() >= 1 ? '' : 'The return date is before the pick-up date.') && ok;
  if (!ok) {
    const first = document.querySelector('.field.has-error .field-input');
    first && first.focus();
    return;
  }
  const btn = $('#request-btn');
  const car = FLEET[state.active];
  btn.classList.add('is-sending');
  $('#btn-label').textContent = 'Sending';
  setTimeout(() => {
    const first = name.split(/\s+/)[0];
    $('#done-head .line-in').textContent = `Thank you, ${first}. We’ll call you within the hour.`;
    $('#done-body .line-in').textContent = `The ${car.make} is held for you until then.`;
    const parts = [...document.querySelectorAll('#request-form > *')];
    // Keep the column's height, so the page does not jump when the form gives way to the reply.
    $('.request-right').style.minHeight = $('#request-form').offsetHeight + 'px';
    gsap.to(parts, {
      yPercent: -30, opacity: 0, duration: reduced ? 0 : 0.45, ease: 'leave', stagger: 0.05,
      onComplete: () => {
        $('#request-form').hidden = true;
        $('#request-done').hidden = false;
        lineIn(document.querySelectorAll('#request-done .line-in'));
        // Back to the frame the request was composed in: the car, its words, and now the reply.
        scrollTo(L['s-request'].top + innerHeight * 0.15, 1.2);
        setTimeout(lockBlink, 700);
      },
    });
  }, 600);
});

// The car answers like a car being locked: its lights blink twice.
const blink = { v: 0 };
function lockBlink() {
  gsap.timeline()
    .to(blink, { v: 1, duration: 0.08 }).to(blink, { v: 0, duration: 0.22 }, '+=0.14')
    .to(blink, { v: 1, duration: 0.08 }, '+=0.16').to(blink, { v: 0, duration: 0.4 }, '+=0.14');
}

// ---------- Fit the request headline and the fleet title ----------
function fitStatics() {
  const ask = $('.request-head');
  ask.style.fontSize = fitSize(['Ask for it.'], state.phone ? innerWidth - 40 : innerWidth * 0.4, innerWidth * (state.phone ? 0.16 : 0.074)) + 'px';
  fleetTitle.style.fontSize = fitSize(['Five cars.', 'One room.'], innerWidth * (state.phone ? 0.4 : 0.5), innerWidth * 0.085) + 'px';
}

// ---------- Resize ----------
function resize() {
  state.phone = innerWidth <= 768;
  POSE = poses(state.phone);
  camera.fov = state.phone ? 50 : 34;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(innerWidth, innerHeight);
  post.resize(innerWidth, innerHeight);
  setNameFit(FLEET[state.active]);
  fitStatics();
  measure();
  placeRailBar(state.active);
}
addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 120); });

// ---------- Tail lamp glow ----------
// AgX turns a bright red lamp pink, so the lamps stay at a red the tone mapper keeps, and the glow
// around them is an additive red sprite instead of bloom.
const glowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const glowSprites = [0, 1].map(() => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff1206, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  s.renderOrder = 10;
  s.visible = false;
  return s;
});
function placeGlow(car, v) {
  glowSprites.forEach((s, k) => {
    const spot = car && car.tails[k];
    if (!spot || v < 0.01) { s.visible = false; return; }
    if (s.parent !== car.sprung) car.sprung.add(s);
    s.visible = true;
    s.position.copy(spot);
    s.material.opacity = v * 0.75;
    const size = 0.2 + 0.3 * v;
    s.scale.set(size, size * 0.66, 1);
  });
}

// ---------- Frame ----------
const clock = new THREE.Clock();
let wheelAngle = 0;
let fpsAvg = 60;
let firstFrame = true;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  fpsAvg += (1 / Math.max(dt, 1e-3) - fpsAvg) * 0.05;
  if (!keys.length) return;
  const y = scrollNow();
  const vh = innerHeight;
  const sec = sectionAt(y);
  state.section = sec;
  updateNav(y);

  // The camera: where the scroll says, eased like a scrubbed timeline.
  cameraAt(y, camWant);
  if (!dolly) state.travel *= Math.exp(-dt * 6);
  if (openCam.on) {
    toWorld(POSE.OPEN_WIDE, tmpA);
    toWorld(POSE.HERO, tmpB);
    camWant.p.lerpVectors(tmpA.p, tmpB.p, openCam.t);
    camWant.t.lerpVectors(tmpA.t, tmpB.t, openCam.t);
    camWant.shift = THREE.MathUtils.lerp(tmpA.shift, tmpB.shift, openCam.t);
  }
  // In the logbook the camera walks from car to car with the entries, one bay per entry.
  if (sec === 'log') {
    toWorld(POSE.LOG_A, camWant);
    camWant.p.x -= state.logActive * BAY_SPACING;
    camWant.t.x -= state.logActive * BAY_SPACING;
  }
  // Holding the engine draws the camera in a little, like leaning towards it.
  if (sec === 'start' && state.rev.level > 0.001) camWant.p.lerp(camWant.t, 0.1 * state.rev.level);
  if (state.travel > 0.001 && (sec === 'showroom' || sec === 'walk')) {
    const back = tmpA.p.subVectors(camWant.p, camWant.t).normalize();
    camWant.p.addScaledVector(back, 0.9 * state.travel);
    camWant.p.y += 0.25 * state.travel;
  }
  if (window.__c1v4.pose) {
    const o = window.__c1v4.pose;
    toWorld(P(...o.p, ...o.t, o.shift || 0, !!o.world), camWant);
  }
  v6.camera(sec, y, camWant, dt);
  const k = reduced || firstFrame || openCam.on ? 1 : 1 - Math.exp(-dt * (state.dragging ? 14 : sec === 'log' ? 2.6 : 7.5));
  firstFrame = false;
  camNow.p.lerp(camWant.p, k);
  camNow.t.lerp(camWant.t, k);
  camNow.shift += (camWant.shift - camNow.shift) * k;

  // The rail and the counter follow the camera down the row, bay by bay.
  const near = clamp(Math.round(state.bayPos), 0, N - 1);
  if (near !== nearShown) {
    const d = Math.sign(near - nearShown);
    nearShown = near;
    railItems.forEach((b, i) => b.classList.toggle('is-near', i === near));
    rollCounter(FLEET[near].num, d);
  }
  if (pendingIn && pendingIn.target === state.active && Math.abs(state.bayPos - state.active) < 0.5) {
    const go = pendingIn.enter;
    pendingIn = null;
    go();
  }

  // Hero copy lifts away during the first 40vh.
  const out = clamp((y - vh * 0.04) / (vh * 0.32), 0, 1);
  if (state.open) {
    $('.hero-copy').style.opacity = String(1 - out);
    $('.hero-copy').style.transform = `translateY(${-20 * out}%)`;
    $('.rail').style.opacity = String(1 - out);
  }

  // Sections.
  state.startP = progress('s-start', y);
  state.driveP = sec === 'drive' ? progress('s-drive', y) : 0;
  state.hushP = clamp((y - (L['s-hush'].top - vh)) / (vh * 0.75), 0, 1);
  state.breathP = sec === 'breath' ? progress('s-breath', y) : sec === 'how' || y > L['s-how'].top ? 1 : 0;
  updateBreath(state.breathP, sec === 'breath');
  updateWalk(progress('s-walk', y), sec === 'walk');
  if (sec === 'how' && !v6.how(progress('s-how', y))) updateHow(progress('s-how', y));
  {
    // The logbook slides past as the camera walks the row; the bay of the entry in front is lit.
    // One entry at a time: the track steps to the next entry with the camera, it never stops half way.
    const lp = progress('s-log', y);
    const act = clamp(Math.floor(lp * 5), 0, 4);
    if (act !== state.logActive) {
      state.logActive = act;
      const step = logEntries[1] ? logEntries[1].offsetLeft - logEntries[0].offsetLeft : 0;
      logEntries.forEach((e, i) => e.classList.toggle('is-on', i === act));
      gsap.to(logTrack, { x: -act * step, duration: reduced ? 0 : 1.0, ease: 'settle', overwrite: true });
    }
  }
  const crane = progress('s-fleet', y);
  const titleOn = sec === 'fleet' && crane > 0.24;
  if (titleOn !== fleetTitleOn) {
    fleetTitleOn = titleOn;
    (titleOn ? lineIn : lineOut)(fleetTitle.querySelectorAll('.line-in'));
    gsap.to('#rates', { opacity: titleOn ? 1 : 0, y: titleOn ? 0 : 24, duration: titleOn ? 1.1 : 0.4, ease: titleOn ? 'expo.out' : 'power3.in', delay: titleOn ? 0.25 : 0, overwrite: true });
    gsap.to(rateRows.querySelectorAll('tr'), { opacity: titleOn ? 1 : 0, y: 0, duration: 0.9, ease: 'settle', stagger: titleOn ? 0.06 : 0, delay: titleOn ? 0.35 : 0, overwrite: true });
  }
  $('#drive-line').classList.toggle('is-on', sec === 'drive' && state.driveP > 0.28 && state.driveP < 0.82);
  if (sec !== 'start' && state.holding) holdEnd();

  // The stage fades out at the end of the drive and back in for the handover.
  let stageAlpha = 1;
  if (sec === 'drive' && state.driveP > 0.85) stageAlpha = 1 - (state.driveP - 0.85) / 0.15;
  if (sec === 'breath') stageAlpha = clamp(state.breathP / 0.06, 0, 1);
  // V6: no separate footer screen any more. The desk's details sit under the form, and the car stays lit to the end.
  if (!reduced || !gsap.isTweening(canvas)) canvas.style.opacity = String(stageAlpha);

  // Cars: who is visible, where the current one is.
  const a = state.active;
  const solo = sec === 'hush' || sec === 'start' || sec === 'drive' || sec === 'breath' || sec === 'how';
  const ease = state.driveP / 0.85;
  // It comes back the way cars arrive at a door: from far down the dark, slowing to a stop in its bay.
  const back = clamp((state.breathP - 0.04) / 0.8, 0, 1);
  const arriveZ = 34 * Math.pow(1 - back, 3);
  const carZ = sec === 'drive' ? -42 * Math.min(1, ease) ** 2 : sec === 'breath' ? arriveZ : 0;
  room.floorU.uMarkAlpha.value += ((sec === 'drive' || sec === 'breath' ? 0 : 1) - room.floorU.uMarkAlpha.value) * Math.min(1, dt * 4);
  // V7: the polished floor reflects less under the request's headline and form, so the words stay clean
  room.floorU.uReflK.value += ((sec === 'request' ? 0.35 : 1) - room.floorU.uReflK.value) * Math.min(1, dt * 3);
  for (let i = 0; i < N; i++) {
    const c = cars[i];
    if (!c) { room.carVisible[i] = 0; continue; }
    c.root.visible = !solo || i === a;
    room.carVisible[i] = c.root.visible ? 1 : 0;
    room.carZ[i] = i === a ? carZ : 0;
    c.root.position.z = room.carZ[i];
  }

  // On a phone the tubes are too close to the lens and read as a slash: there the row is drawn by the cars.
  room.tubeShow = sec === 'showroom' && !state.phone ? 1 - out : 0;
  updateLights(dt, sec);

  // Hold to rev, the drive, the lamps. A soft bloom always takes the hottest highlights (V5, as on
  // C2 V3); when a lamp is lit the threshold drops so the lamps bloom too.
  let bloom = 0;
  let bloomTh = 2.6;
  let glow = 0;
  const car = cars[a];
  if (car) {
    let tail = 0.25;
    let head = 0.1;
    car.sprung.rotation.x = 0;
    if (sec === 'start') {
      // The lamps and the floor pulse with the engine, faster as it revs.
      const pulse = state.rev.level > 0.02 ? 0.12 * state.rev.level * Math.sin(t * (14 + 40 * state.rev.level)) : 0;
      tail = THREE.MathUtils.lerp(0.3, 0.55, state.rev.level) + pulse * 0.5;
      glow = (THREE.MathUtils.lerp(0.3, 1.15, state.rev.level) + pulse) * clamp(state.startP / 0.15, 0, 1) + crack.v * 0.6;
      car.sprung.rotation.x = THREE.MathUtils.degToRad(2.2 * state.rev.squat);
      car.sprung.position.y = -0.016 * state.rev.squat;
    } else if (sec === 'drive') {
      tail = 0.9;
      head = 1.2;
      glow = 0.8;
      bloom = state.driveP < 0.9 ? 0.5 : 0;
      bloomTh = 1.7;
      wheelAngle -= (8 + clamp(ease, 0, 1) * 34) * dt;
      car.spinWheels(wheelAngle);
      car.sprung.position.y = 0;
    } else if (sec === 'breath') {
      head = 1.7;
      tail = 0.4;
      bloom = 0.45;
      bloomTh = 1.7;
      wheelAngle -= 34 * (1 - back) * (1 - back) * dt * (back < 1 ? 1 : 0);
      car.spinWheels(wheelAngle);
    } else if (sec === 'how') {
      head = 1.0;
      tail = 0.4;
    } else {
      car.sprung.position.y = 0;
    }
    if (blink.v > 0.001) {
      tail = Math.max(tail, 1.1 * blink.v);
      head = Math.max(head, 1.6 * blink.v);
      glow = Math.max(glow, 0.8 * blink.v);
      bloom = Math.max(bloom, 0.4 * blink.v);
      bloomTh = 1.7;
    }
    car.setLights(tail, head);
  }
  placeGlow(car, glow);
  room.floorU.uTail.value.set(room.bayX(a), carZ + 2.45, sec === 'start' ? glow * 1.2 + crack.v * 1.4 : sec === 'drive' ? glow * 0.5 : 0, 0);
  if (sec === 'start') startPrompt.style.setProperty('--rev', (state.rev.level * 0.9 + crack.v * 0.3).toFixed(3));
  room.floorU.uHead.value.set(room.bayX(a), carZ - 2.3, sec === 'breath' ? 1.3 : sec === 'how' ? 0.5 * clamp(1 - progress('s-how', y) * 3, 0, 1) : 0, 0);
  room.updateTunnel(sec === 'drive' ? state.driveP : 0, room.bayX(a), carZ, dt);
  if (sweep.on) {
    const l = room.sweep[0];
    const z = THREE.MathUtils.lerp(-3.0, 3.0, sweep.t);
    l.position.set(room.bayX(a), 2.2, z);
    l.lookAt(room.bayX(a), 0.4, z + 0.001);
    l.intensity = 9 * Math.sin(Math.PI * sweep.t);
  }

  camera.position.copy(camNow.p);
  camera.lookAt(camNow.t);
  applyShift(camNow.shift);
  v6.after(sec, y, dt, t);
  // From the request on, the car is part of the page: the frame slides up with the scroll, so the car
  // stays composed with its words instead of the words scrolling across a parked car.
  const pageDy = Math.max(0, y - (L['s-request'].top + vh * 0.15));
  if (pageDy > 0.5) camera.setViewOffset(innerWidth, innerHeight, 0, pageDy, innerWidth, innerHeight);
  else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  camera.updateProjectionMatrix();
  if (sec === 'start' && state.rev.level > 0.01 && !reduced) {
    const f = 28 + state.rev.level * 42;
    const amp = 0.004 * state.rev.level;
    camera.position.x += Math.sin(t * f) * amp;
    camera.position.y += Math.cos(t * f * 1.3) * amp;
  }

  if (state.sound) {
    const prof = FLEET[a].audioProfile;
    if (sec === 'start') {
      audio.update(dt, { rpm: THREE.MathUtils.lerp(prof.idleRpm, prof.redlineRpm * 0.92, state.rev.level), throttle: state.rev.level, gear: 1, speedKmh: 0, elapsedTime: t });
    } else if (sec === 'drive' && state.driveP < 0.88) {
      const s = clamp(ease, 0, 1);
      const gear = Math.min(4, Math.floor(s * 4) + 1);
      if (gear > (frame.gear || 1)) audio.triggerExhaustBurble(0.95);
      frame.gear = gear;
      const rpm = s > 0.01 ? THREE.MathUtils.lerp(prof.idleRpm * 1.8, prof.redlineRpm * 0.88, (s * 4) % 1) : prof.idleRpm;
      audio.update(dt, { rpm, throttle: 0.75, gear, speedKmh: s * 220, elapsedTime: t });
    } else {
      frame.gear = 1;
      audio.update(dt, { rpm: 0, throttle: 0, gear: 1, speedKmh: 0, elapsedTime: t });
    }
  }

  // The cursor only speaks over the stage of the hero and the hold.
  if ((sec !== 'showroom' && sec !== 'start') || y > vh * 0.5 && sec === 'showroom') {
    cursor.classList.remove('is-on');
    document.body.classList.remove('cursor-drag', 'cursor-hold');
  }
  // Cursor follows with a little weight.
  cur.x += (cur.tx - cur.x) * 0.25;
  cur.y += (cur.ty - cur.y) * 0.25;
  cursor.style.transform = `translate3d(${cur.x + 14}px, ${cur.y - 6}px, 0)`;

  if (stageAlpha > 0.001) {
    post.update(t, bloomTh < 2 ? bloom : Math.max(bloom, BASE_BLOOM), bloomTh);
    post.composer.render();
  }
}

window.__c1v4 = {
  state,
  goTo,
  get lenis() { return lenis; },
  get fps() { return Math.round(fpsAvg); },
  get loaded() { return cars.map((c) => !!c); },
  cars,
  room,
  camera,
  scene,
  renderer,
  ready: false,
};
window.__lenis = lenis;
// V6: Chase, Runway and Trip, Sam's picks from the demo round (see sections.js)
const v6 = createSections({ THREE, gsap, scene, camera, room, cars, state, FLEET, STEPS, L, progress, euro, priceFor, goTo, renderer, reduced });

fitStatics();
measure();
gsap.ticker.add(frame);
open().catch((e) => {
  console.error(e);
  $('#no-gl').hidden = false;
});
