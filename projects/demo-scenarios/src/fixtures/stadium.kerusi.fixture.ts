import { KerusiMap, KerusiState, Seat } from '@kerusiweb/core';

/**
 * A stadium bowl. The stands wrap the pitch, so each seat sits where its stand
 * puts it and turns to face inward. But "the next seat along" still has to
 * mean something for a keyboard or a screen reader, and that is exactly what
 * `row` and `col` are for (§4.3.5): `x`/`y` place the seat, `col` orders it.
 */

/**
 * The bowl is 1500 × 1000 canvas units, with room above it for its label. The
 * stands are worked out in percent of the bowl and scaled onto the canvas once,
 * by {@link px} and {@link py}.
 */
const WIDTH = 1500;
const HEIGHT = 1000;
const TOP = 33;
const SEAT = 33;

/** A percentage across the bowl, in canvas units. */
const px = (percent: number) => (percent * WIDTH) / 100;
/** A percentage down the bowl, in canvas units. */
const py = (percent: number) => TOP + (percent * HEIGHT) / 100;

/**
 * A block of seats along a straight or angled stand.
 *
 * @param angle Degrees the stand is rotated about the pitch center.
 * @param radius Distance from the center, 0–50 (percent of the bowl).
 */
function stand(
  prefix: string,
  rows: number,
  seatsPerRow: number,
  angle: number,
  radius: number,
  type: string,
): Seat[] {
  const seats: Seat[] = [];
  const rad = (angle * Math.PI) / 180;
  // Unit vectors: `along` runs down the stand, `out` runs away from the pitch.
  const along = { x: Math.cos(rad), y: Math.sin(rad) };
  const out = { x: -Math.sin(rad), y: Math.cos(rad) };

  for (let r = 0; r < rows; r++) {
    // Later rows sit further from the pitch, not closer to it.
    const depth = radius - r * 4;
    for (let c = 0; c < seatsPerRow; c++) {
      const offset = (c - (seatsPerRow - 1) / 2) * 4.2;
      seats.push({
        id: `${prefix}-${r + 1}-${c + 1}`,
        label: `${c + 1}`,
        row: `${prefix}-${r + 1}`,
        // `col` is the adjacency ordinal, not a screen position.
        col: c + 1,
        x: px(50 + along.x * offset + out.x * depth),
        y: py(50 + along.y * offset + out.y * depth),
        rotation: angle + 180,
        type,
      });
    }
  }
  return seats;
}

export const STADIUM_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'stadium-bukit-jalil',
  name: 'Stadium Nasional Bukit Jalil',
  domain: 'stadium',
  locale: 'en',
  canvas: { width: WIDTH, height: TOP + HEIGHT },
  seatSize: SEAT,
  legend: [
    {
      id: 'main',
      label: { en: 'Main Stand', ms: 'Pentas Utama' },
      color: '#8f3a3a',
      defaultPriceTier: 'cat1',
    },
    {
      id: 'side',
      label: { en: 'Side Stand', ms: 'Pentas Tepi' },
      color: '#3a5f8f',
      defaultPriceTier: 'cat2',
    },
    {
      id: 'end',
      label: { en: 'End Stand', ms: 'Pentas Hujung' },
      color: '#3a8f5f',
      defaultPriceTier: 'cat3',
    },
  ],
  priceTiers: [
    { id: 'cat1', label: 'Category 1', price: { amount: 25000, currency: 'MYR' } },
    { id: 'cat2', label: 'Category 2', price: { amount: 15000, currency: 'MYR' } },
    { id: 'cat3', label: 'Category 3', price: { amount: 8000, currency: 'MYR' } },
  ],
  sections: [
    {
      id: 'bowl',
      index: 1,
      label: { en: 'Bowl', ms: 'Mangkuk' },
      bounds: { x: 0, y: TOP, width: WIDTH, height: HEIGHT },
      elements: [
        {
          id: 'pitch',
          kind: 'pitch',
          label: 'PITCH',
          x: px(50),
          y: py(50),
          width: 510,
          height: 400,
        },
        {
          id: 'gate-n',
          kind: 'exit',
          label: 'Gate N',
          x: px(50),
          y: py(3),
          width: 135,
          height: 40,
        },
        {
          id: 'gate-s',
          kind: 'exit',
          label: 'Gate S',
          x: px(50),
          y: py(97),
          width: 135,
          height: 40,
        },
        // Free text: drawn as bare text, no box (kind 'label').
        {
          id: 'name-n',
          kind: 'label',
          label: 'North Stand',
          x: px(50),
          y: py(36),
          width: 360,
          height: 50,
        },
        {
          id: 'name-s',
          kind: 'label',
          label: 'South Stand',
          x: px(50),
          y: py(64),
          width: 360,
          height: 50,
        },
        {
          id: 'name-w',
          kind: 'label',
          label: 'West Stand',
          x: px(36),
          y: py(50),
          width: 270,
          height: 50,
          rotation: -90,
        },
        {
          id: 'name-e',
          kind: 'label',
          label: 'East Stand',
          x: px(64),
          y: py(50),
          width: 270,
          height: 50,
          rotation: 90,
        },
      ],
      seats: [
        // North side, facing down toward the pitch.
        ...stand('N', 3, 14, 0, -28, 'main'),
        // South side, facing up.
        ...stand('S', 3, 14, 180, -28, 'side'),
        // East and west ends, rotated a quarter turn.
        ...stand('E', 2, 9, 90, -30, 'end'),
        ...stand('W', 2, 9, 270, -30, 'end'),
      ],
    },
  ],
};

export const STADIUM_STATE: KerusiState = {
  kerusi: '1.0',
  mapId: 'stadium-bukit-jalil',
  updatedAt: '2026-08-19T12:00:00+08:00',
  seats: {
    'N-1-6': { status: 'booked' },
    'N-1-7': { status: 'booked' },
    'N-1-8': { status: 'booked' },
    'N-1-9': { status: 'booked' },
    'N-2-7': { status: 'booked' },
    'N-2-8': { status: 'held', holdExpires: '2026-08-19T12:10:00+08:00' },
    'S-1-3': { status: 'booked' },
    'S-2-11': { status: 'booked' },
    'E-1-1': { status: 'blocked' },
    'E-1-9': { status: 'blocked' },
    'W-1-5': { status: 'booked' },
  },
};
