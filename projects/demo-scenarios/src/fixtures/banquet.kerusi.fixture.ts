import { Group, KerusiMap, KerusiState, Seat } from '@kerusiweb/core';

/**
 * A banquet hall: six round tables of eight and a head table, on one canvas.
 *
 * Each table is a **group** (§4.11): it names its eight seats and gives the
 * piece a `circle` footprint, so the booking page draws a tabletop with chairs
 * round it instead of a ring of chairs with nothing in the middle. The head
 * table is a `rect` group, with its places along the front, facing it.
 *
 * Each seat is turned to face the middle of its table. A seat faces up when its
 * `rotation` is 0 (§4.3.1), so a seat on a point of the ring is turned until up
 * points at the centre.
 */

const SEAT = 30;
const CANVAS = { width: 1000, height: 660 };

/** The top-left table's centre, then the pitch between tables. */
const TABLE_COLUMNS = [200, 500, 800];
const TABLE_ROWS = [260, 500];
const TABLE_RADIUS = 52;
const RING_RADIUS = TABLE_RADIUS + SEAT * 0.55;
const PLACES = 8;

/** The rotation that turns a seat at angle `phi` on a ring to face the ring's centre. */
function facingCentre(phi: number): number {
  const rotation = (Math.atan2(-Math.cos(phi), Math.sin(phi)) * 180) / Math.PI;
  return Math.round(rotation * 10) / 10;
}

function roundTable(n: number, cx: number, cy: number): { seats: Seat[]; group: Group } {
  const seats: Seat[] = Array.from({ length: PLACES }, (_, i) => {
    // Start at the top and go clockwise, so seat 1 is the one nearest the stage.
    const phi = -Math.PI / 2 + (i / PLACES) * Math.PI * 2;
    return {
      id: `T${n}-${i + 1}`,
      label: String(i + 1),
      row: `T${n}`,
      col: i + 1,
      x: Math.round((cx + Math.cos(phi) * RING_RADIUS) * 10) / 10,
      y: Math.round((cy + Math.sin(phi) * RING_RADIUS) * 10) / 10,
      rotation: facingCentre(phi),
      type: 'guest',
    };
  });
  return {
    seats,
    group: {
      id: `table-${n}`,
      kind: 'table',
      label: `Table ${n}`,
      seats: seats.map((s) => s.id),
      shape: { circle: { center: [cx, cy], radius: TABLE_RADIUS } },
    },
  };
}

const TABLES = TABLE_ROWS.flatMap((cy) => TABLE_COLUMNS.map((cx) => [cx, cy] as const)).map(
  ([cx, cy], i) => roundTable(i + 1, cx, cy),
);

/** The head table: ten places along its front, facing the table. */
const HEAD_PLACES = 10;
const HEAD_SEATS: Seat[] = Array.from({ length: HEAD_PLACES }, (_, i) => ({
  id: `H-${i + 1}`,
  label: String(i + 1),
  row: 'H',
  col: i + 1,
  x: 250 + i * 55,
  y: 120,
  type: 'head',
}));

export const BANQUET_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'banquet-hall',
  name: 'Banquet hall',
  domain: 'banquet',
  canvas: CANVAS,
  seatSize: SEAT,
  legend: [
    { id: 'guest', label: 'Guest', form: 'chair', color: '#76d75d', defaultPriceTier: 'guest' },
    {
      id: 'head',
      label: 'VIP',
      form: 'armchair',
      color: '#c9a0ff',
      defaultPriceTier: 'head',
    },
  ],
  priceTiers: [
    { id: 'guest', label: 'Guest', price: { amount: 18000, currency: 'MYR' } },
    { id: 'head', label: 'VIP', price: { amount: 30000, currency: 'MYR' } },
  ],
  sections: [
    {
      id: 'hall',
      label: 'Hall',
      elements: [
        { id: 'stage', kind: 'stage', label: 'Stage', x: 500, y: 36, width: 460, height: 40 },
        { id: 'dance', kind: 'gap', label: 'Dance floor', x: 500, y: 380, width: 120, height: 120 },
      ],
      seats: [...HEAD_SEATS, ...TABLES.flatMap((t) => t.seats)],
      groups: [
        {
          id: 'head-table',
          kind: 'table',
          label: 'Head table',
          seats: HEAD_SEATS.map((s) => s.id),
          shape: { rect: { x: 500, y: 100, width: 560, height: 40 } },
        },
        ...TABLES.map((t) => t.group),
      ],
    },
  ],
};

export const BANQUET_STATE: KerusiState = {
  kerusi: '1.0',
  mapId: 'banquet-hall',
  updatedAt: '2026-10-20T20:00:00+08:00',
  seats: {
    'H-3': { status: 'booked' },
    'H-4': { status: 'booked' },
    'H-5': { status: 'booked' },
    'T1-1': { status: 'booked' },
    'T1-2': { status: 'booked' },
    'T1-3': { status: 'booked' },
    'T1-4': { status: 'booked' },
    'T2-5': { status: 'held', holdExpires: '2026-10-20T20:08:00+08:00' },
    'T2-6': { status: 'held', holdExpires: '2026-10-20T20:08:00+08:00' },
    'T4-1': { status: 'booked' },
    'T4-8': { status: 'booked' },
    'T5-3': { status: 'blocked' },
  },
};
