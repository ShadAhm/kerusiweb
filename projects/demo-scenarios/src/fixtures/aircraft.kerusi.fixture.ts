import { KerusiMap, KerusiSession, KerusiState, Seat } from '@kerusiweb/core';

/**
 * A narrow-body cabin: two classes as separate sections, one above the other on
 * the canvas, an aisle expressed as a skipped `col`, exit rows, and lavatory
 * and galley elements.
 *
 * Exercises: seats on a regular lattice, multiple sections, elements,
 * `attributes` (window / aisle / exit-row / extra-legroom), and — the reason
 * this fixture exists — the §4.3.4 `accessibility` object on real seats.
 */

/**
 * Each cabin is drawn on a lattice: seats 28 units square, 34 apart. The
 * lattice is only how this file works out positions; the document carries
 * each seat's centre as plain `x`/`y` (§4.5), and `col` says only which seats
 * are neighbours.
 */
const SEAT = 28;
const PITCH = 34;

/** Where a cabin's lattice starts: the column drawn first, and the top of the cabin. */
interface Cabin {
  firstCol: number;
  top: number;
}

const BUSINESS: Cabin = { firstCol: 1, top: 28 };
const ECONOMY: Cabin = { firstCol: 0, top: 180 };

/** The centre of the lattice cell at column `col` on line `line` of a cabin, in canvas units. */
function cell(cabin: Cabin, col: number, line: number): { x: number; y: number } {
  return { x: SEAT + (col - cabin.firstCol) * PITCH, y: cabin.top + SEAT + line * PITCH };
}

/** 2-2 business rows: columns 1,2 | aisle | 4,5. */
function businessRow(row: string, line: number): Seat[] {
  const cols = [1, 2, 4, 5];
  const letters = ['A', 'C', 'D', 'F'];
  return cols.map((col, i) => ({
    id: `${row}${letters[i]}`,
    label: letters[i],
    row,
    col,
    ...cell(BUSINESS, col, line),
    type: 'business',
    attributes: i === 0 || i === 3 ? ['window'] : ['aisle'],
  }));
}

/** 3-3 economy rows: columns 1,2,3 | aisle | 5,6,7. */
function economyRow(row: string, line: number, options: { exitRow?: boolean } = {}): Seat[] {
  const cols = [1, 2, 3, 5, 6, 7];
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  return cols.map((col, i) => {
    const attributes: string[] = [];
    if (i === 0 || i === 5) {
      attributes.push('window');
    }
    if (i === 2 || i === 3) {
      attributes.push('aisle');
    }
    if (options.exitRow) {
      attributes.push('exit-row', 'extra-legroom');
    }
    return {
      id: `${row}${letters[i]}`,
      label: letters[i],
      row,
      col,
      ...cell(ECONOMY, col, line),
      type: options.exitRow ? 'economy-plus' : 'economy',
      attributes,
    };
  });
}

export const AIRCRAFT_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'mh-738-v2',
  name: 'Boeing 737-800',
  domain: 'flight',
  locale: 'en',
  canvas: { width: 328, height: 440 },
  seatSize: SEAT,
  legend: [
    {
      id: 'business',
      label: { en: 'Business', ms: 'Perniagaan' },
      color: '#2f6f9f',
      defaultPriceTier: 'biz',
    },
    {
      id: 'economy-plus',
      label: { en: 'Economy Plus', ms: 'Ekonomi Plus' },
      color: '#3f8f76',
      defaultPriceTier: 'plus',
    },
    {
      id: 'economy',
      label: { en: 'Economy', ms: 'Ekonomi' },
      color: '#5f9f52',
      defaultPriceTier: 'eco',
    },
    {
      id: 'accessible',
      label: { en: 'Accessible', ms: 'Boleh Diakses' },
      color: '#c78a2e',
      defaultPriceTier: 'eco',
    },
  ],
  priceTiers: [
    { id: 'biz', label: 'Business', price: { amount: 128000, currency: 'MYR' } },
    { id: 'plus', label: 'Economy Plus', price: { amount: 21000, currency: 'MYR' } },
    { id: 'eco', label: 'Economy', price: { amount: 14000, currency: 'MYR' } },
  ],
  sections: [
    {
      id: 'business',
      index: 1,
      label: { en: 'Business cabin', ms: 'Kabin Perniagaan' },
      bounds: { x: 0, y: BUSINESS.top, width: 294, height: 124 },
      rows: [
        { id: '1', label: '1', index: 0 },
        { id: '2', label: '2', index: 1 },
        { id: '3', label: '3', index: 2 },
      ],
      elements: [
        // Two lattice columns wide, beside rows 1 and 3.
        {
          id: 'galley-fwd',
          kind: 'galley',
          label: 'Galley',
          x: cell(BUSINESS, 7, 0).x + PITCH / 2,
          y: cell(BUSINESS, 7, 0).y,
          width: PITCH + SEAT,
        },
        {
          id: 'lav-fwd',
          kind: 'lavatory',
          label: 'WC',
          x: cell(BUSINESS, 7, 2).x + PITCH / 2,
          y: cell(BUSINESS, 7, 2).y,
          width: PITCH + SEAT,
        },
      ],
      seats: [...businessRow('1', 0), ...businessRow('2', 1), ...businessRow('3', 2)],
    },
    {
      id: 'economy',
      index: 2,
      label: { en: 'Economy cabin', ms: 'Kabin Ekonomi' },
      bounds: { x: 0, y: ECONOMY.top, width: 328, height: 260 },
      rows: [
        { id: '10', label: '10', index: 0 },
        { id: '11', label: '11', index: 1 },
        { id: '12', label: '12', index: 2 },
        { id: '13', label: '13', index: 3 },
        { id: '14', label: '14', index: 4 },
        { id: '15', label: '15', index: 5 },
        { id: '16', label: '16', index: 6 },
      ],
      elements: [
        // The exit rows: doors either side of row 12. Seat-sized, by default.
        { id: 'exit-l', kind: 'exit', label: 'EXIT', ...cell(ECONOMY, 0, 2) },
        { id: 'exit-r', kind: 'exit', label: 'EXIT', ...cell(ECONOMY, 8, 2) },
        { id: 'lav-aft-l', kind: 'lavatory', label: 'WC', ...cell(ECONOMY, 0, 6) },
        { id: 'lav-aft-r', kind: 'lavatory', label: 'WC', ...cell(ECONOMY, 8, 6) },
      ],
      seats: [
        ...economyRow('10', 0),
        ...economyRow('11', 1),
        ...economyRow('12', 2, { exitRow: true }),
        ...economyRow('13', 3, { exitRow: true }),
        ...economyRow('14', 4),
        // Row 15 carries the accessible pair: an aisle seat with a lifting
        // armrest and the companion seat it must be booked with (§4.3.4/§4.6).
        {
          id: '15A',
          label: 'A',
          row: '15',
          col: 1,
          ...cell(ECONOMY, 1, 5),
          type: 'economy',
          attributes: ['window'],
        },
        {
          id: '15B',
          label: 'B',
          row: '15',
          col: 2,
          ...cell(ECONOMY, 2, 5),
          type: 'accessible',
          companions: ['15C'],
          accessibility: { companionRequired: true },
        },
        {
          id: '15C',
          label: 'C',
          row: '15',
          col: 3,
          ...cell(ECONOMY, 3, 5),
          type: 'accessible',
          attributes: ['aisle'],
          companions: ['15B'],
          accessibility: {
            wheelchairAccessible: true,
            transferArmrest: 'left',
            aisleChairCompatible: true,
            companionRequired: true,
          },
        },
        {
          id: '15D',
          label: 'D',
          row: '15',
          col: 5,
          ...cell(ECONOMY, 5, 5),
          type: 'accessible',
          attributes: ['aisle'],
          accessibility: {
            wheelchairAccessible: true,
            transferArmrest: 'right',
            aisleChairCompatible: true,
          },
        },
        { id: '15E', label: 'E', row: '15', col: 6, ...cell(ECONOMY, 6, 5), type: 'economy' },
        {
          id: '15F',
          label: 'F',
          row: '15',
          col: 7,
          ...cell(ECONOMY, 7, 5),
          type: 'economy',
          attributes: ['window'],
        },
        ...economyRow('16', 6),
      ],
    },
  ],
};

export const AIRCRAFT_SESSION: KerusiSession = {
  kerusi: '1.0',
  id: 'mh1234-2026-08-20',
  mapId: 'mh-738-v2',
  label: 'MH1234 KUL → SIN, 20 Aug 2026',
  startsAt: '2026-08-20T08:15:00+08:00',
};

export const AIRCRAFT_STATE: KerusiState = {
  kerusi: '1.0',
  sessionId: 'mh1234-2026-08-20',
  updatedAt: '2026-08-19T22:10:00+08:00',
  seats: {
    '1A': { status: 'booked' },
    '1C': { status: 'booked' },
    '2D': { status: 'booked' },
    '10A': { status: 'booked' },
    '10B': { status: 'booked' },
    '11F': { status: 'booked' },
    '12A': { status: 'held', holdExpires: '2026-08-19T22:25:00+08:00' },
    '13C': { status: 'booked' },
    '14D': { status: 'booked' },
    '16A': { status: 'blocked' },
    '16B': { status: 'blocked' },
    '16C': { status: 'blocked' },
  },
};
