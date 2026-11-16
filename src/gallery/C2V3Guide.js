// The visitor's guide (Sam's pick from three nav demos, kept in Teach/c2-v3/demo/nav/code/). The bar
// stays put and says where you are, with a hairline that fills as you walk. "Index" opens the guide
// over the page, the way a museum hands you its printed one: every room with its car, town and day
// rate. Pick one and you walk there.

const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];

// In a room the bar takes the colour of its car (Sam, 5 Nov: the bar was all light). The paint
// itself is often too dark to read on the bar, so it keeps its hue and is lifted to a readable
// lightness, a little less saturated: Racing red reads as a soft red, Blue as sky.
function barTint(hex) {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return `hsl(${Math.round((h * 60 + 360) % 360)} ${Math.round(Math.min(s, 0.72) * 100)}% ${Math.round(Math.max(l, 0.64) * 100)}%)`;
}

export function makeGuide({ fleet, goTo, lenis, reduceMotion }) {
  const where = document.getElementById('nav-where');
  const nav = where.closest('.nav');
  const bar = document.querySelector('.nav-progress i');
  const open = document.getElementById('ix-open');
  const cars = `${COUNT[fleet.length] ?? fleet.length} cars`;
  const tints = fleet.map((car) => barTint(car.paintHex));
  let tintNow = null;

  // what the bar says for each part of the page
  const label = (sec, roomNow) => {
    if (sec.kind === 'hero') return `<span class="nw-n">Hall</span>${cars}, open tonight`;
    if (sec.kind === 'terms') return `<span class="nw-n">${fleet[1].number}</span>The conditions`;
    if (sec.kind === 'works') return `<span class="nw-n">${fleet[fleet.length - 1].number}</span>The list of works`;
    if (sec.kind === 'request') return '<span class="nw-n">Desk</span>Request a loan';
    const car = fleet[roomNow];
    return car ? `<span class="nw-n">Room ${car.number}</span><span class="nw-car">${car.title}</span>` : '';
  };

  const ix = document.createElement('div');
  ix.className = 'ix';
  ix.id = 'ix';
  ix.setAttribute('role', 'dialog');
  ix.setAttribute('aria-modal', 'true');
  ix.setAttribute('aria-label', 'Visitor’s guide');
  ix.tabIndex = -1;
  const rate = (n) => `€${n.toLocaleString('en-GB')}`;
  ix.innerHTML = `<div class="ix-inner">
    <p class="ix-kicker">Visitor’s guide · ${fleet.length} rooms, open tonight</p>
    ${fleet
      .map(
        (c, k) => `<button type="button" class="ix-row" data-room="${k}">
          <span class="ix-n">${c.number}</span><span class="ix-t">${c.title}<span class="ix-held" id="ix-held-${c.id}" hidden> · on loan</span></span>
          <span class="ix-o">${c.origin}</span><span class="ix-p">${rate(c.rates.day)} a day</span>
        </button>`
      )
      .join('')}
    <div class="ix-foot"><button type="button" data-go-ix="s-terms">The conditions</button><button type="button" data-go-ix="s-works">The list of works</button><button type="button" data-go-ix="s-request">Request a loan</button></div>
  </div>`;
  document.body.appendChild(ix);
  const focusables = [...ix.querySelectorAll('button')];

  const isOpen = () => ix.classList.contains('is-open');
  const setOpen = (on, { returnFocus = true } = {}) => {
    if (on === isOpen()) return;
    ix.classList.toggle('is-open', on);
    open.setAttribute('aria-expanded', String(on));
    open.textContent = on ? 'Close' : 'Index';
    if (on) {
      lenis?.stop();
      ix.focus({ preventScroll: true });
    } else {
      lenis?.start();
      if (returnFocus && ix.contains(document.activeElement)) open.focus({ preventScroll: true });
    }
  };
  open.addEventListener('click', () => setOpen(!isOpen()));
  window.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') setOpen(false);
    // Tab stays inside the guide while it's open, with Close as the way out
    if (e.key === 'Tab') {
      const ring = [...focusables, open];
      const k = ring.indexOf(document.activeElement);
      const next = k < 0 ? (e.shiftKey ? ring.length - 1 : 0) : (k + (e.shiftKey ? -1 : 1) + ring.length) % ring.length;
      e.preventDefault();
      ring[next].focus({ preventScroll: true });
    }
  });
  // a click on the dark around the list closes it
  ix.addEventListener('click', (e) => e.target === ix && setOpen(false));
  ix.querySelectorAll('.ix-row').forEach((b) =>
    b.addEventListener('click', () => {
      setOpen(false, { returnFocus: false });
      goTo(`s-room-${Number(b.dataset.room) + 1}`);
    })
  );
  ix.querySelectorAll('[data-go-ix]').forEach((b) =>
    b.addEventListener('click', () => {
      setOpen(false, { returnFocus: false });
      const to = b.dataset.goIx;
      goTo(to, to === 's-request' ? () => document.getElementById('f-car').focus({ preventScroll: true }) : undefined);
    })
  );
  if (reduceMotion) ix.classList.add('is-still');

  return {
    update(sec, roomNow, y) {
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${(y / Math.max(1, max)).toFixed(4)})`;
      const html = label(sec, roomNow);
      if (where.innerHTML !== html) where.innerHTML = html;
      const tint = sec.kind !== 'hero' && sec.kind !== 'request' ? tints[roomNow] ?? null : null;
      if (tint !== tintNow) {
        tintNow = tint;
        if (tint) nav.style.setProperty('--car', tint);
        else nav.style.removeProperty('--car');
      }
    },
  };
}
