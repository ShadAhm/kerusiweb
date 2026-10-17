import { KerusiMap, KerusiSession, KerusiState } from '@kerusiweb/core';

/**
 * A cinema hall of straight rows split by two aisles into a left wing, a
 * center block, and a right wing — the classic printed seating chart, not a
 * curved auditorium. The back row is love seats, linked in symmetric
 * `companions` pairs so they book together.
 *
 * Exercises: seats on a regular lattice, aisles as skipped `col`s (§4.3.5),
 * open space in front of row A for the screen and its throw, price tiers,
 * companions, and all four availability states.
 */

/**
 * The hall is drawn on a lattice: seats 32 units square, 38 apart, so
 * neighbours have 6 units between them. The lattice is only how this file
 * works out positions. The document carries each seat's centre as plain
 * `x`/`y` (§4.5), and `col` says only which seats are neighbours.
 */
const SEAT = 32;
const PITCH = 38;
/** Room above the hall for its label. */
const TOP = 32;

/**
 * Lattice lines, front to back. Lines 0 and 1 hold the screen and the throw in
 * front of it; they are open space on the canvas, not rows.
 */
const LINE = { screen: 0, A: 2, B: 3, C: 4, D: 5, E: 6, L: 7 } as const;

/** The centre of the lattice cell at column `col` on line `line`, in canvas units. */
function cell(col: number, line: number): { x: number; y: number } {
  return { x: SEAT + col * PITCH, y: TOP + SEAT + line * PITCH };
}

/** A 12-seat standard row: two-seat wings at cols 1–2 / 13–14, an 8-seat
 * center block at cols 4–11, aisles at the skipped columns either side. */
function standardRow(
  row: 'A' | 'B' | 'C' | 'D',
  type: string,
): KerusiMap['sections'][number]['seats'] {
  const cols = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14];
  return cols.map((col, i) => ({
    id: `${row}${i + 1}`,
    label: `${i + 1}`,
    row,
    col,
    ...cell(col, LINE[row]),
    type,
  }));
}

export const CINEMA_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'gsc-hall-3',
  name: 'GSC Mid Valley — Hall 3',
  domain: 'cinema',
  locale: 'en',
  canvas: { width: 634, height: 362 },
  seatSize: SEAT,
  legend: [
    {
      id: 'standard',
      label: { en: 'Standard', ms: 'Biasa' },
      color: '#3a8f63',
      defaultPriceTier: 'regular',
    },
    {
      id: 'premium',
      label: { en: 'Premium', ms: 'Premium' },
      color: '#2f6f9f',
      defaultPriceTier: 'premium',
    },
    {
      id: 'sofa',
      label: { en: 'Love seat', ms: 'Kerusi Berdua' },
      color: '#9a5fa8',
      defaultPriceTier: 'sofa',
    },
    {
      id: 'wheelchair',
      label: { en: 'Wheelchair space', ms: 'Ruang Kerusi Roda' },
      color: '#c78a2e',
      defaultPriceTier: 'regular',
    },
  ],
  priceTiers: [
    { id: 'regular', label: 'Regular', price: { amount: 1800, currency: 'MYR' } },
    { id: 'premium', label: 'Premium', price: { amount: 2600, currency: 'MYR' } },
    { id: 'sofa', label: 'Love seat', price: { amount: 5200, currency: 'MYR' } },
  ],
  sections: [
    {
      id: 'house',
      label: { en: 'Hall 3', ms: 'Dewan 3' },
      bounds: { x: 0, y: TOP, width: 634, height: 330 },
      rows: [
        // Row order is `index` order (§4.2.1), and `index` is a key rather
        // than a position: numbering A from 2 reserves nothing. The space in
        // front of row A is there because the seats' own `y` leave it.
        { id: 'A', label: 'A', index: 2 },
        { id: 'B', label: 'B', index: 3 },
        { id: 'C', label: 'C', index: 4 },
        { id: 'D', label: 'D', index: 5 },
        { id: 'E', label: 'E', index: 6 },
        { id: 'L', label: 'L', index: 7 },
      ],
      elements: [
        {
          id: 'screen',
          kind: 'screen',
          label: 'SCREEN',
          // Centred over lattice columns 1–14, so it stops short of the exits
          // at 0 and 15. An element is a rectangle centred on its x/y (§4.4.1).
          x: (cell(1, LINE.screen).x + cell(14, LINE.screen).x) / 2,
          y: cell(1, LINE.screen).y,
          width: 13 * PITCH + SEAT,
          height: SEAT,
        },
        // No width or height: an element defaults to the seat size (§4.4.1).
        { id: 'exit-left', kind: 'exit', label: 'EXIT', ...cell(0, LINE.L) },
        { id: 'exit-right', kind: 'exit', label: 'EXIT', ...cell(15, LINE.L) },
      ],
      seats: [
        ...standardRow('A', 'standard'),
        ...standardRow('B', 'standard'),
        ...standardRow('C', 'premium'),
        ...standardRow('D', 'premium'),
        // Row E leaves a wheelchair bay at each end, with its companion seat.
        {
          id: 'E1',
          label: '1',
          row: 'E',
          col: 1,
          ...cell(1, LINE.E),
          type: 'wheelchair',
          companions: ['E2'],
          attributes: ['aisle'],
          accessibility: {
            wheelchairAccessible: true,
            transferArmrest: 'right',
            aisleChairCompatible: true,
            companionRequired: true,
          },
        },
        {
          id: 'E2',
          label: '2',
          row: 'E',
          col: 2,
          ...cell(2, LINE.E),
          type: 'premium',
          companions: ['E1'],
        },
        { id: 'E3', label: '3', row: 'E', col: 4, ...cell(4, LINE.E), type: 'premium' },
        { id: 'E4', label: '4', row: 'E', col: 5, ...cell(5, LINE.E), type: 'premium' },
        { id: 'E5', label: '5', row: 'E', col: 6, ...cell(6, LINE.E), type: 'premium' },
        { id: 'E6', label: '6', row: 'E', col: 7, ...cell(7, LINE.E), type: 'premium' },
        { id: 'E7', label: '7', row: 'E', col: 8, ...cell(8, LINE.E), type: 'premium' },
        {
          id: 'E8',
          label: '8',
          row: 'E',
          col: 10,
          ...cell(10, LINE.E),
          type: 'premium',
          companions: ['E9'],
        },
        {
          id: 'E9',
          label: '9',
          row: 'E',
          col: 11,
          ...cell(11, LINE.E),
          type: 'wheelchair',
          companions: ['E8'],
          attributes: ['aisle'],
          accessibility: {
            wheelchairAccessible: true,
            transferArmrest: 'left',
            aisleChairCompatible: true,
            companionRequired: true,
          },
        },
        // Love seats: three symmetric pairs, an aisle gap between each pair.
        {
          id: 'L1',
          label: '1',
          row: 'L',
          col: 4,
          ...cell(4, LINE.L),
          type: 'sofa',
          companions: ['L2'],
        },
        {
          id: 'L2',
          label: '2',
          row: 'L',
          col: 5,
          ...cell(5, LINE.L),
          type: 'sofa',
          companions: ['L1'],
        },
        {
          id: 'L3',
          label: '3',
          row: 'L',
          col: 7,
          ...cell(7, LINE.L),
          type: 'sofa',
          companions: ['L4'],
        },
        {
          id: 'L4',
          label: '4',
          row: 'L',
          col: 8,
          ...cell(8, LINE.L),
          type: 'sofa',
          companions: ['L3'],
        },
        {
          id: 'L5',
          label: '5',
          row: 'L',
          col: 10,
          ...cell(10, LINE.L),
          type: 'sofa',
          companions: ['L6'],
        },
        {
          id: 'L6',
          label: '6',
          row: 'L',
          col: 11,
          ...cell(11, LINE.L),
          type: 'sofa',
          companions: ['L5'],
        },
      ],
    },
  ],
};

export const CINEMA_SESSION: KerusiSession = {
  kerusi: '1.0',
  id: 'gsc-hall-3-2026-08-19-1930',
  mapId: 'gsc-hall-3',
  label: 'Dune: Part Three — 7:30pm',
  startsAt: '2026-08-19T19:30:00+08:00',
};

export const CINEMA_STATE: KerusiState = {
  kerusi: '1.0',
  sessionId: 'gsc-hall-3-2026-08-19-1930',
  updatedAt: '2026-08-19T18:42:00+08:00',
  // Sparse (§5.1): every seat not listed here is available.
  seats: {
    C4: { status: 'booked' },
    C5: { status: 'booked' },
    C6: { status: 'booked' },
    D6: { status: 'booked' },
    D7: { status: 'booked' },
    B3: { status: 'held', holdExpires: '2026-08-19T18:52:00+08:00' },
    B4: { status: 'held', holdExpires: '2026-08-19T18:52:00+08:00' },
    L3: { status: 'booked' },
    L4: { status: 'booked' },
    A1: { status: 'blocked' },
    A10: { status: 'blocked' },
  },
};
