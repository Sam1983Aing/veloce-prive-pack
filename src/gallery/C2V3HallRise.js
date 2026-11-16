import * as THREE from 'three';
import { lightUniforms, HALL_FRONT, HALL_HALF_WIDTH, HALL_HEIGHT, DOOR_HALF } from './C2V3Light.js';

// The opening (Sam, 5 Nov). A slot in the floor runs along the foot of the name wall, either side of
// the doorway. It strikes with a flash, and its light climbs the whole width of the wall, brightest
// at the floor and fading as it rises, until it has passed the name. Then the hall's own light comes
// up as it always did, and the slot stays on, low, as an uplight at the foot of the wall.
// (Sam turned down a sweeping beam and two spotlights for this: the light had to come from a source
// you can see, and take the whole wall. Both are kept in Teach/c2-v3/code.)
//
// The light on the wall is painted by the hall's shader (uRise in C2V3Light): x is how far up the
// wall it has climbed, y its level.

const SETTLE = 0.3; // the slot's level once the hall's own light is up
const SLOT_Z = HALL_FRONT + 0.09; // just in front of the wall's face
const WARM = new THREE.Color(1.0, 0.86, 0.72);

export function makeHallRise({ scene, mirror, reduceMotion }) {
  const rise = lightUniforms.uRise.value;
  const state = { level: 0, top: 0 };

  // the slot: a thin lit line set in the floor, the whole width of the wall on each side, from
  // the corner to the edge of the doorway, in line with its steel (Sam: it stopped short of both)
  const slotMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const len = HALL_HALF_WIDTH - DOOR_HALF;
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.004, 0.022), slotMat);
    m.position.set(side * (DOOR_HALF + len / 2), 0.002, SLOT_Z);
    scene.add(m);
    mirror.hide(m);
  }

  return {
    // in the opening timeline (main.js), from `delay` seconds
    play(gsap, delay) {
      if (reduceMotion) {
        Object.assign(state, { level: SETTLE, top: HALL_HEIGHT + 2 });
        return;
      }
      // the slot strikes: a flash, a dip, up again
      gsap.timeline({ delay })
        .to(state, { level: 1.8, duration: 0.05, ease: 'power1.in' })
        .to(state, { level: 0.35, duration: 0.05, ease: 'power1.out' })
        .to(state, { level: 1.2, duration: 0.08, ease: 'power1.in' })
        .to(state, { level: SETTLE, duration: 1.6, ease: 'gallery' }, 2.5);
      // and its light climbs the wall, the whole width at once
      // at an even pace from the floor, easing only as it reaches the top of the wall
      gsap.to(state, { top: HALL_HEIGHT + 0.2, duration: 2.6, ease: 'sine.out', delay: delay + 0.1 });
    },

    // the level it lends the doorway's steel, which catches it from below
    get level() {
      return state.level;
    },

    // every frame, with the hall's own fade at closing time
    update(hallOn) {
      rise.set(state.top, state.level * hallOn);
      slotMat.color.copy(WARM).multiplyScalar(2.4 * state.level * hallOn);
    },
  };
}
