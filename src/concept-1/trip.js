// With every car / To drive, V6: Trip (Sam's pick from the demo round of 14 Nov, Teach/c1-v6/demo/).
// Sam on V5: "make it a little bit more interactive". Your trip in one sentence you can change (the
// car, the city, the days, your age, a second driver). The two lists rewrite themselves for it, each
// line with a tick or a cross, and the trip carries into the request form below, so "Ask for it"
// already holds the car, the city and the dates.
export function createTrip(ctx) {
  const { gsap, state, FLEET, euro, priceFor, goTo, reduced } = ctx;
  const sec$ = document.getElementById('s-terms');
  const lists = [...sec$.querySelectorAll('.terms-list')];
  const CITIES = ['Monaco', 'Geneva', 'Milan', 'Dubai', 'Miami'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const trip = { car: state.active, city: FLEET[state.active].city, days: 3, age: 31, second: false };
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() + ((5 - start.getDay() + 7) % 7 || 7)); // the next Friday
  const day = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const style = document.createElement('style');
  style.textContent = `
    /* a ground behind the words, so the car never passes under them when it changes */
    .s-terms.terms-trip { position: relative; padding-top: 18vh; }
    .s-terms.terms-trip::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 60vw; background: linear-gradient(90deg, rgba(10,10,9,0.94) 42%, rgba(10,10,9,0)); pointer-events: none; }
    .terms-trip .terms { position: relative; gap: 40px; }
    .trip { margin-bottom: 0; }
    @media (max-width: 768px) { .s-terms.terms-trip::before { width: 100%; background: rgba(10,10,9,0.78); } }
    .trip-line { font-size: clamp(20px, 1.9vw, 30px); line-height: 1.55; color: var(--stone); max-width: 30ch; }
    .trip-line .v { color: var(--bone); }
    .trip-chip { font: inherit; color: var(--bone); background: none; border: 0; border-bottom: 1px solid rgba(236,231,223,0.35); padding: 0 2px 1px; cursor: pointer; transition: border-color 0.3s; }
    .trip-chip:hover { border-color: var(--bone); }
    .trip-step { font: inherit; font-size: 0.72em; color: var(--bone); background: none; border: 1px solid rgba(236,231,223,0.3); border-radius: 50%; width: 1.55em; height: 1.55em; line-height: 1; cursor: pointer; vertical-align: 0.12em; margin: 0 3px; transition: color 0.3s, border-color 0.3s, background 0.3s; }
    .trip-step:active { background: rgba(236,231,223,0.12); }
    .trip-step:hover { color: var(--bone); border-color: var(--bone); }
    .trip-chip:focus-visible, .trip-step:focus-visible { outline: 1px solid var(--bone); outline-offset: 3px; }
    .s-terms.terms-trip .terms-list li { display: grid; grid-template-columns: 22px 1fr; align-items: baseline; }
    .tk { width: 10px; height: 6px; border-left: 1px solid var(--bone); border-bottom: 1px solid var(--bone); transform: rotate(-45deg) translateY(-3px); display: inline-block; }
    .tx { position: relative; width: 10px; height: 10px; display: inline-block; }
    .tx::before, .tx::after { content: ''; position: absolute; left: 50%; top: 0; width: 1px; height: 10px; background: var(--paint); }
    .tx::before { transform: rotate(45deg); } .tx::after { transform: rotate(-45deg); }
    .terms-list li.is-no { color: var(--bone); }
    .terms-list li b { font-weight: 500; color: var(--bone); }
  `;
  document.head.appendChild(style);
  sec$.classList.add('terms-trip');
  const box = document.createElement('div');
  box.className = 'trip';
  box.innerHTML = '<p class="label" style="margin-bottom:14px">Your trip</p><p class="trip-line" id="trip-line"></p>';
  sec$.querySelector('.terms').prepend(box);
  const line = box.querySelector('#trip-line');
  lists.forEach((l) => l.setAttribute('aria-live', 'polite'));
  const mark = (ok) => `<span class="${ok ? 'tk' : 'tx'}" aria-label="${ok ? 'Yes' : 'No'}" role="img"></span>`;

  const render = (changed) => {
    const c = FLEET[trip.car];
    const end = new Date(start.getTime() + trip.days * 864e5);
    line.innerHTML = `The <button class="trip-chip" data-k="car" aria-label="Car: ${c.fullName}. Change">${c.fullName}</button>, delivered in <button class="trip-chip" data-k="city" aria-label="City: ${trip.city}. Change">${trip.city}</button>, for <button class="trip-step" data-k="days-" aria-label="One day fewer">−</button><span class="v"> ${trip.days} day${trip.days > 1 ? 's' : ''} </span><button class="trip-step" data-k="days+" aria-label="One day more">+</button> from ${day(start)}. Driver aged <button class="trip-step" data-k="age-" aria-label="Younger">−</button><span class="v"> ${trip.age} </span><button class="trip-step" data-k="age+" aria-label="Older">+</button>, <button class="trip-chip" data-k="second" aria-pressed="${trip.second}">${trip.second ? 'with a second driver' : 'no second driver'}</button>.`;
    const winter = trip.city === 'Geneva' && [10, 11, 0, 1, 2].includes(start.getMonth());
    const okAge = trip.age >= c.minAge;
    const can = FLEET.filter((f) => trip.age >= f.minAge).map((f) => f.fullName);
    const rowsA = [
      [true, `<b>${euro(priceFor(c, trip.days))}</b> for ${trip.days} day${trip.days > 1 ? 's' : ''}, ${(c.rates.km * trip.days).toLocaleString('en-GB')} km included, then ${euro(c.rates.extraKm)} a kilometre.`],
      [true, `Fully comprehensive, no excess beyond the deposit, for you${trip.second ? ' and your second driver, at no charge' : ''}.`],
      [true, trip.city === c.city ? `Brought to your door, a hotel, a marina or the private terminal in ${trip.city}.` : `It lives in ${c.city}, so it is driven to ${trip.city} the day before. No charge.`],
      [true, 'A full tank. Bring it back as you like, we fill it.'],
      [true, `A person on the line at any hour, who knows the ${c.make}.`],
      [true, winter ? `Winter tyres fitted for Geneva in ${MONTHS[start.getMonth()]}, and a cover for the night.` : 'Summer tyres, checked the morning it leaves, and a cover for the night.'],
    ];
    const rowsB = [
      [okAge, okAge ? `At ${trip.age}, the ${c.make} is yours: it asks for ${c.minAge} and over, with ${c.licenceYears} years on your licence.` : `The ${c.make} asks for ${c.minAge} and over. At ${trip.age}: ${can.length ? can.join(', ') : 'none of the five yet'}.`],
      [true, `Your passport or ID and your licence, at the handover on ${day(start)}.`],
      [true, `<b>${euro(c.rates.deposit)}</b> held on your card that morning, released ${day(end)}, the day it comes back.`],
      [true, 'Track days, filming and trips beyond the five countries on request.'],
    ];
    [rowsA, rowsB].forEach((rows, k) => {
      const prev = [...lists[k].children].map((li) => li.innerHTML);
      lists[k].innerHTML = rows.map(([ok, t]) => `<li class="${ok ? '' : 'is-no'}">${mark(ok)}<span>${t}</span></li>`).join('');
      if (changed && !reduced) {
        [...lists[k].children].forEach((li, i) => {
          if (li.innerHTML === prev[i]) return;
          gsap.fromTo(li, { color: '#ece7df', x: 8 }, { color: li.classList.contains('is-no') ? '#ece7df' : '#8e877c', x: 0, duration: 1.2, ease: 'expo.out', clearProps: 'color,transform' });
        });
      }
    });
  };

  // the trip goes into the request form: car, city and dates, with its quote
  const toForm = () => {
    const f = (id) => document.getElementById(id);
    const city = f('f-city'), from = f('f-from'), to = f('f-to');
    if (!city || !from || !to) return;
    city.value = trip.city;
    from.value = iso(start);
    to.value = iso(new Date(start.getTime() + trip.days * 864e5));
    [from, to, city].forEach((el) => el.dispatchEvent(new Event('change', { bubbles: true })));
  };

  line.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const k = b.dataset.k;
    if (k === 'car') { trip.car = (trip.car + 1) % FLEET.length; trip.city = FLEET[trip.car].city; goTo(trip.car, { from: 'terms' }); }
    if (k === 'city') trip.city = CITIES[(CITIES.indexOf(trip.city) + 1) % CITIES.length];
    if (k === 'days-') trip.days = Math.max(1, trip.days - 1);
    if (k === 'days+') trip.days = Math.min(14, trip.days + 1);
    if (k === 'age-') trip.age = Math.max(21, trip.age - 3);
    if (k === 'age+') trip.age = Math.min(80, trip.age + 3);
    if (k === 'second') trip.second = !trip.second;
    render(true);
    toForm();
    // keep the keyboard where it was after the sentence is rewritten
    const again = line.querySelector(`[data-k="${k}"]`);
    if (again && document.activeElement === document.body) again.focus({ preventScroll: true });
  });
  render(false);
  // the page still writes the car's own terms into these two ids; they live on, hidden
  const keep = document.createElement('div');
  keep.hidden = true;
  keep.innerHTML = '<span id="terms-car"></span><span id="terms-age"></span>';
  sec$.appendChild(keep);

  return {
    after() {
      // a car chosen anywhere else on the page (the rail, the rates, the form) becomes the trip's car
      if (state.active !== trip.car) {
        trip.car = state.active;
        trip.city = FLEET[trip.car].city;
        render(false);
      }
    },
    // the form's first values are the trip's, once the page has set its own
    ready: toForm,
  };
}
