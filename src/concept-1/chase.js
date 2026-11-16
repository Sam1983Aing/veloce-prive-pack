// The drive-away, V6: Chase (Sam's pick from the demo round of 14 Nov, Teach/c1-v6/demo/).
// Sam on V5: "a strong concept, but when it got smaller, and with the light, it feels a little bit
// weak". So the camera goes with the car: low and close behind it, the lens widening a little with
// speed, a small shake from the road. The car stays big through the run and only pulls away in the
// last stretch, into the fade. The car's own path is the page's (-42 m, eased), unchanged.
export function createChase(ctx) {
  const { THREE, camera, room, state, progress, reduced } = ctx;
  const sm = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
  const P = new THREE.Vector3(), T = new THREE.Vector3();
  let p = 0, fov0 = camera.fov, inDrive = false;
  return {
    camera(sec, y, want) {
      if (sec !== 'drive') return;
      p = progress('s-drive', y);
      const z = -42 * Math.min(1, p / 0.85) ** 2;
      const bx = room.bayX(state.active);
      // from the car's centre: about three metres off the rear bumper, then it slowly gains on us as it
      // accelerates, and pulls away for good in the last stretch
      const back = (state.phone ? 7.4 : 5.5) + 2.2 * sm(0.15, 0.68, p) + 10 * sm(0.66, 0.9, p) ** 2;
      // high enough to see the rear deck catch each light as it passes, drifting a little side to side
      // so the tunnel moves against the car
      const sway = 0.38 * Math.sin(p * Math.PI * 2.4) * sm(0.08, 0.3, p);
      P.set(bx + sway, (state.phone ? 1.35 : 1.05) - 0.12 * sm(0.04, 0.3, p), z + back);
      T.set(bx, state.phone ? 0.7 : 0.75, z - 16);
      // out of the rev's three-quarter view and in behind the car over the first sixth of the scroll,
      // so the cut never happens: scrolled back, it hands the camera back the same way
      const w = sm(0, 0.16, p);
      want.p.lerp(P, w);
      want.t.lerp(T, w);
      want.shift *= 1 - w;
    },
    after(sec, y, dt, t) {
      if (sec === 'breath') {
        // the arrival: enough light on the car to read it as it comes back out of the dark
        const car = ctx.cars[state.active];
        if (car) car.setLevel(Math.max(room.level(state.active), 0.4), 1);
      }
      if (sec !== 'drive') {
        if (inDrive) camera.fov = fov0; // hand the lens back exactly as it was
        else fov0 = camera.fov;
        inDrive = false;
        room.streak = 1;
        return;
      }
      inDrive = true;
      const speed = sm(0.02, 0.3, p) * (1 - sm(0.8, 0.92, p));
      // short streaks: long ones joined into two static lines, and the run looked parked
      room.streak = 0.3;
      // the car reads in the tunnel, and the lights running over it are strong enough to see on the paint
      const car = ctx.cars[state.active];
      if (car) car.setLevel(0.42, 1);
      room.sweep.forEach((l) => (l.intensity *= 2.4));
      if (reduced) return; // no lens change or shake when motion is reduced
      camera.fov = fov0 + (state.phone ? 5 : 8) * speed;
      camera.position.x += Math.sin(t * 37) * 0.01 * speed;
      camera.position.y += Math.sin(t * 53 + 1) * 0.007 * speed;
    },
  };
}
