import { KerusiMap, KerusiState, RowMeta, Seat } from '@kerusiweb/core';

/**
 * An end-stage lecture theatre: rows are concentric arcs around a focal point
 * just above the screen, each seat rotated to face it. Because seat pitch (not
 * seat count) stays constant along an arc, a row further from the screen has a
 * longer arc at the same radius step and so holds more seats — the fan widens
 * toward the back, the way a real raked lecture theatre does.
 *
 * Exercises: seats placed freely on the canvas, per-seat `rotation` derived
 * from real polar geometry (not a hand-tuned curve), curved rows described by
 * an arc `RowMeta.shape` (§4.2.3) for editors, and an accessible pair at each
 * end of the back row.
 */

/**
 * The hall is 1000 × 562.5 canvas units (16:9), with room above it for its
 * label. The canvas has one scale on both axes (§4.5), so a circle is drawn as
 * a circle and the geometry below needs no conversion.
 */
const WIDTH = 1000;
const HEIGHT = 562.5;
const TOP = 26;
const SEAT = 26;

/** The point every row curves around, just above the screen. */
const FOCAL_X = 500;
const FOCAL_Y = TOP + 40;

/** Half the angle a row sweeps, either side of straight down from the focal point. */
const HALF_ANGLE = 60;

/** Row-to-row distance from the focal point, and how much seat pitch that's
 * worth against the 26-unit seat (`SEAT`) — loose enough that a row reads as
 * individual seats, not a packed bench. */
const FIRST_RADIUS = 130;
const ROW_STEP = 56;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * One arc of seats at a fixed radius, evenly spaced by angle and rotated to
 * face the focal point.
 */
function row(rowId: string, rowIndex: number, count: number, type: string): Seat[] {
  const radius = FIRST_RADIUS + rowIndex * ROW_STEP;
  const seats: Seat[] = [];
  for (let i = 0; i < count; i++) {
    // -1 at the left edge, +1 at the right.
    const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
    const angleDeg = t * HALF_ANGLE;
    const angleRad = (angleDeg * Math.PI) / 180;
    seats.push({
      id: `${rowId}${i + 1}`,
      label: `${i + 1}`,
      row: rowId,
      col: i + 1,
      x: round(FOCAL_X + radius * Math.sin(angleRad)),
      y: round(FOCAL_Y + radius * Math.cos(angleRad)),
      // Cancels the seat's own angle around the focal point, so it faces
      // straight at it regardless of where along the arc it sits.
      rotation: round(-angleDeg),
      type,
    });
  }
  return seats;
}

/**
 * A row's registry entry, with the arc its seats were placed along (§4.2.3).
 * Only an editor reads the shape; a renderer draws each seat at its own `x`/`y`.
 * The arc runs from the left end of the row (150°, measured clockwise from the
 * x axis) sweeping 120° anticlockwise to the right end.
 */
function rowMeta(rowId: string, rowIndex: number, count: number): RowMeta {
  return {
    id: rowId,
    label: rowId,
    index: rowIndex,
    shape: {
      arc: {
        center: [FOCAL_X, FOCAL_Y],
        radius: FIRST_RADIUS + rowIndex * ROW_STEP,
        start: 90 + HALF_ANGLE,
        sweep: -2 * HALF_ANGLE,
        cols: [1, count],
      },
    },
  };
}

/** Seats per row, front to back. */
const ROW_COUNTS: [string, number][] = [
  ['A', 8],
  ['B', 11],
  ['C', 14],
  ['D', 17],
  ['E', 20],
  ['F', 23],
];

// The back row's two aisle seats are wheelchair-accessible, each with its
// required companion seat beside it (§4.3.4/§4.6).
const backRow = row('F', 5, ROW_COUNTS[5][1], 'standard');
backRow[0] = {
  ...backRow[0],
  type: 'accessible',
  companions: ['F2'],
  attributes: ['aisle'],
  accessibility: {
    wheelchairAccessible: true,
    transferArmrest: 'right',
    aisleChairCompatible: true,
    companionRequired: true,
  },
};
backRow[1] = { ...backRow[1], companions: ['F1'] };
backRow[21] = { ...backRow[21], companions: ['F23'] };
backRow[22] = {
  ...backRow[22],
  type: 'accessible',
  companions: ['F22'],
  attributes: ['aisle'],
  accessibility: {
    wheelchairAccessible: true,
    transferArmrest: 'left',
    aisleChairCompatible: true,
    companionRequired: true,
  },
};

export const LECTURE_THEATRE_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'feng-lt1',
  name: 'Faculty of Engineering — Lecture Theatre 1',
  domain: 'theatre',
  locale: 'en',
  canvas: { width: WIDTH, height: TOP + HEIGHT },
  seatSize: SEAT,
  legend: [
    {
      id: 'standard',
      label: { en: 'Standard', ms: 'Biasa' },
      color: '#3a6f8f',
      defaultPriceTier: 'standard',
    },
    {
      id: 'accessible',
      label: { en: 'Accessible', ms: 'Boleh Diakses' },
      color: '#c78a2e',
      defaultPriceTier: 'standard',
    },
  ],
  priceTiers: [{ id: 'standard', label: 'Standard', price: { amount: 0, currency: 'MYR' } }],
  sections: [
    {
      id: 'main',
      label: 'Lecture Theatre 1',
      bounds: { x: 0, y: TOP, width: WIDTH, height: HEIGHT },
      rows: ROW_COUNTS.map(([id, count], index) => rowMeta(id, index, count)),
      elements: [
        {
          id: 'screen',
          kind: 'screen',
          label: 'PROJECTION SCREEN',
          x: 500,
          y: TOP + 11.25,
          width: 400,
          height: 22.5,
        },
        {
          id: 'exit-left',
          kind: 'exit',
          label: 'EXIT',
          x: 90,
          y: TOP + 258.75,
          width: 70,
          height: 22.5,
        },
        {
          id: 'exit-right',
          kind: 'exit',
          label: 'EXIT',
          x: 910,
          y: TOP + 258.75,
          width: 70,
          height: 22.5,
        },
      ],
      seats: [
        ...ROW_COUNTS.slice(0, 5).flatMap(([id, count], index) =>
          row(id, index, count, 'standard'),
        ),
        ...backRow,
      ],
    },
  ],
};

export const LECTURE_THEATRE_STATE: KerusiState = {
  kerusi: '1.0',
  mapId: 'feng-lt1',
  updatedAt: '2026-08-20T09:00:00+08:00',
  // Sparse (§5.1): every seat not listed here is available.
  seats: {
    C6: { status: 'booked' },
    C7: { status: 'booked' },
    C8: { status: 'booked' },
    D9: { status: 'booked' },
    D10: { status: 'booked' },
    D11: { status: 'held', holdExpires: '2026-08-20T09:20:00+08:00' },
    D12: { status: 'held', holdExpires: '2026-08-20T09:20:00+08:00' },
    E4: { status: 'blocked' },
    E17: { status: 'blocked' },
    A1: { status: 'booked' },
    A8: { status: 'booked' },
  },
};
