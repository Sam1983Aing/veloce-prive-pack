// Concept 1 V4: the five cars, in the order they stand in the row.
// Copy follows briefs/10-c1-v4.md: every car with its year, engine, trim, kilometres, service,
// availability, a line of character, a condition note per stop of the walk-around and a logbook entry.
// Prices in euros, VAT included.

export const BAY_SPACING = 6.4;

// V7: every paint is a softer coloured base under a sharp clear coat (0.025): the base carries the
// colour as a smooth gradient across each panel, the clear coat the crisp reflections on top, as on a
// real car. Metallics stay at 0.28 to 0.3: rougher (0.4 was tried) averaged the dark studio into flat grey.
export const FLEET = [
  {
    id: 'redspider',
    railShort: 'Spider',
    railModel: 'Spider',
    num: '01',
    make: 'Red',
    model: 'Spider',
    short: 'Red',
    fullName: 'Red Spider',
    paintName: 'Racing red',
    paintHex: 0xbc0012,
    paintCss: '#bc0012',
    // V5 round 2: C2 V3's Red paint. A deep base at low metalness, so the clear coat's reflections sit
    // white on top of the red instead of tinting it: that is what reads as depth.
    paintBodyHex: 0x740004,
    paint: { metalness: 0.24, roughness: 0.34, clearcoatRoughness: 0.025, specularIntensity: 0.08 },
    city: 'Monaco',
    rates: { day: 2400, three: 6500, week: 14000, deposit: 15000, km: 250, extraKm: 8, month: 42000 },
    driveLine: 'Monaco to the Col de Turini before breakfast.',
    glbUrl: (import.meta.env.BASE_URL + 'models/concepts/red-spider.glb'),
    rotY: 0,
    targetLength: 4.534,
    rideHeightOffset: -0.014,
    audioProfile: {
      type: 'V8_FLAT', redlineRpm: 9000, idleRpm: 1050, baseFireFreq: 54.0, harmonicMultiplier: 1.5,
      exhaustCutoffBase: 260, exhaustCutoffSpan: 540, turboWhistle: 0.0, crackleIntensity: 0.72,
    },
    year: 2013,
    spec: '4.5 litre V8, 570 PS',
    trim: 'Racing red over tan leather',
    km: '11,400 km',
    service: 'Serviced in October',
    availInDays: 0, // free from today plus this many days
    minAge: 25,
    licenceYears: 3,
    line: 'The last mid-engine V8 without turbos, and the one people turn round for on the Boulevard des Moulins. Best with the roof down and the windows up.',
    log: { date: '30 Oct', route: 'Hôtel de Paris to Èze for lunch, the long way.', note: 'Delivered at 6.40, collected from the harbour at four.' },
    notes: [
      { headline: 'New tyres in September.', body: 'Track tyres, 2,000 km on them. Give them two corners of warmth before you lean on them.' },
      { headline: 'Tan leather, fed in October.', body: 'The roof folds in fourteen seconds. We set the seat and mirrors to your height before it leaves us.' },
      { headline: '4.5 litres. No turbos.', body: 'Serviced at 11,000 km. It revs to 9,000 and sounds like it the whole way.' },
    ],
  },
  {
    id: 'silvercoupe',
    envBoost: 1.12, // V5 round 2: a sharper silver reflects more of the dark room; a little more studio keeps it silver
    railShort: 'Coupe',
    railModel: 'Coupe',
    num: '02',
    make: 'Silver',
    model: 'Coupe',
    short: 'Silver',
    fullName: 'Silver Coupe',
    paintName: 'Silver',
    paintHex: 0x9aa3ad, // V5 round 2: C2 V3's Silver
    paintCss: '#9aa4b2',
    // after round 2: C2's 0.72 / 0.2 read as polished chrome here, V4's 0.66 / 0.34 as primer; between the two
    paint: { metalness: 0.55, roughness: 0.3, clearcoatRoughness: 0.025, specularIntensity: 0.3 },
    city: 'Geneva',
    rates: { day: 1900, three: 5100, week: 11000, deposit: 10000, km: 300, extraKm: 6, month: 33000 },
    driveLine: 'Geneva to the Furka Pass before lunch.',
    glbUrl: (import.meta.env.BASE_URL + 'models/concepts/silver-coupe.glb'),
    straightenFrontWheels: true, // the file has them steered
    rotY: Math.PI,
    targetLength: 4.52,
    rideHeightOffset: 0.0,
    audioProfile: {
      type: 'FLAT6', redlineRpm: 7800, idleRpm: 960, baseFireFreq: 46.0, harmonicMultiplier: 1.66,
      exhaustCutoffBase: 280, exhaustCutoffSpan: 610, turboWhistle: 0.25, crackleIntensity: 0.68,
    },
    year: 2014,
    spec: '3.8 litre flat six, 400 PS',
    trim: 'Silver over black leather',
    km: '18,200 km',
    service: 'Serviced in September',
    availInDays: 2, // free from today plus this many days
    minAge: 25,
    licenceYears: 3,
    line: 'The one to take when the forecast is wrong. Four driven wheels, a proper boot for two cases, and still a flat six singing behind you.',
    log: { date: '21 Oct', route: 'Geneva to Zermatt, first snow on the Furka.', note: 'Left at Täsch, as you have to, and collected there three days later.' },
    notes: [
      { headline: 'All four wheels driven.', body: 'Winter tyres fitted from November. Geneva in the rain is not a reason to stay in.' },
      { headline: 'Black leather, Sport Chrono.', body: 'A rev counter in the middle, where it should be. Everything else falls to hand the moment you sit.' },
      { headline: '3.8 litres, flat six, no turbos.', body: 'Hung behind the rear axle. 18,200 km, and it still sings past 7,000.' },
    ],
  },
  {
    id: 'greenv12',
    railShort: 'V12',
    railModel: 'V12',
    num: '03',
    make: 'Green',
    model: 'V12',
    short: 'Green',
    fullName: 'Green V12',
    paintName: 'Arancio Argos',
    paintHex: 0xf04000,
    paintCss: '#ff4500',
    paint: { metalness: 0.45, roughness: 0.3, clearcoatRoughness: 0.025, specularIntensity: 0.1 },
    city: 'Milan',
    rates: { day: 3400, three: 9200, week: 19800, deposit: 25000, km: 200, extraKm: 12, month: 59000 },
    driveLine: 'Milan to the Stelvio by mid morning.',
    glbUrl: (import.meta.env.BASE_URL + 'models/concepts/green-v12.glb'),
    rotY: -Math.PI / 2,
    targetLength: 4.78,
    rideHeightOffset: 0.0,
    audioProfile: {
      type: 'V10_NA', redlineRpm: 8500, idleRpm: 1120, baseFireFreq: 68.0, harmonicMultiplier: 1.5,
      exhaustCutoffBase: 320, exhaustCutoffSpan: 680, turboWhistle: 0.0, crackleIntensity: 0.88,
    },
    year: 2013,
    spec: '6.5 litre V12, 700 PS',
    trim: 'Arancio Argos over black Suede',
    km: '9,600 km',
    service: 'Serviced in August',
    availInDays: 0, // free from today plus this many days
    minAge: 25,
    licenceYears: 3,
    line: 'Twelve cylinders, doors that open to the sky and no subtlety at all. Best driven early, when Milan is still asleep and the Stelvio is empty.',
    log: { date: '17 Oct', route: 'Lake Como, a wedding at Bellagio.', note: 'Doors up for the photographs, back in Milan by midnight.' },
    notes: [
      { headline: 'Carbon ceramic brakes.', body: 'The big discs live behind those black wheels. Twelve cylinders deserve them.' },
      { headline: 'The doors open upward.', body: 'Easier than it looks in a tight courtyard. We show you how at the handover.' },
      { headline: '6.5 litres, twelve cylinders.', body: 'Right behind your shoulders. You will hear every one of them.' },
    ],
  },
  {
    id: 'whitetrack',
    envBoost: 1.15,
    railShort: 'Track Car',
    railModel: 'Track Car',
    num: '04',
    make: 'White',
    model: 'Track Car',
    short: 'White',
    fullName: 'White Track Car',
    paintName: 'Grey',
    paintHex: 0x6b7480, // V5: lighter, cooler grey; lit by reflections alone the V4 grey went to charcoal
    paintCss: '#5d6672',
    paint: { metalness: 0.58, roughness: 0.28, clearcoatRoughness: 0.025, specularIntensity: 0.2 },
    city: 'Dubai',
    rates: { day: 4200, three: 11400, week: 24500, deposit: 40000, km: 150, extraKm: 15, month: null },
    driveLine: 'Dubai to Jebel Jais before the heat.',
    glbUrl: (import.meta.env.BASE_URL + 'models/concepts/white-track-car-light.glb'),
    rotY: Math.PI,
    targetLength: 4.64,
    rideHeightOffset: 0.0,
    audioProfile: {
      type: 'V8_TT', redlineRpm: 8200, idleRpm: 1020, baseFireFreq: 49.0, harmonicMultiplier: 1.38,
      exhaustCutoffBase: 240, exhaustCutoffSpan: 520, turboWhistle: 0.75, crackleIntensity: 0.92,
    },
    year: 2019,
    spec: '4.0 litre twin-turbo V8, 800 PS',
    trim: 'Grey, carbon cabin',
    km: '3,100 km',
    service: 'Serviced in October',
    availInDays: 4, // free from today plus this many days
    minAge: 30,
    licenceYears: 5,
    line: 'Built for the track and only just tamed for the road. One of five hundred, delivered with a technician who stays for the first ten minutes.',
    log: { date: '3 Nov', route: 'Dubai to Jebel Jais and back, 212 km.', note: 'Up at five, home before the heat.' },
    notes: [
      { headline: 'Built to brake late.', body: 'Carbon ceramic discs, each seven months in the making. New tyres at 2,900 km.' },
      { headline: 'Glass in the doors.', body: 'You watch the road go by beside your knees. The fixed seats are fitted to you by our technician.' },
      { headline: 'Four litres, two turbos, 800 PS.', body: 'One of five hundred. Best driven early, before Dubai warms up.' },
    ],
  },
  {
    id: 'bluehyper',
    envBoost: 1.15,
    railShort: 'Hypercar',
    railModel: 'Hypercar',
    num: '05',
    make: 'Blue',
    model: 'Hypercar',
    short: 'Blue',
    fullName: 'Blue Hypercar',
    paintName: 'Blue',
    paintHex: 0x0b3884, // V5 round 2: C2 V3's Blue
    paintCss: '#1f5bc4',
    paint: { metalness: 0.5, roughness: 0.28, clearcoatRoughness: 0.025, specularIntensity: 0.15 },
    city: 'Miami',
    rates: { day: 5800, three: 15600, week: 33800, deposit: 80000, km: 150, extraKm: 25, month: null },
    driveLine: 'Miami to Key West with the windows down.',
    glbUrl: (import.meta.env.BASE_URL + 'models/concepts/blue-hypercar.glb'), // V5: the full model (2.1M triangles), as on C2 V3; V4 loaded a half-detail copy
    straightenFrontWheels: true, // the file has them steered
    rotY: Math.PI,
    targetLength: 4.56,
    rideHeightOffset: 0.0,
    audioProfile: {
      type: 'W16_QUAD', redlineRpm: 6900, idleRpm: 860, baseFireFreq: 38.0, harmonicMultiplier: 1.2,
      exhaustCutoffBase: 210, exhaustCutoffSpan: 430, turboWhistle: 0.9, crackleIntensity: 0.82,
    },
    year: 2021,
    spec: '8.0 litre W16, four turbos, 1,500 PS',
    trim: 'Blue over Cognac leather',
    km: '4,800 km',
    service: 'Serviced in October',
    availInDays: 6, // free from today plus this many days
    minAge: 30,
    licenceYears: 5,
    line: 'Sixty were made. The is the Hypercar set up for corners rather than top speed, and at a cruise it is quieter than most saloons.',
    log: { date: '26 Oct', route: 'Miami Beach to Key West and back in a day.', note: 'Overseas Highway at sunrise. Collected from the marina at Islamorada.' },
    notes: [
      { headline: 'Lighter wheels, sharper car.', body: 'Magnesium wheels and a shorter gearing. New tyres at 4,000 km.' },
      { headline: 'No screens on the console.', body: 'Milled aluminium, leather and four dials. The only thing you will find missing is a radio you need.' },
      { headline: 'Sixteen cylinders, four turbos.', body: '1,500 PS, and as calm as a saloon at a cruise. One of sixty.' },
    ],
  },
];

export const CITIES = ['Monaco', 'Geneva', 'Milan', 'Dubai', 'Miami'];

export const STEPS = [
  { headline: 'You ask.', body: 'Car, city, dates, and where you’ll be. Two minutes here, or a call to the desk, any day from seven in the morning to midnight.' },
  { headline: 'A person calls you within the hour.', body: 'In English, French, Italian or Arabic. We confirm the car, the address and the time, and place the deposit hold. Nothing is charged until the car is with you.' },
  { headline: 'It’s brought to you.', body: 'Washed, fuelled and warmed through, the seat and mirrors set to the height you gave us. To your door, your hotel, the marina or the private terminal, on a driver’s own wheels, never on a truck.' },
  { headline: 'Twenty minutes together.', body: 'The driver shows you the modes and the nose lift, photographs the car with you for the record, and leaves the key, the papers and a number that answers at three in the morning.' },
  { headline: 'Leave it where you finish.', body: 'Send the desk a message with where you are. We collect it, look it over with you, and release the deposit hold the same day.' },
];

export const euro = n => '€' + Math.round(n).toLocaleString('en-GB');

// Under 3 days: day rate. 3 to 6: the three-day rate pro rata. 7 and over: the week pro rata. Nearest 50.
export function priceFor(car, days) {
  const r = car.rates;
  let p;
  if (days < 3) p = days * r.day;
  else if (days < 7) p = r.three + (days - 3) * (r.three / 3);
  else p = r.week + (days - 7) * (r.week / 7);
  return Math.round(p / 50) * 50;
}

// Free from today plus availInDays, written the way the desk would say it.
export function availability(car, now = new Date()) {
  if (!car.availInDays) return 'Free today';
  const d = new Date(now.getTime() + car.availInDays * 864e5);
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return car.availInDays <= 2 ? `Free from ${day}` : `With a client, back ${day}`;
}
