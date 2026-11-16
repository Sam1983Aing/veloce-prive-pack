// The film. Lengths are in vh of scroll and deliberately uneven. Each shot has one or more camera
// set-ups (a change of set-up is a hard cut), the story clock, its subtitles, and the captions that
// replace the sounds that matter when the film plays without sound.
// Car at the origin, nose toward +Z. Positions in metres. Phone set-ups are framed for portrait.

const m = (h, mm) => h * 60 + mm;

export const SHOTS = [
  {
    id: 'wide', vh: 160, clock: [m(21, 40), m(21, 51)],
    cams: [{
      // the car large in the right half at about 10 m, the title standing on the apron to its left,
      // reflected in the wet ground; the horizon high so the frame is apron, not sky
      desk: { pos: [[-4.0, 0.85, 9.0], [-3.5, 0.85, 7.9]], look: [[5.2, 0.4, -30], [5.0, 0.3, -30]], fov: 30, fstop: 4 },
      phone: { pos: [[3.2, 0.9, 10.5], [2.9, 0.9, 9.6]], look: [[-3.7, 1.6, -12], [-3.5, 1.5, -12]], fov: 52, fstop: 5.6 },
    }],
    lines: [{ at: [0.22, 0.94], text: 'Nice. Private terminal, stand 7.' }],
  },
  {
    id: 'overhead', vh: 90, clock: [m(21, 52), m(22, 4)],
    cams: [{
      desk: { pos: [[1.1, 13.5, 0.2], [1.1, 10.5, 0.2]], look: [[1.1, 0, 0.0], [1.1, 0, 0.0]], up: [[0.1, 0, -1], [-0.04, 0, -1]], fov: 34, fstop: 4 },
      phone: { pos: [[0.9, 21, 0.4], [0.9, 17.5, 0.4]], look: [[0.9, 0, 0.2], [0.9, 0, 0.2]], up: [[0.1, 0, -1], [-0.04, 0, -1]], fov: 44, fstop: 4 },
    }],
    lines: [{ at: [0.1, 0.92], text: 'It was washed at nine. The tank is full.' }],
  },
  {
    id: 'flank', vh: 110, clock: [m(22, 5), m(22, 17)],
    cams: [{
      desk: { pos: [[-1.75, 0.42, -3.9], [-2.05, 0.48, -2.4], [-2.45, 0.52, -0.9]], look: [[-0.8, 0.55, 1.8], [-0.8, 0.58, 1.9], [-0.85, 0.6, 2.6]], fov: 30, fstop: 2.0 },
      phone: { pos: [[-2.7, 0.55, -5.4], [-2.9, 0.62, -4.0], [-3.1, 0.7, -2.4]], look: [[-0.2, 0.75, 1.2], [-0.25, 0.72, 1.6], [-0.3, 0.7, 2.2]], fov: 60, fstop: 2.0 },
    }],
    lines: [{ at: [0.12, 0.92], text: 'The seat is already set for your height.' }],
  },
  {
    id: 'final', vh: 170, clock: [m(22, 18), m(22, 39)],
    cams: [{
      // low over the wet apron, so every light out on the airfield draws a streak toward the lens
      desk: { pos: [[-5.6, 0.62, -10.6], [-5.3, 0.6, -10.0]], look: [[397, -16, 719], [397, -18, 719]], fov: 20, fstop: 1.8, focus: 'far' },
      phone: { pos: [[-4.3, 1.5, -8.0], [-3.9, 1.45, -7.4]], look: [[397, 34, 719], [397, 28, 719]], fov: 60, fstop: 1.8, focus: 'far' },
    }],
    lines: [
      { at: [0.05, 0.44], text: 'We follow your tail number, not the timetable.' },
      { at: [0.5, 0.95], text: 'Your plane is on final.' },
    ],
    captions: [
      { at: [0.26, 0.7], text: '[A jet, far out over the bay]' },
      { at: [0.8, 0.99], text: '[Reverse thrust, a long way off]' },
    ],
  },
  {
    id: 'door', vh: 100, clock: [m(22, 40), m(22, 51)],
    cams: [{
      desk: { pos: [[-6.9, 0.42, 1.7], [-6.2, 0.44, 1.4]], look: [[1.6, 1.0, -0.7], [1.6, 1.0, -0.6]], fov: 30, fstop: 2.2 },
      phone: { pos: [[-9.6, 0.55, 2.4], [-8.8, 0.55, 2.0]], look: [[2.0, 1.6, -0.9], [2.0, 1.6, -0.8]], fov: 54, fstop: 2.2 },
    }],
    lines: [{ at: [0.14, 0.92], text: 'Wheels down.' }],
    captions: [{ at: [0.16, 0.66], text: '[A hangar door rolls open]' }],
  },
  {
    id: 'start', vh: 260, clock: [m(22, 52), m(22, 52)],
    cams: [
      {
        until: 0.46,
        desk: { pos: [[2.65, 0.58, 3.1]], look: [[-0.25, 0.55, 0.35]], fov: 34, fstop: 1.8 },
        phone: { pos: [[4.8, 0.82, 5.7]], look: [[-0.1, 1.05, 0.3]], fov: 56, fstop: 1.8 },
      },
      {
        until: 0.64,
        desk: { pos: [[2.75, 0.46, -4.7], [2.55, 0.5, -4.45]], look: [[0.1, 0.6, -1.7], [0.05, 0.6, -1.7]], fov: 34, fstop: 1.8 },
        phone: { pos: [[4.6, 0.7, -7.6], [4.3, 0.7, -7.2]], look: [[0.1, 0.7, -1.6], [0.05, 0.7, -1.6]], fov: 54, fstop: 1.8 },
      },
      {
        until: 1,
        move: [0, 0.78],
        desk: { pos: [[2.65, 0.58, 3.1], [1.95, 0.62, 3.45], [1.3, 0.66, 3.55]], look: [[-0.25, 0.55, 0.35], [0.3, 0.58, 1.4], [0.6, 0.6, 2.05]], fov: 34, fstop: 1.6 },
        phone: { pos: [[4.8, 0.82, 5.7], [4.2, 0.8, 5.2], [3.6, 0.77, 4.8]], look: [[-0.1, 1.05, 0.3], [0.1, 1.0, 0.8], [0.3, 0.95, 1.2]], fov: 56, fstop: 1.6 },
      },
    ],
    lines: [{ at: [0.7, 0.99], text: 'Ready when you are.' }],
    captions: [{ at: [0.12, 0.3], text: '[The locks open]' }, { at: [0.34, 0.62], text: 'engine' }],
  },
  {
    // V5: longer, and it ends on black (main.js fades it), so the cars' title comes up the screen in the dark
    id: 'evening', vh: 90, clock: [m(22, 53), m(22, 53)],
    cams: [{
      desk: { pos: [[1.3, 0.66, 3.55], [2.3, 0.7, 4.4]], look: [[0.6, 0.6, 2.05], [-0.1, 0.6, 0.5]], fov: 34, fstop: 1.8 },
      phone: { pos: [[4.6, 0.8, 6.4], [6.2, 0.9, 7.8]], look: [[0.3, 1.15, 1.2], [-0.1, 1.35, 0.3]], fov: 56, fstop: 1.8 },
    }],
    lines: [{ at: [0.06, 0.6], text: 'Good evening.' }],
  },
];

// After the film: the casting reel, the running order, the request, the credits.
export const PAGE_CAMS = {
  cars: {
    desk: { pos: [[-3.9, 0.72, 5.6], [-3.5, 0.74, 5.1]], look: [[0.55, 0.85, -0.6], [0.5, 0.85, -0.6]], fov: 30, fstop: 2.4 },
    phone: { pos: [[-6.6, 1.0, 9.6], [-6.0, 1.0, 8.8]], look: [[0.3, 0.72, -0.6], [0.3, 0.72, -0.6]], fov: 56, fstop: 2.4 },
  },
  order: {
    desk: { pos: [[-1.4, 17, 1.2], [-1.4, 15.5, 1.2]], look: [[-1.4, 0, 1.0], [-1.4, 0, 1.0]], up: [[0, 0, -1], [0.06, 0, -1]], fov: 36, fstop: 4 },
    phone: { pos: [[0.6, 24, 0.6], [0.6, 22, 0.6]], look: [[0.6, 0, 0.4], [0.6, 0, 0.4]], up: [[0, 0, -1], [0.06, 0, -1]], fov: 44, fstop: 4 },
  },
  request: {
    desk: { pos: [[-5.2, 0.62, 6.4], [-4.8, 0.64, 5.9]], look: [[3.2, 1.25, -1.4], [3.0, 1.25, -1.4]], fov: 30, fstop: 2.2 },
    phone: { pos: [[6.0, 0.9, 8.4], [5.6, 0.9, 7.9]], look: [[-0.2, 2.2, -0.4], [-0.2, 2.2, -0.4]], fov: 54, fstop: 2.2 },
  },
};

export const totalVh = SHOTS.reduce((s, x) => s + x.vh, 0);
let acc = 0;
for (const s of SHOTS) { s.p0 = acc / totalVh; acc += s.vh; s.p1 = acc / totalVh; }
