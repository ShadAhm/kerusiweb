import { KerusiMap, KerusiSession, KerusiState, Seat } from '@kerusiweb/core';

/**
 * Two carriages of an intercity train, each its own `Section`, one above the
 * other on the canvas.
 *
 * Carriage A is airline-style rows; carriage B is table bays, where four seats
 * face each other around a table. The table is an `Element` in the space
 * between the facing pairs — a fixture that has to be drawn but cannot be
 * booked, which is exactly what §4.4 elements are for.
 */

/**
 * Each carriage is drawn on a lattice: seats 28 units square, 34 apart. The
 * lattice is only how this file works out positions; the document carries
 * each seat's centre as plain `x`/`y` (§4.5), and `col` says only which seats
 * are neighbours.
 */
const SEAT = 28;
const PITCH = 34;

/** The top of each carriage on the canvas. */
const CARRIAGE_A_TOP = 28;
const CARRIAGE_B_TOP = 248;

/** The centre of the lattice cell at column `col` on line `line` of a carriage, in canvas units. */
function cell(top: number, col: number, line: number): { x: number; y: number } {
  return { x: SEAT + (col - 1) * PITCH, y: top + SEAT + line * PITCH };
}

/** An airline-style row: columns 1,2 | aisle | 4,5. */
function airlineRow(carriage: string, n: number, type: string): Seat[] {
  const cols = [1, 2, 4, 5];
  const letters = ['A', 'B', 'C', 'D'];
  return cols.map((col, i) => ({
    id: `${carriage}${n}${letters[i]}`,
    label: letters[i],
    row: `${carriage}${n}`,
    col,
    ...cell(CARRIAGE_A_TOP, col, n - 1),
    type,
    attributes: i === 0 || i === 3 ? ['window'] : ['aisle'],
  }));
}

/**
 * One half of a table bay: two seats either side of the aisle, sharing a table
 * with the bay opposite. `forward` seats face the direction of travel.
 */
function bayRow(carriage: string, n: number, line: number, type: string, forward: boolean): Seat[] {
  const cols = [1, 2, 4, 5];
  const letters = ['A', 'B', 'C', 'D'];
  return cols.map((col, i) => ({
    id: `${carriage}${n}${letters[i]}`,
    label: letters[i],
    row: `${carriage}${n}`,
    col,
    ...cell(CARRIAGE_B_TOP, col, line),
    type,
    attributes: [
      i === 0 || i === 3 ? 'window' : 'aisle',
      'table',
      forward ? 'forward-facing' : 'rear-facing',
    ],
  }));
}

export const TRAIN_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'ets-platinum-set-7',
  name: 'ETS Platinum — Set 7',
  domain: 'train',
  locale: 'en',
  canvas: { width: 260, height: 576 },
  seatSize: SEAT,
  legend: [
    {
      id: 'standard',
      label: { en: 'Standard', ms: 'Biasa' },
      color: '#4f7f8f',
      defaultPriceTier: 'std',
    },
    {
      id: 'table',
      label: { en: 'Table bay', ms: 'Meja' },
      color: '#7f5f8f',
      defaultPriceTier: 'table',
    },
    {
      id: 'accessible',
      label: { en: 'Accessible', ms: 'Boleh Diakses' },
      color: '#c78a2e',
      defaultPriceTier: 'std',
    },
  ],
  priceTiers: [
    { id: 'std', label: 'Standard', price: { amount: 7900, currency: 'MYR' } },
    { id: 'table', label: 'Table bay', price: { amount: 9900, currency: 'MYR' } },
  ],
  sections: [
    {
      id: 'carriage-a',
      index: 1,
      label: { en: 'Carriage A', ms: 'Gerabak A' },
      bounds: { x: 0, y: CARRIAGE_A_TOP, width: 260, height: 192 },
      rows: Array.from({ length: 5 }, (_, i) => ({
        id: `A${i + 1}`,
        label: `${i + 1}`,
        index: i,
      })),
      elements: [
        // Seat-sized, by default (§4.4.1).
        { id: 'a-door', kind: 'exit', label: 'Door', ...cell(CARRIAGE_A_TOP, 7, 0) },
        { id: 'a-wc', kind: 'lavatory', label: 'WC', ...cell(CARRIAGE_A_TOP, 7, 4) },
      ],
      seats: [
        ...airlineRow('A', 1, 'standard'),
        ...airlineRow('A', 2, 'standard'),
        ...airlineRow('A', 3, 'standard'),
        // Row 4 holds the accessible bay and its companion seat.
        {
          id: 'A4A',
          label: 'A',
          row: 'A4',
          col: 1,
          ...cell(CARRIAGE_A_TOP, 1, 3),
          type: 'accessible',
          attributes: ['window'],
          accessibility: {
            wheelchairAccessible: true,
            transferArmrest: 'right',
            aisleChairCompatible: true,
            companionRequired: true,
          },
        },
        {
          id: 'A4B',
          label: 'B',
          row: 'A4',
          col: 2,
          ...cell(CARRIAGE_A_TOP, 2, 3),
          type: 'accessible',
          attributes: ['aisle'],
          accessibility: { transferArmrest: 'both' },
        },
        {
          id: 'A4C',
          label: 'C',
          row: 'A4',
          col: 4,
          ...cell(CARRIAGE_A_TOP, 4, 3),
          type: 'standard',
          attributes: ['aisle'],
        },
        {
          id: 'A4D',
          label: 'D',
          row: 'A4',
          col: 5,
          ...cell(CARRIAGE_A_TOP, 5, 3),
          type: 'standard',
          attributes: ['window'],
        },
        ...airlineRow('A', 5, 'standard'),
      ],
      groups: [{ id: 'A4-bay', kind: 'companion', seats: ['A4A', 'A4B'], booking: 'whole' }],
    },
    {
      id: 'carriage-b',
      index: 2,
      label: { en: 'Carriage B — table bays', ms: 'Gerabak B — Meja' },
      bounds: { x: 0, y: CARRIAGE_B_TOP, width: 260, height: 328 },
      // Rows give order and adjacency, never space (§4.2): the room for each
      // table between its facing pairs is there because the seats' own `y`
      // leave a lattice line free, on lines 1, 4 and 7.
      rows: [
        { id: 'B1', label: '1', index: 0 },
        { id: 'B2', label: '2', index: 1 },
        { id: 'B3', label: '3', index: 2 },
        { id: 'B4', label: '4', index: 3 },
        { id: 'B5', label: '5', index: 4 },
        { id: 'B6', label: '6', index: 5 },
      ],
      elements: [
        // A table sits between each facing pair, spanning both sides of the aisle.
        ...[1, 4, 7].map((line, i) => ({
          id: `table-${i + 1}`,
          kind: 'table',
          label: 'Table',
          x: (cell(CARRIAGE_B_TOP, 1, line).x + cell(CARRIAGE_B_TOP, 5, line).x) / 2,
          y: cell(CARRIAGE_B_TOP, 1, line).y,
          width: 4 * PITCH + SEAT,
        })),
        { id: 'b-door', kind: 'exit', label: 'Door', ...cell(CARRIAGE_B_TOP, 7, 8) },
      ],
      seats: [
        ...bayRow('B', 1, 0, 'table', true),
        ...bayRow('B', 2, 2, 'table', false),
        ...bayRow('B', 3, 3, 'table', true),
        ...bayRow('B', 4, 5, 'table', false),
        ...bayRow('B', 5, 6, 'table', true),
        ...bayRow('B', 6, 8, 'table', false),
      ],
    },
  ],
};

export const TRAIN_SESSION: KerusiSession = {
  kerusi: '1.0',
  id: 'ets9422-2026-08-21',
  mapId: 'ets-platinum-set-7',
  label: 'ETS9422 KL Sentral → Ipoh, 21 Aug 2026',
  startsAt: '2026-08-21T07:40:00+08:00',
};

export const TRAIN_STATE: KerusiState = {
  kerusi: '1.0',
  sessionId: 'ets9422-2026-08-21',
  updatedAt: '2026-08-19T20:00:00+08:00',
  seats: {
    A1A: { status: 'booked' },
    A1B: { status: 'booked' },
    A2C: { status: 'booked' },
    A3D: { status: 'held', holdExpires: '2026-08-19T20:08:00+08:00' },
    A5A: { status: 'booked' },
    B1A: { status: 'booked' },
    B1B: { status: 'booked' },
    B2A: { status: 'booked' },
    B2B: { status: 'booked' },
    B4C: { status: 'blocked' },
    B4D: { status: 'blocked' },
  },
};
