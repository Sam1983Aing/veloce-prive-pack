// The trailer is the way in (Sam, 14 Nov): the page opens on black with one button in the middle,
// Watch trailer. That click is the visitor's first gesture, the one a browser waits for before
// any sound, so it also turns the films' sound on for the whole visit (onWatch). The trailer
// plays full screen with its sound, Skip or Esc jumps to the hall, and the gallery's lights come
// on as it fades (main.js waits for `finished`). The 3D loads behind it in the meantime.
//
// The markup is in index.html, so the black screen is there from the first paint. ?nointro
// takes it out before it shows (the capture tools use it to go straight to the hall).
//
// The button itself is platinum (PlatinumButton.js): it's drawn the moment the trailer is made,
// starts moving when the way in opens and disappears the instant it's clicked.

import { makePlatinumButton } from './PlatinumButton.js';
import { films, filmUrl } from '../shared/films.js';

export function makeTrailer({ reduceMotion }) {
  const root = document.getElementById('trailer');
  let done;
  const finished = new Promise((r) => (done = r));
  if (!root) {
    done();
    return { finished, covering: () => false, arm() {}, leave() {} };
  }
  const film = root.querySelector('.trailer-film');
  // the pack ships without the trailer: unless films.json says there is one, the button opens the hall
  let hasFilm = false;
  films.then((l) => {
    hasFilm = l.trailer;
    if (hasFilm) film.src = filmUrl('trailer.mp4');
    else root.querySelector('.pt-label').textContent = 'Enter the gallery';
  });
  const watch = root.querySelector('.trailer-watch');
  const skip = root.querySelector('.trailer-skip');
  const cta = makePlatinumButton({ board: root.querySelector('.pt-board'), button: watch, reduceMotion });

  // everything behind the trailer is out of reach until it's gone (keyboard and screen readers)
  const behind = [...document.body.children].filter((el) => el !== root && el.tagName !== 'SCRIPT');
  behind.forEach((el) => (el.inert = true));
  // always start at the top of the page: the hall is what the trailer hands over to
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  let state = 'waiting'; // waiting, armed, playing, leaving, gone
  let onWatch = null;

  function arm(cb) {
    if (cb) onWatch = cb;
    if (state !== 'waiting') return;
    state = 'armed';
    watch.disabled = false;
    cta.start();
    root.classList.add('is-armed');
    // Enter starts it straight away; no ring until the keyboard is used
    watch.focus({ preventScroll: true, focusVisible: false });
  }
  // if the page never gets as far as arming it (a slow or broken load), the way in still opens
  const safety = setTimeout(() => arm(), 8000);

  watch.addEventListener('click', (e) => {
    if (state !== 'armed') return;
    state = 'playing';
    clearTimeout(safety);
    if (!hasFilm) {
      try {
        onWatch?.();
      } catch (err) {
        console.error(err);
      }
      leave();
      return;
    }
    // inside the click: the trailer starts with its sound, then the films are allowed theirs
    film.muted = false;
    film.currentTime = 0;
    film.play().catch(() => {
      film.muted = true;
      film.play().catch(() => leave());
    });
    try {
      onWatch?.();
    } catch (err) {
      console.error(err);
    }
    root.classList.add('is-playing');
    skip.tabIndex = 0;
    // from the keyboard, Skip takes the focus; from a mouse or a finger nothing should light up
    if (e.detail === 0) skip.focus({ preventScroll: true });
    else watch.blur();
    // the button is gone the moment it's clicked and won't come back: free its GPU for the film
    cta.dispose();
  });
  skip.addEventListener('click', () => leave());
  film.addEventListener('ended', () => leave());
  film.addEventListener('error', () => state === 'playing' && leave());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state === 'playing') leave();
  });

  // out to the hall: the sound eases down, the black lifts, and the gallery opens behind it
  function leave() {
    if (state === 'leaving' || state === 'gone') return;
    state = 'leaving';
    clearTimeout(safety);
    root.classList.add('is-leaving');
    cta.dispose();
    behind.forEach((el) => (el.inert = false));
    document.documentElement.classList.remove('trailer-on');
    const v0 = film.volume;
    const t0 = performance.now();
    const fade = () => {
      const k = Math.min(1, (performance.now() - t0) / 600);
      film.volume = v0 * (1 - k);
      if (k < 1) requestAnimationFrame(fade);
      else film.pause();
    };
    if (film.paused) film.pause();
    else requestAnimationFrame(fade);
    done();
    setTimeout(() => {
      state = 'gone';
      root.hidden = true;
      film.removeAttribute('src');
      film.load();
    }, reduceMotion ? 200 : 1600);
  }

  return {
    finished,
    // true while the black screen hides the 3D completely, so the page needn't draw it
    covering: () => state === 'waiting' || state === 'armed' || state === 'playing',
    arm,
    leave,
  };
}
