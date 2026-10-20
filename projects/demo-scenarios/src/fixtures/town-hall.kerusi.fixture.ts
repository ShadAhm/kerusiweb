import { KerusiMap, KerusiState } from '@kerusiweb/core';

/**
 * The town hall of the standard's §6.7, which rev 15 made possible: a stalls
 * and a balcony that share one canvas and overlap in height, a curved balcony
 * row, and a round table whose seats sit around it.
 *
 * Every seat is a square of `seatSize` centred on its own `x`/`y` (§4.5).
 * `row` and `col` say only which seats are neighbours (§4.3.5), so the table's
 * four seats read 1, 2, 3, 4 around it, and the gap at stalls col 5 is an
 * aisle. Each row's `shape` (§4.2.3) records the line, arc or circle an editor
 * placed its seats along. A renderer never reads it, which is why A9 and L5
 * can sit off their guides and still draw where the document puts them.
 *
 * On top of the corpus example: localized labels, the wheelchair space's
 * §4.3.4 accessibility, and an availability state.
 */
export const TOWN_HALL_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'town-hall',
  name: 'Town Hall',
  domain: 'event',
  locale: 'en',
  canvas: { width: 1600, height: 900 },
  seatSize: 40,
  legend: [
    {
      id: 'std',
      label: { en: 'Standard', ms: 'Biasa' },
      color: '#3a6f8f',
      defaultPriceTier: 'regular',
    },
    {
      id: 'wheelchair',
      label: { en: 'Wheelchair space', ms: 'Ruang Kerusi Roda' },
      color: '#c78a2e',
      defaultPriceTier: 'regular',
    },
  ],
  priceTiers: [{ id: 'regular', price: { amount: 2500, currency: 'MYR' } }],
  sections: [
    {
      id: 'stalls',
      label: { en: 'Stalls', ms: 'Tempat Duduk Bawah' },
      index: 0,
      bounds: { x: 280, y: 60, width: 1180, height: 680 },
      rows: [
        {
          id: 'A',
          label: 'A',
          shape: { line: { from: [320, 400], to: [1088, 400], cols: [1, 9] } },
        },
        {
          id: 'T1',
          label: 'Table 1',
          shape: { circle: { center: [1300, 300], radius: 70, start: -90, cols: [1, 4] } },
        },
      ],
      elements: [
        { id: 'stage', kind: 'stage', label: 'Stage', x: 800, y: 126, width: 800, height: 90 },
      ],
      seats: [
        { id: 'A1', label: '1', row: 'A', col: 1, x: 320, y: 400, type: 'std' },
        { id: 'A2', label: '2', row: 'A', col: 2, x: 416, y: 400, type: 'std' },
        { id: 'A3', label: '3', row: 'A', col: 3, x: 512, y: 400, type: 'std' },
        { id: 'A4', label: '4', row: 'A', col: 4, x: 608, y: 400, type: 'std' },
        // Col 5 is skipped: the aisle (§4.3.5).
        { id: 'A6', label: '6', row: 'A', col: 6, x: 800, y: 400, type: 'std' },
        { id: 'A7', label: '7', row: 'A', col: 7, x: 896, y: 400, type: 'std' },
        { id: 'A8', label: '8', row: 'A', col: 8, x: 992, y: 400, type: 'std' },
        // Moved off the guide by hand; still A8's neighbour.
        { id: 'A9', label: '9', row: 'A', col: 9, x: 1100, y: 440, type: 'std' },
        // The round table books as one party: a group booked whole (§4.12).
        {
          id: 'T1-1',
          label: '1',
          row: 'T1',
          col: 1,
          x: 1300,
          y: 230,
          type: 'std',
        },
        {
          id: 'T1-2',
          label: '2',
          row: 'T1',
          col: 2,
          x: 1370,
          y: 300,
          type: 'std',
        },
        {
          id: 'T1-3',
          label: '3',
          row: 'T1',
          col: 3,
          x: 1300,
          y: 370,
          type: 'std',
        },
        {
          id: 'T1-4',
          label: '4',
          row: 'T1',
          col: 4,
          x: 1230,
          y: 300,
          type: 'std',
        },
        // No row at all: a seat on its own, with no neighbours.
        {
          id: 'S1',
          label: 'W',
          x: 1408,
          y: 702,
          type: 'wheelchair',
          accessibility: { wheelchairAccessible: true, aisleChairCompatible: true },
        },
      ],
      groups: [
        {
          id: 'T1',
          kind: 'table',
          label: 'Table 1',
          seats: ['T1-1', 'T1-2', 'T1-3', 'T1-4'],
          shape: { circle: { center: [1300, 300], radius: 45 } },
          booking: 'whole',
        },
      ],
    },
    {
      id: 'balcony',
      label: { en: 'Balcony', ms: 'Balkoni' },
      index: 1,
      bounds: { x: 440, y: 580, width: 720, height: 220 },
      rows: [
        {
          id: 'L',
          label: 'L',
          shape: { arc: { center: [800, 60], radius: 640, start: 120, sweep: -60, cols: [1, 7] } },
        },
      ],
      seats: [
        { id: 'L1', label: '1', row: 'L', col: 1, x: 480, y: 614, type: 'std' },
        { id: 'L2', label: '2', row: 'L', col: 2, x: 581, y: 661, type: 'std' },
        { id: 'L3', label: '3', row: 'L', col: 3, x: 689, y: 690, type: 'std' },
        { id: 'L4', label: '4', row: 'L', col: 4, x: 800, y: 700, type: 'std' },
        // Dropped below the arc by hand; still between L4 and L6.
        { id: 'L5', label: '5', row: 'L', col: 5, x: 930, y: 760, type: 'std' },
        { id: 'L6', label: '6', row: 'L', col: 6, x: 1019, y: 661, type: 'std' },
        { id: 'L7', label: '7', row: 'L', col: 7, x: 1120, y: 614, type: 'std' },
      ],
    },
  ],
};

export const TOWN_HALL_STATE: KerusiState = {
  kerusi: '1.0',
  mapId: 'town-hall',
  updatedAt: '2026-10-17T09:00:00+08:00',
  // Sparse (§5.1): every seat not listed here is available.
  seats: {
    A2: { status: 'booked' },
    A3: { status: 'booked' },
    L4: { status: 'held', holdExpires: '2026-10-17T09:10:00+08:00' },
    L7: { status: 'blocked' },
  },
};
