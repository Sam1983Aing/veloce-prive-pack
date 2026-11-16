// The six works in the collection, with the loan terms a borrower needs.
// Every price on the page comes from here. All fees in euros, taxes included.

export const C2V3_FLEET = [
  {
    id: 'redspider',
    number: '01',
    roomIndex: 0,
    title: 'The Red Spider',
    short: 'the Red Spider',
    origin: 'Maranello, 2012',
    // the museum caption under the name on the wall
    engine: '4.5 litre V8, 570 PS',
    paintName: 'Painted red',
    line: 'One of the last mid-engine V8s built without turbos. Four and a half litres, nine thousand rpm, and the roof folds away in fourteen seconds.',
    city: 'Monaco',
    rates: { day: 2400, three: 6500, week: 14000, month: 42000 },
    deposit: 15000,
    kmPerDay: 200,
    extraKm: 5,
    minAge: 25,
    licenceYears: 3,
    reservedUntil: null,
    // the condition report, pinned to the car: nose, front wheel, cabin, tail
    condition: [
      'Factory paint. One chip on the nose, touched in.',
      'A 2 cm kerb mark on this rim, recorded.',
      'Roof folds in fourteen seconds. New seals in 2025.',
      'Exhausts and diffuser clean. No marks.',
    ],
    // its room, lined like Maranello: warm terracotta plaster
    room: { wall: 0x8b6347 },
    // its film, thrown across the whole right-hand wall while the room goes dark (Projector.js):
    // Coast Run (Seedance 2.5, Sam's pick, 15 Nov), /films/room-01.mp4.
    // z is along the wall from the room's centre, y the picture's centre, width in metres (16:9)
    film: { wall: 'right', z: 0, y: 2.42, width: 7.9 },
    glbUrl: (import.meta.env.BASE_URL + 'models/gallery/red-spider.glb'),
    rotY: 0,
    targetLength: 4.534,
    rideHeightOffset: -0.014,
    paintHex: 0x740004,
    paintRoughness: 0.3,
    paintMetalness: 0.24,
    caliperHex: 0xd4a017,
    leatherHex: 0x884f26,
  },
  {
    id: 'silvercoupe',
    number: '02',
    roomIndex: 1,
    title: 'The Silver Coupe',
    short: 'the Silver Coupe',
    origin: 'Stuttgart, 2018',
    // the museum caption under the name on the wall
    engine: '4.0 litre flat six, 500 PS',
    paintName: 'Painted silver',
    line: 'A four-litre flat six with no turbos, built to rev to nine thousand. The quietest car in the collection until it isn’t.',
    city: 'Geneva',
    rates: { day: 2100, three: 5700, week: 12200, month: 36500 },
    deposit: 12000,
    kmPerDay: 200,
    extraKm: 5,
    minAge: 25,
    licenceYears: 3,
    reservedUntil: null,
    // the condition report, pinned to the car: nose, front wheel, cabin, tail
    condition: [
      'Clear film over the nose and mirrors.',
      'Centre-lock wheels, torqued at the last service.',
      'Bucket seats, leather fed in October.',
      'Rear wing and vents unmarked.',
    ],
    // its room, lined like Stuttgart: pale board-marked concrete (lettering and label in ink)
    room: { wall: 0x8e8c86, pattern: 'boards', ink: true },
    // its film on the left-hand wall: Alpine Pass at Dawn (Seedance 2.5, Sam's pick, 15 Nov), /films/room-02.mp4
    film: { wall: 'left', z: 0, y: 2.42, width: 7.9 },
    glbUrl: (import.meta.env.BASE_URL + 'models/gallery/silver-coupe.glb'),
    rotY: Math.PI,
    straightenFrontWheels: true, // the file has them steered
    targetLength: 4.52,
    rideHeightOffset: 0.0,
    paintHex: 0x9aa3ad,
    paintRoughness: 0.2,
    paintMetalness: 0.72,
    caliperHex: 0xc4161c,
    leatherHex: 0x1c1c1e,
  },
  {
    id: 'greenv12',
    number: '03',
    roomIndex: 2,
    title: 'The Green V12',
    short: 'the Green V12',
    origin: 'Sant’Agata Bolognese, 2012',
    // the museum caption under the name on the wall
    engine: '6.5 litre V12, 700 PS',
    paintName: 'Painted green',
    line: 'Six and a half litres and twelve cylinders, mounted behind your shoulders. The doors open upwards, so mind the ceiling in hotel garages.',
    city: 'Milan',
    rates: { day: 3400, three: 9200, week: 19800, month: 59000 },
    deposit: 25000,
    kmPerDay: 200,
    extraKm: 8,
    minAge: 25,
    licenceYears: 3,
    reservedUntil: null,
    // the condition report, pinned to the car: nose, front wheel, cabin, tail
    condition: [
      'Nose lift works. Use it on every ramp.',
      'Carbon-ceramic brakes, 40% worn.',
      'Roof lining in suede, no wear.',
      'Faint heat marks at the exhausts, normal.',
    ],
    // its room, lined like Sant'Agata: dark hexagon panels
    room: { wall: 0x3c3a37, pattern: 'hex' },
    // its film on the right-hand wall: Red Rock Canyon at Sunset (Seedance 2.5, Sam's pick, 15 Nov), /films/room-03.mp4
    film: { wall: 'right', z: 0, y: 2.42, width: 7.9 },
    glbUrl: (import.meta.env.BASE_URL + 'models/gallery/green-v12.glb'),
    rotY: -Math.PI / 2,
    targetLength: 4.78,
    rideHeightOffset: 0.0,
    paintHex: 0x2f7a0c,
    paintRoughness: 0.24,
    paintMetalness: 0.45,
    caliperHex: 0x1e1e1e,
    leatherHex: 0x1a1918,
  },
  {
    id: 'yellowwedge',
    number: '04',
    roomIndex: 3,
    title: 'The Yellow Wedge',
    short: 'the Yellow Wedge',
    origin: 'Sant’Agata Bolognese, 2010',
    // the museum caption under the name on the wall
    engine: '5.2 litre V10, 560 PS',
    paintName: 'Painted yellow',
    line: 'Five point two litres of V10 behind your back and all four wheels driven. The younger sibling of room 03, and the one people actually drove.',
    city: 'Monaco',
    rates: { day: 1900, three: 5100, week: 11000, month: 33000 },
    deposit: 12000,
    kmPerDay: 200,
    extraKm: 5,
    minAge: 25,
    licenceYears: 3,
    reservedUntil: null,
    // the condition report, pinned to the car: nose, front wheel, cabin, tail
    condition: [
      'Bonnet repainted in 2019, matched to the car.',
      'Original wheels, refinished.',
      'Six-speed manual in the open gate. A rare one.',
      'Engine cover glass clear. Tips polished.',
    ],
    // its room, lined like Sant'Agata's old town: grey sandstone in blocks, the pietra serena of Emilia
    room: { wall: 0x5a5650, pattern: 'ashlar' },
    // its film on the left-hand wall: public/films/room-04.mp4 (Kling 4.0, the salt flats, approved by Sam 14 Nov)
    film: { wall: 'left', z: 0, y: 2.42, width: 7.9 },
    glbUrl: (import.meta.env.BASE_URL + 'models/gallery/yellow-wedge.glb'),
    rotY: Math.PI,
    targetLength: 4.345,
    rideHeightOffset: 0.0,
    paintHex: 0xffc600,
    paintRoughness: 0.2,
    paintMetalness: 0.2,
    caliperHex: 0x1e1e1e,
    leatherHex: 0x1a1918,
  },
  {
    id: 'whitetrack',
    number: '05',
    roomIndex: 4,
    title: 'The White Track Car',
    short: 'the White Track Car',
    origin: 'Woking, 2018',
    // the museum caption under the name on the wall
    engine: '4.0 litre twin-turbo V8, 800 PS',
    paintName: 'Painted white',
    run: 'One of 500',
    line: 'Eight hundred PS from a twin-turbo V8 and glass in the lower doors, so you watch the road pass beside your knees.',
    city: 'Dubai',
    rates: { day: 4200, three: 11300, week: 24500, month: null },
    deposit: 40000,
    kmPerDay: 150,
    extraKm: 12,
    minAge: 30,
    licenceYears: 5,
    reservedUntil: null,
    // the condition report, pinned to the car: nose, front wheel, cabin, tail
    condition: [
      'Two light scrapes under the splitter, recorded.',
      'Track tyres, 70% left. Cold, they slide.',
      'Glass in both doors, no cracks.',
      'The wing moves under braking. Checked weekly.',
    ],
    // its room, lined like Woking: clean white (lettering and label in ink)
    room: { wall: 0xbcb9b3, pattern: 'smooth', ink: true },
    // its film on the right-hand wall: public/films/room-05.mp4 (Kling 4.0, the runway at sunset, approved by Sam 14 Nov)
    film: { wall: 'right', z: 0, y: 2.42, width: 7.9 },
    glbUrl: (import.meta.env.BASE_URL + 'models/gallery/white-track-car.glb'),
    rotY: Math.PI,
    targetLength: 4.64,
    rideHeightOffset: 0.0,
    paintHex: 0xd0cec8,
    paintRoughness: 0.26,
    paintMetalness: 0.05,
    caliperHex: 0x24282c,
    leatherHex: 0x1a1a1c,
  },
  {
    id: 'bluehyper',
    number: '06',
    roomIndex: 5,
    title: 'The Blue Hypercar',
    short: 'the Blue Hypercar',
    origin: 'Molsheim, 2020',
    // the museum caption under the name on the wall
    engine: '8.0 litre W16, 1,500 PS',
    paintName: 'Painted blue',
    run: 'One of 60',
    line: 'Eight litres, sixteen cylinders, four turbos, fifteen hundred PS. Sixty were made. This one has done eleven thousand kilometres.',
    city: 'Miami',
    rates: { day: 5800, three: 15600, week: 33800, month: null },
    deposit: 100000,
    kmPerDay: 150,
    extraKm: 25,
    minAge: 30,
    licenceYears: 5,
    reservedUntil: '2026-11-14',
    // the condition report, pinned to the car: nose, front wheel, cabin, tail
    condition: [
      'Grille free of stone marks.',
      'New tyres at 10,000 km.',
      'Leather and carbon, as delivered.',
      'Light bar whole. Exhaust clean.',
    ],
    // its room, lined like Molsheim: blue-grey plaster over oak panelling
    room: { wall: 0x4b5563, pattern: 'dado' },
    // its film on the left-hand wall: public/films/room-06.mp4 (Kling 4.0, the Monaco street circuit, take 2, approved by Sam 14 Nov)
    film: { wall: 'left', z: 0, y: 2.42, width: 7.9 },
    glbUrl: (import.meta.env.BASE_URL + 'models/gallery/blue-hypercar.glb'),
    rotY: Math.PI,
    straightenFrontWheels: true, // the file has them steered
    targetLength: 4.56,
    rideHeightOffset: 0.0,
    paintHex: 0x0b3884,
    paintRoughness: 0.22,
    paintMetalness: 0.52,
    caliperHex: 0x202428,
    leatherHex: 0x1d1c1b,
  },
];

export const C2V3_CITIES = ['Monaco', 'Geneva', 'Milan', 'Dubai', 'Miami'];

const EUROPE = new Set(['Monaco', 'Geneva', 'Milan']);

// How long it takes to bring a car from where it's kept to another city.
export function transferNote(car, city) {
  if (!car || city === car.city) return '';
  const bothEurope = EUROPE.has(car.city) && EUROPE.has(city);
  return bothEurope
    ? `Kept in ${car.city}: allow two days to bring it to ${city}.`
    : `Kept in ${car.city}: allow ten days to bring it to ${city}.`;
}

export function formatEuro(n) {
  return `€${Math.round(n).toLocaleString('en-GB')}`;
}

// The cheapest mix of the four loan periods that covers the dates.
export function loanFee(car, days) {
  const packs = [
    [1, car.rates.day],
    [3, car.rates.three],
    [7, car.rates.week],
  ];
  if (car.rates.month) packs.push([28, car.rates.month]);
  const best = new Array(days + 1).fill(Infinity);
  best[0] = 0;
  for (let d = 1; d <= days; d++) {
    for (const [len, price] of packs) {
      best[d] = Math.min(best[d], best[Math.max(0, d - len)] + price);
    }
  }
  return best[days];
}
