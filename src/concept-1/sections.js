// V6: the three sections Sam picked from the demo round of 14 Nov (Teach/c1-v6/demo/, every option
// still playable in versions/c1-v6-demo/): the drive-away is Chase, How it works is Runway, the terms
// are Trip. main.js calls these at three points of its frame.
import { createChase } from './chase.js';
import { createRunway } from './runway.js';
import { createTrip } from './trip.js';

export function createSections(ctx) {
  const parts = [createChase(ctx), createRunway(ctx), createTrip(ctx)];
  const runway = parts[1];
  parts[2].ready();
  return {
    // after the page has set where the camera wants to be, before it eases there
    camera(sec, y, want, dt) { for (const p of parts) if (p.camera) p.camera(sec, y, want, dt); },
    // How it works is drawn by the runway
    how(p) { return runway.update(p); },
    // after the camera is placed and the cars are lit, before the frame is drawn
    after(sec, y, dt, t) { for (const p of parts) if (p.after) p.after(sec, y, dt, t); },
  };
}
