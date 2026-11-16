import * as THREE from 'three';
import {
  makeGalleryMaterial,
  roomCenterZ,
  ROOM_PITCH,
  ROOM_HALF_DEPTH,
  ROOM_HALF_WIDTH,
  ROOM_HEIGHT,
  WALL,
  HALL_FRONT,
  HALL_DEPTH,
  HALL_HALF_WIDTH,
  HALL_HEIGHT,
  ROOM_COUNT,
  DOOR_HALF,
  DOOR_HEIGHT,
} from './C2V3Light.js';

// A row of rooms (one per car) along -Z behind an entrance hall. Every surface the visitor sees is
// built here: plaster walls with doorways on the axis, blackened steel reveals with a warm line of
// light inside each, the stone floor, a laylight over each car, the faint warm glow at the foot of the walls.

// The laylight (Sam's pick from three lighting demos): frosted glass in the ceiling over the car,
// in three bays, which are the three banks the doorway handoff strikes one by one.
const LAYLIGHT = { w: 3.0, d: 6.0 };
const LAYLIGHT_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const LAYLIGHT_FRAG = /* glsl */ `
  uniform vec3 uL;
  uniform float uDim;
  varying vec2 vUv;
  // a bar's share of this pixel, so a bar thinner than a pixel fades instead of breaking into dashes
  float bar(float g, float hw) {
    float f = abs(fract(g + 0.5) - 0.5);
    float fw = fwidth(g);
    return clamp(0.5 + (hw - f) / fw, 0.0, 1.0) * clamp(2.0 * hw / fw, 0.0, 1.0);
  }
  void main() {
    float bay = floor(clamp(vUv.x, 0.0, 0.999) * 3.0);
    float l = bay < 0.5 ? uL.x : bay < 1.5 ? uL.y : uL.z;
    // frosted glass: brightest in the middle of each bay and of the run, a little darker at its edge
    float bx = fract(vUv.x * 3.0);
    float glow = 0.62 + 0.38 * sin(3.14159 * bx) * (0.75 + 0.25 * sin(3.14159 * vUv.y));
    vec2 e = min(vUv, 1.0 - vUv) * vec2(${LAYLIGHT.w.toFixed(1)}, ${LAYLIGHT.d.toFixed(1)});
    glow *= 0.82 + 0.18 * smoothstep(0.0, 0.18, min(e.x, e.y));
    // 16 mm bronze glazing bars between the bays and every 0.6 m along the run
    float bars = max(bar(vUv.x * 3.0, 0.008), bar(vUv.y * 10.0, 0.008 / 0.6));
    gl_FragColor = vec4(mix(vec3(1.0, 0.95, 0.88) * l * 0.95 * glow, vec3(0.16, 0.12, 0.08) * l, bars) * uDim, 1.0);
  }
`;
// the sides of the recess the glass sits in, lit by it: brightest at the glass, fading to the ceiling
const COFFER_FRAG = /* glsl */ `
  uniform float uL;
  uniform float uDim;
  varying vec2 vUv;
  void main() {
    float t = vUv.y;
    gl_FragColor = vec4(vec3(1.0, 0.93, 0.84) * uL * (0.03 + 0.24 * t * t * t) * uDim, 1.0);
  }
`;
const COFFER = { depth: 0.14, bezel: 0.03 };
const AMBER = new THREE.Color(1.0, 0.82, 0.62);

export class C2V3Showroom {
  constructor(scene, envMap) {
    this.scene = scene;
    this.envMap = envMap;
    this.group = new THREE.Group();
    this.group.name = 'showroom';
    scene.add(this.group);

    // the hall's plaster in oxblood, the red-brown of old picture galleries (Sam's pick from three
    // colours, the others kept in Teach/c2-v3/demo/hall/code/). The rooms each get their own.
    this.wallMat = makeGalleryMaterial('wall', { color: 0x351918 });
    this.floorMat = makeGalleryMaterial('floor', { color: 0x2a2622 });
    this.ceilingMat = makeGalleryMaterial('ceiling', { color: 0x1d1b19 });
    // the doorway reveals catch the strips, so crossing a threshold shows lit steel, not a black jamb
    this.steelMat = new THREE.MeshStandardMaterial({
      color: 0x55514c,
      metalness: 1,
      roughness: 0.3,
      envMap,
      envMapIntensity: 1.25,
    });

    this.rooms = [];
    this.laylights = [];
    this.coffers = [];
    this.bankLevels = Array.from({ length: ROOM_COUNT }, () => [0, 0, 0]);
    this.doorLines = []; // the hall's doorway first, then the one at the end of each room
    this.doorSteel = []; // each doorway's own steel, so it can stay dark until its room is lit
    this.wallParts = []; // every wall block, with the room on its +z face and on its -z face (-1 = the hall)
    this._buildFloor();
    this._buildHall();
    for (let i = 0; i < ROOM_COUNT; i++) this._buildRoom(i);
  }

  _box(w, h, d, x, y, z, mat, parent = this.group) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  _buildFloor() {
    const zFar = roomCenterZ(ROOM_COUNT - 1) - ROOM_HALF_DEPTH - WALL;
    const zNear = HALL_FRONT + HALL_DEPTH;
    const geo = new THREE.PlaneGeometry(ROOM_HALF_WIDTH * 2 + 1, zNear - zFar);
    geo.rotateX(-Math.PI / 2);
    this.floor = new THREE.Mesh(geo, this.floorMat);
    this.floor.position.set(0, 0, (zNear + zFar) / 2);
    this.floor.name = 'floor';
    this.group.add(this.floor);
  }

  _wall(w, h, d, x, y, z, rooms, parent) {
    const mesh = this._box(w, h, d, x, y, z, this.wallMat, parent);
    this.wallParts.push({ mesh, ...rooms });
    return mesh;
  }

  // A cross wall with a doorway on the axis: two piers and a lintel, steel in the reveal.
  // rooms: the room on its +z face (front) and on its -z face (back).
  _crossWall(zCenter, halfWidth, height, withDoor, parent, rooms) {
    const t = WALL;
    if (!withDoor) {
      this._wall(halfWidth * 2, height, t, 0, height / 2, zCenter, rooms, parent);
      return;
    }
    const pierW = halfWidth - DOOR_HALF;
    this._wall(pierW, height, t, -(DOOR_HALF + pierW / 2), height / 2, zCenter, rooms, parent);
    this._wall(pierW, height, t, DOOR_HALF + pierW / 2, height / 2, zCenter, rooms, parent);
    this._wall(DOOR_HALF * 2, height - DOOR_HEIGHT, t, 0, DOOR_HEIGHT + (height - DOOR_HEIGHT) / 2, zCenter, rooms, parent);
    // blackened steel lining the reveal: the jambs run to the top, the head fits between them, so no
    // two faces lie on top of each other at the corners
    const s = 0.035;
    const steel = this.steelMat.clone();
    this.doorSteel.push(steel);
    this._box(s, DOOR_HEIGHT, t + 0.012, -DOOR_HALF + s / 2, DOOR_HEIGHT / 2, zCenter, steel, parent);
    this._box(s, DOOR_HEIGHT, t + 0.012, DOOR_HALF - s / 2, DOOR_HEIGHT / 2, zCenter, steel, parent);
    this._box(DOOR_HALF * 2 - 2 * s, s, t + 0.012, 0, DOOR_HEIGHT - s / 2, zCenter, steel, parent);
    // a warm line of light on the steel, round the inside of the frame. The head runs out to the
    // uprights' outer edges and the uprights stop under it, so each corner is one square L (Sam,
    // 5 Nov: the head stopped short and the uprights fell 5 mm below its top, a notch in every corner)
    const line = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const lw = 0.02;
    const lx = DOOR_HALF - s - lw / 2; // against the steel
    const top = DOOR_HEIGHT - s; // under the steel head
    for (const side of [-1, 1]) this._box(lw, top - lw, 0.03, side * lx, (top - lw) / 2, zCenter, line, parent);
    this._box(2 * (lx + lw / 2), lw, 0.03, 0, top - lw / 2, zCenter, line, parent);
    this.doorLines.push(line);
  }

  _buildHall() {
    const g = new THREE.Group();
    g.name = 'hall';
    this.group.add(g);
    const zBack = HALL_FRONT + HALL_DEPTH;
    const zMid = HALL_FRONT + HALL_DEPTH / 2;
    // the front wall of the hall is the outer face of room 01's front wall: built tall here
    this._crossWall(HALL_FRONT - WALL / 2, HALL_HALF_WIDTH, HALL_HEIGHT, true, g, { front: -1, back: 0 });
    // the back wall, behind the visitor
    this._box(HALL_HALF_WIDTH * 2, HALL_HEIGHT, WALL, 0, HALL_HEIGHT / 2, zBack + WALL / 2, this.wallMat, g);
    for (const side of [-1, 1]) {
      this._box(WALL, HALL_HEIGHT, HALL_DEPTH, side * (HALL_HALF_WIDTH + WALL / 2), HALL_HEIGHT / 2, zMid, this.wallMat, g);
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALL_HALF_WIDTH * 2, HALL_DEPTH), this.ceilingMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, HALL_HEIGHT, zMid);
    g.add(ceil);
    // three round downlights, over the pools of light on the hall floor
    this.hallLampMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (const [x, z] of [[-2.8, 11.5], [2.8, 11.5], [0, 8.2]]) {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.075, 32), this.hallLampMat);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(x, HALL_HEIGHT - 0.004, z);
      g.add(lamp);
    }
    this.hall = g;
  }

  _buildRoom(i) {
    const zC = roomCenterZ(i);
    const g = new THREE.Group();
    g.name = `room-${i + 1}`;
    this.group.add(g);

    // side walls
    for (const side of [-1, 1]) {
      this._wall(WALL, ROOM_HEIGHT, ROOM_PITCH + WALL, side * (ROOM_HALF_WIDTH + WALL / 2), ROOM_HEIGHT / 2, zC, { front: i, back: i }, g);
    }
    // the wall at the far end of this room (the last room's has no door)
    const last = i === ROOM_COUNT - 1;
    this._crossWall(zC - ROOM_HALF_DEPTH - WALL / 2, ROOM_HALF_WIDTH, ROOM_HEIGHT, !last, g, { front: i, back: last ? i : i + 1 });
    // room 01's front wall is the hall's tall front wall, built in _buildHall

    // ceiling, with the laylight set 14 cm up into it in a thin dark bronze frame (Sam, 5 Nov: a
    // border and a slight change of level, rather than a lit sheet laid flat on the ceiling)
    const ow = LAYLIGHT.w / 2 + COFFER.bezel;
    const od = LAYLIGHT.d / 2 + COFFER.bezel;
    const rect = (hw, hd) => new THREE.Path([new THREE.Vector2(-hw, -hd), new THREE.Vector2(hw, -hd), new THREE.Vector2(hw, hd), new THREE.Vector2(-hw, hd)]);
    const ceilShape = new THREE.Shape(rect(ROOM_HALF_WIDTH, ROOM_HALF_DEPTH).getPoints());
    ceilShape.holes.push(rect(ow, od));
    const ceil = new THREE.Mesh(new THREE.ShapeGeometry(ceilShape), this.ceilingMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, ROOM_HEIGHT, zC);
    g.add(ceil);

    const top = ROOM_HEIGHT + COFFER.depth;
    const glass = new THREE.ShaderMaterial({
      uniforms: { uL: { value: new THREE.Vector3() }, uDim: { value: 1 } },
      vertexShader: LAYLIGHT_VERT,
      fragmentShader: LAYLIGHT_FRAG,
    });
    const laylight = new THREE.Mesh(new THREE.PlaneGeometry(LAYLIGHT.w, LAYLIGHT.d), glass);
    laylight.rotation.x = Math.PI / 2;
    laylight.position.set(0, top, zC);
    g.add(laylight);
    const bezelShape = new THREE.Shape(rect(ow, od).getPoints());
    bezelShape.holes.push(rect(LAYLIGHT.w / 2, LAYLIGHT.d / 2));
    const bezel = new THREE.Mesh(new THREE.ShapeGeometry(bezelShape), new THREE.MeshBasicMaterial({ color: 0x1c1611 }));
    bezel.rotation.x = Math.PI / 2;
    bezel.position.set(0, top - 0.001, zC);
    g.add(bezel);
    const coffer = new THREE.ShaderMaterial({
      uniforms: { uL: { value: 0 }, uDim: { value: 1 } },
      vertexShader: LAYLIGHT_VERT,
      fragmentShader: COFFER_FRAG,
      side: THREE.DoubleSide,
    });
    for (const [len, x, z, ry] of [
      [od * 2, -ow, zC, Math.PI / 2],
      [od * 2, ow, zC, Math.PI / 2],
      [ow * 2, 0, zC - od, 0],
      [ow * 2, 0, zC + od, 0],
    ]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(len, COFFER.depth), coffer);
      side.position.set(x, ROOM_HEIGHT + COFFER.depth / 2, z);
      side.rotation.y = ry;
      g.add(side);
    }
    this.laylights.push(glass);
    this.coffers.push(coffer);

    const stand = new THREE.Group();
    stand.position.set(0, 0, zC);
    g.add(stand);

    this.rooms.push({ index: i, zC, group: g, stand, car: null, shadow: null, line: null });
  }

  setHallLevel(v) {
    this.hallLampMat.color.setRGB(1.0, 0.92, 0.82).multiplyScalar(5 * v);
  }

  // Give each room its own walls: matFor(i) returns room i's material, or null to keep the
  // plaster. A wall between two rooms wears the front room's on its +z face, the back room's on -z.
  setWallMaterials(matFor) {
    for (const { mesh, front, back } of this.wallParts) {
      const f = (front >= 0 && matFor(front)) || this.wallMat;
      const b = (back >= 0 && matFor(back)) || this.wallMat;
      // BoxGeometry faces: +x, -x, +y, -y, +z, -z
      mesh.material = front === back ? f : [f, f, f, f, f, b];
    }
  }

  // the three bays of room i's laylight
  setBankLevels(i, levels) {
    this.bankLevels[i] = levels;
    this.laylights[i].uniforms.uL.value.set(levels[0], levels[1], levels[2]);
    this.coffers[i].uniforms.uL.value = (levels[0] + levels[1] + levels[2]) / 3;
  }

  // each doorway's line follows the room beyond it, and stays faintly lit all evening
  // Doorway k leads into room k: its evening glow comes on with that room's (`rooms[k]`), and its
  // steel catches light only once a room on either side of it (or the hall, for the first) is lit,
  // so on the way in the doorways come out of the dark one after another.
  updateDoorLines(night, rooms, hall = 1) {
    const avg = (l) => (l[0] + l[1] + l[2]) / 3;
    this.doorLines.forEach((m, k) => {
      const i = Math.min(k, ROOM_COUNT - 1);
      const evening = night * (rooms ? rooms[i] : 1);
      const beyond = avg(this.bankLevels[i]);
      m.color.copy(AMBER).multiplyScalar((0.3 * evening + 0.7 * beyond) * 1.3);
      const before = k === 0 ? hall : avg(this.bankLevels[k - 1]);
      this.doorSteel[k].envMapIntensity = 1.25 * Math.min(1, Math.max(evening, beyond, before));
    });
  }

  // the glass is dimmed in the floor's reflection only, so a walk under it never lays a bright
  // slab across the floor; the cars keep their full reflection
  setReflectionPass(on) {
    for (const m of [...this.laylights, ...this.coffers]) m.uniforms.uDim.value = on ? 0.18 : 1;
  }
}
