import * as THREE from 'three';
import { roomCenterZ } from './C2V3Light.js';

// Each car stands on a turntable set into the floor (Sam's pick from three 360 demos). Stepping into
// its room sets it turning, once round at a showroom turntable's pace, whatever the scroll does
// next: it no longer waits for a stretch of scroll to turn it, which a visitor could pass without
// it moving (Sam, 5 Nov). Leave mid-turn and it goes back to facing the door by the shorter way.
//
// The condition report rides on the car: four numbered notes (condition in C2V3FleetData: nose,
// front wheel, cabin, tail), pinned to points on it and shown while that side faces you.

const TAU = Math.PI * 2;
const TURN_SECONDS = 30; // once round at full speed (it was 12, too quick for Sam)
const MAX_SPEED = TAU / TURN_SECONDS;
const ACCEL = MAX_SPEED / 2; // two seconds to come up to speed, two to come to rest
const TO_HOLD = [1, 5]; // rooms whose section ends at the hold (the conditions and the list follow)

export function makeTurntable(ctx) {
  const { fleet, cars, sections, threshold, yawOf, reduceMotion, isPhone, showroom, mirror } = ctx;

  // the stretch of a room's section that is its hold, where the car turns
  const holdWindow = (sec) => {
    if (TO_HOLD.includes(sec.room)) return [0.42, 1.0];
    const k = threshold.share(sec.id);
    return [0.3 * k, 0.68 * k];
  };

  // ---------- the plates ----------
  const rim = new THREE.MeshBasicMaterial({ color: 0x2c251e });
  const inlay = new THREE.MeshBasicMaterial({ color: 0x6b5a46 });
  const plateMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
  const marks = fleet.map((_, i) => {
    const g = new THREE.Group();
    g.position.set(0, 0.004, roomCenterZ(i));
    // the plate, a shade darker than the stone, in a bronze ring
    const plate = new THREE.Mesh(new THREE.CircleGeometry(2.92, 160), plateMat);
    plate.rotation.x = -Math.PI / 2;
    plate.position.y = -0.001;
    g.add(plate);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.92, 2.96, 160), rim);
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    // brass marks on the plate's edge, so you see it turn
    const m = new THREE.Group();
    for (let k = 0; k < 8; k++) {
      const mk = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.22), inlay);
      mk.rotation.x = -Math.PI / 2;
      mk.rotation.z = (k / 8) * TAU;
      mk.position.set(Math.sin((k / 8) * TAU) * 2.78, 0.001, Math.cos((k / 8) * TAU) * 2.78);
      m.add(mk);
    }
    g.add(m);
    showroom.group.add(g);
    mirror.hide(g);
    return m;
  });

  // ---------- the motor ----------
  const turn = fleet.map(() => ({ angle: 0, speed: 0, target: 0 }));
  let sec = sections[0];
  let u = 0;
  // the room the visitor stands in for each section: the conditions are read in the Silver's
  // room and the list of works in the Blue's, so those count as the room before them
  const roomAt = sections.map((_, si) => {
    for (let k = si; k >= 0; k--) if (sections[k].kind === 'room') return sections[k].room;
    return -1;
  });
  let here = -1;

  // ---------- the condition report ----------
  const layer = document.createElement('div');
  layer.className = 'cr-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  const notes = fleet.map((car) =>
    car.condition.map((text, k) => {
      const el = document.createElement('div');
      el.className = 'cr-note';
      el.innerHTML = `<span class="cr-dot"></span><span class="cr-card"><span class="cr-n">0${k + 1}</span><span>${text}</span></span>`;
      layer.appendChild(el);
      return { el, k };
    })
  );
  // pinned from each car's own box, in its turning frame (the nose points down -z)
  const anchor = (i, k) => {
    const b = cars[i].box;
    const s = b.getSize(new THREE.Vector3());
    const cx = (b.min.x + b.max.x) / 2;
    return [
      [new THREE.Vector3(cx, b.min.y + 0.42 * s.y, b.min.z + 0.08 * s.z), new THREE.Vector3(0, 0, -1)],
      [new THREE.Vector3(b.min.x + 0.06 * s.x, b.min.y + 0.3 * s.y, b.min.z + 0.2 * s.z), new THREE.Vector3(-1, 0, 0)],
      [new THREE.Vector3(cx, b.max.y - 0.1 * s.y, b.min.z + 0.52 * s.z), null],
      [new THREE.Vector3(cx, b.min.y + 0.55 * s.y, b.max.z - 0.05 * s.z), new THREE.Vector3(0, 0, 1)],
    ][k];
  };
  const p = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const toCam = new THREE.Vector3();

  return {
    // from the scroll: only which room you're in. Stepping into one sends its car once round from
    // wherever it stands, and the car of the room you left goes back to facing its door.
    target(s, su, si) {
      sec = s;
      u = su;
      const now = roomAt[si];
      if (now === here) return;
      turn.forEach((t, i) => {
        if (i === now) t.target = (Math.floor(t.angle / TAU + 0.02) + 1) * TAU;
        else if (i === here) t.target = Math.round(t.angle / TAU) * TAU;
      });
      here = now;
    },

    // each frame: the motors turn the cars, then the notes are pinned to them
    step(dt, camera) {
      dt = Math.min(dt, 0.1);
      turn.forEach((t, i) => {
        if (reduceMotion) {
          t.angle = 0;
        } else {
          // up to speed gently, steady, then slowing so it comes to rest on the mark: the speed it
          // wants is the most it could still stop from in the distance left
          const d = t.target - t.angle;
          const want = Math.sign(d) * Math.min(MAX_SPEED, Math.sqrt(2 * 0.9 * ACCEL * Math.abs(d)));
          t.speed += THREE.MathUtils.clamp(want - t.speed, -ACCEL * dt, ACCEL * dt);
          t.angle += t.speed * dt;
          if (Math.abs(t.target - t.angle) < 1e-3 && Math.abs(t.speed) < ACCEL * dt * 2) {
            // at rest on a whole turn, which looks the same as none: the count goes back to 0
            const k = Math.round(t.target / TAU);
            t.angle = t.target = t.target - k * TAU;
            t.speed = 0;
          }
        }
        if (cars[i]) {
          cars[i].yawGroup.rotation.y = THREE.MathUtils.degToRad(yawOf(i) + 180) + t.angle;
          cars[i].yawGroup.updateMatrixWorld();
        }
        marks[i].rotation.y = t.angle;
      });

      const W = window.innerWidth;
      const H = window.innerHeight;
      notes.forEach((list, i) => {
        const car = cars[i];
        let on = false;
        if (car && sec.kind === 'room' && sec.room === i) {
          const [a, b] = holdWindow(sec);
          on = u > a + 0.02 && u < b - 0.02;
        }
        const label = on ? document.querySelector(`.label[data-car="${fleet[i].id}"].is-on`)?.getBoundingClientRect() : null;
        // a phone has room for one note at a time: the side facing you most squarely
        let best = null;
        list.forEach((n) => {
          let show = false;
          if (on) {
            const [at, d] = anchor(i, n.k);
            p.copy(at).applyMatrix4(car.yawGroup.matrixWorld);
            toCam.copy(camera.position).sub(p).normalize();
            const facing = d ? dir.copy(d).transformDirection(car.yawGroup.matrixWorld).dot(toCam) : 1;
            p.project(camera);
            const x = ((p.x + 1) / 2) * W;
            const y = ((1 - p.y) / 2) * H;
            show = facing > 0.25 && p.z < 1 && x > 40 && x < W - 40 && y > 80 && y < H - 60;
            // the card goes left of its dot where the label (or the edge) is in the way on the right
            const w = n.el.offsetWidth || 260;
            const left = x + w > W - 24 || (label && x + w > label.left - 16 && y > label.top - 30 && y < label.bottom + 30);
            // and a note never sits on the label: where it would either way, it waits for the car to turn
            const nx = left ? x - w : x;
            const nh = n.el.offsetHeight || 44;
            if (label && nx < label.right + 16 && nx + w > label.left - 16 && y < label.bottom + 16 && y + nh > label.top - 16) show = false;
            if (show && isPhone() && (!best || facing > best.facing)) best = { n, facing };
            n.el.classList.toggle('is-left', !!left);
            if (show) n.el.style.transform = `translate(${(left ? x - w + 3.5 : x - 3.5).toFixed(1)}px, ${(y - 3.5).toFixed(1)}px)`;
          }
          n.el.classList.toggle('is-on', show && (!isPhone() || best?.n === n));
        });
        if (isPhone() && best) list.forEach((n) => n.el.classList.toggle('is-on', n === best.n));
      });
    },
  };
}
