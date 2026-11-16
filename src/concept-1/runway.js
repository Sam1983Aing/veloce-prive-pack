// How it works, V6: Runway (Sam's pick from the demo round of 14 Nov, Teach/c1-v6/demo/).
// Sam on V5: "a little bit average, because when we scroll, numbers change, but nothing much to it".
// The five steps are painted on the showroom floor in front of the car, worn like floor paint, the way
// the bay numbers already are. As the car arrives, the camera pulls back down the runway; then the
// scroll glides it along the steps towards the car's headlamps. The words stay in the page for
// screen readers (#how-list); the painted ones are the picture.
export function createRunway(ctx) {
  const { THREE, scene, room, cars, state, STEPS, progress } = ctx;
  const sm = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
  const lerp = THREE.MathUtils.lerp;
  const sec$ = document.getElementById('s-how');
  sec$.classList.add('how-runway');
  sec$.querySelector('.how-col').setAttribute('aria-hidden', 'true');
  const style = document.createElement('style');
  style.textContent = `
    .how-runway .how-col { opacity: 0; pointer-events: none; }
    .rw-label { position: absolute; left: var(--gutter); top: 14vh; }
    .rw-count { position: absolute; left: var(--gutter); top: calc(14vh + 24px); font-size: 13px; letter-spacing: 0.08em; color: var(--stone); font-variant-numeric: tabular-nums; }
    /* on a phone the steps fill the floor, so the label sits low, on its own ground */
    @media (max-width: 768px) {
      .rw-label { top: auto; bottom: calc(7vh + 24px); }
      .rw-count { top: auto; bottom: 7vh; }
      .how-runway .pin::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 20vh; background: linear-gradient(transparent, rgba(10,10,9,0.92)); pointer-events: none; }
    }
    .rw-count b { color: var(--bone); font-weight: 400; }
  `;
  document.head.appendChild(style);
  const pin = sec$.querySelector('.pin');
  const label = document.createElement('p');
  label.className = 'label rw-label';
  label.textContent = 'How it works';
  const count = document.createElement('p');
  count.className = 'rw-count';
  count.setAttribute('aria-hidden', 'true');
  count.innerHTML = '<b>01</b> / 05';
  pin.append(label, count);

  const Z = [-29, -24, -19, -14, -9]; // step 1 farthest from the car, step 5 at its nose
  const W = 4.6, H = 3.2;
  const paint = (i) => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = Math.round(1024 * (H / W));
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    try { g.fontStretch = 'expanded'; } catch {}
    g.font = '100 300px Archivo, sans-serif';
    g.fillText(String(i + 1).padStart(2, '0'), 30, 290);
    // the headline on one line, as large as fits the panel
    const head = STEPS[i].headline.replace(/\.$/, '').toUpperCase();
    let fs = 62;
    do { g.font = `500 ${fs}px Archivo, sans-serif`; } while (g.measureText(head).width > 950 && --fs > 30);
    g.fillText(head, 36, 400);
    try { g.fontStretch = 'normal'; } catch {}
    g.font = '400 34px Archivo, sans-serif';
    const words = STEPS[i].body.split(' ');
    let line = '', yy = 470;
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > 940) { g.fillText(line, 38, yy); line = w; yy += 46; if (yy > 680) break; } else line = t;
    }
    if (yy <= 680) g.fillText(line, 38, yy);
    // worn: a fine grain knocked out of the paint, so it reads as paint on concrete, not a screen
    g.globalCompositeOperation = 'destination-out';
    let seed = 7 + i * 101;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 9000; k++) { g.globalAlpha = rnd() * 0.5; g.fillRect(rnd() * c.width, rnd() * c.height, 2, 2); }
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const marks = [];
  document.fonts.ready.then(() => {
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: paint(i), color: 0xcfc8bd, transparent: true, depthWrite: false, opacity: 0 }));
      m.rotation.set(-Math.PI / 2, 0, Math.PI); // flat on the floor, reading towards the car
      m.visible = false;
      scene.add(m);
      marks.push(m);
    }
  });

  // the camera on the runway at progress u (0: its far end, 1: just in front of the car)
  const at = (u, bx, P, T) => {
    const z = lerp(-37, -7.4, u);
    // at the end the camera rises and steps aside, towards where the logbook looks at the row from
    const rise = sm(0.84, 1, u);
    P.set(bx + (state.phone ? 0 : 0.5 * Math.sin(u * Math.PI)) + 1.8 * rise, lerp(state.phone ? 4.4 : 2.7, state.phone ? 1.9 : 1.2, u) + 1.1 * rise, z - 1.2 * rise);
    const look = sm(0.72, 1, u);
    T.set(bx, lerp(0, 0.55, look), lerp(z + (state.phone ? 6 : 8.5), -0.4, look));
  };
  const P = new THREE.Vector3(), T = new THREE.Vector3();
  let p = 0, bp = 0, shown = -1;
  return {
    update(q) {
      p = q;
      // the counter follows the step the camera is looking at, not an even fifth of the scroll
      const ahead = lerp(-37, -7.4, q) + (state.phone ? 6 : 8);
      let s = 0;
      Z.forEach((z, i) => { if (Math.abs(z - ahead) < Math.abs(Z[s] - ahead)) s = i; });
      if (s !== shown) { shown = s; count.innerHTML = `<b>${String(s + 1).padStart(2, '0')}</b> / 05`; }
      return true; // the runway draws How it works itself
    },
    camera(sec, y, want) {
      const bx = room.bayX(state.active);
      if (sec === 'breath') {
        // as the car settles in its bay, pull back down the runway to where the steps begin
        bp = progress('s-breath', y);
        const w = sm(0.86, 1, bp);
        if (w <= 0) return;
        at(0, bx, P, T);
        want.p.lerp(P, w);
        want.t.lerp(T, w);
        want.shift *= 1 - w;
        return;
      }
      if (sec !== 'how') return;
      at(p, bx, P, T);
      want.p.copy(P);
      want.t.copy(T);
      want.shift = 0;
    },
    after(sec, y) {
      const bx = room.bayX(state.active);
      // gone the moment the logbook begins, so no step shows through its entries
      const k = sec === 'how' ? 0.9 : sec === 'breath' ? 0.9 * sm(0.92, 1, bp) : 0;
      marks.forEach((m, i) => {
        m.visible = k > 0.002;
        m.position.set(bx, 0.006, Z[i]);
        m.scale.setScalar(state.phone ? 0.5 : 1); // a phone's frame is narrow: the steps fit inside it
        m.material.opacity = k;
      });
      const car = cars[state.active];
      if (sec === 'how' && car) {
        car.setLights(0.4, 1.5); // the headlamps at the end of the runway
        room.floorU.uHead.value.set(bx, -2.3, 1.1, 0);
      }
    },
  };
}
