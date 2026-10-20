import { KerusiMap } from './kerusi-map.model.js';
import { KerusiState } from './kerusi-state.model.js';

// Worked examples modelled on the Kerusi standard §6, as test fixtures. Each
// sits on one canvas (§4.5): every seat and element is placed by its centre in
// canvas units, and `row`/`col` carry adjacency only (§4.3.5). Non-normative
// in the spec; here they anchor the adapter and validator tests.

/** §6.1 — minimal generic map (bus, 2+2 layout). Col 3 is skipped: the aisle. */
export const BUS_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'bus-42-2026-08-17',
  domain: 'bus',
  canvas: { width: 192, height: 56 },
  seatSize: 28,
  legend: [{ id: 'standard', label: 'Standard' }],
  sections: [
    {
      id: 'main',
      seats: [
        { id: '1A', row: '1', col: 1, x: 28, y: 28, type: 'standard' },
        { id: '1B', row: '1', col: 2, x: 62, y: 28, type: 'standard' },
        { id: '1C', row: '1', col: 4, x: 130, y: 28, type: 'standard' },
        { id: '1D', row: '1', col: 5, x: 164, y: 28, type: 'standard' },
      ],
    },
  ],
};

/** §6.2 — cinema with tilted seats placed freely and a love seat booked as a pair. */
export const CINEMA_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'cinema3-hallA',
  name: 'Hall A',
  domain: 'cinema',
  canvas: { width: 1000, height: 1000 },
  seatSize: 50,
  legend: [
    { id: 'standard', label: 'Standard', defaultPriceTier: 'regular' },
    { id: 'recliner-couple', label: 'Couple Recliner', defaultPriceTier: 'premium' },
  ],
  priceTiers: [
    { id: 'regular', price: { amount: 1500, currency: 'MYR' } },
    { id: 'premium', price: { amount: 4500, currency: 'MYR' } },
  ],
  sections: [
    {
      id: 'main',
      rows: [
        { id: 'A', label: 'A', index: 0 },
        { id: 'L', label: 'L (Love Seats)', index: 11 },
      ],
      elements: [
        {
          id: 'screen',
          kind: 'screen',
          label: 'Screen',
          x: 500,
          y: 20,
          width: 800,
          height: 30,
        },
      ],
      seats: [
        { id: 'A1', label: '1', row: 'A', x: 200, y: 200, rotation: -5, type: 'standard' },
        { id: 'A2', label: '2', row: 'A', x: 260, y: 190, rotation: -3, type: 'standard' },
        {
          id: 'L1',
          label: '1',
          row: 'L',
          x: 600,
          y: 700,
          type: 'recliner-couple',
        },
        {
          id: 'L2',
          label: '2',
          row: 'L',
          x: 660,
          y: 700,
          type: 'recliner-couple',
        },
      ],
      // A pair booked only together: a group booked whole (§4.11, §4.12.4).
      groups: [
        {
          id: 'L-pair',
          kind: 'loveseat',
          label: 'Love seat L1–L2',
          seats: ['L1', 'L2'],
          booking: 'whole',
        },
      ],
    },
  ],
};

/** §6.3 — flight with cabin classes and exit row (reusable airframe config). */
export const FLIGHT_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'b738-2class-v1',
  name: 'Boeing 737-800, 2-class',
  domain: 'flight',
  canvas: { width: 192, height: 132 },
  seatSize: 28,
  legend: [
    { id: 'economy', label: 'Economy', defaultPriceTier: 'eco' },
    { id: 'business', label: 'Business', defaultPriceTier: 'biz' },
  ],
  priceTiers: [
    { id: 'eco', price: { amount: 0, currency: 'MYR' } },
    { id: 'biz', price: { amount: 0, currency: 'MYR' } },
  ],
  sections: [
    {
      id: 'business',
      label: 'Business',
      seats: [
        {
          id: '1A',
          row: '1',
          col: 1,
          x: 28,
          y: 28,
          type: 'business',
          attributes: ['window'],
        },
        {
          id: '1C',
          row: '1',
          col: 2,
          x: 62,
          y: 28,
          type: 'business',
          attributes: ['aisle'],
        },
        {
          id: '1D',
          row: '1',
          col: 4,
          x: 130,
          y: 28,
          type: 'business',
          attributes: ['aisle'],
        },
        {
          id: '1F',
          row: '1',
          col: 5,
          x: 164,
          y: 28,
          type: 'business',
          attributes: ['window'],
        },
      ],
    },
    {
      id: 'economy',
      label: 'Economy',
      seats: [
        {
          id: '12A',
          row: '12',
          col: 1,
          x: 28,
          y: 104,
          type: 'economy',
          attributes: ['window', 'exit-row'],
        },
        {
          id: '12B',
          row: '12',
          col: 2,
          x: 62,
          y: 104,
          type: 'economy',
          attributes: ['exit-row'],
        },
        {
          id: '12C',
          row: '12',
          col: 3,
          x: 96,
          y: 104,
          type: 'economy',
          attributes: ['aisle', 'exit-row'],
        },
      ],
    },
  ],
};

/**
 * A cinema laid out on a regular lattice. Four rows carry no seats:
 * `screen-1`/`screen-2` and `throw` sit in front of row A, and `cross-aisle`
 * between rows B and C. They reserve nothing; the space is there because the
 * seats' own `y` leave it. Col 3 is the centre aisle, skipped as in §6.1.
 */
export const CINEMA_GRID_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'cinema3-hallB',
  name: 'Hall B',
  domain: 'cinema',
  canvas: { width: 158, height: 260 },
  seatSize: 28,
  legend: [{ id: 'standard', label: 'Standard', defaultPriceTier: 'regular' }],
  priceTiers: [{ id: 'regular', price: { amount: 1500, currency: 'MYR' } }],
  sections: [
    {
      id: 'stalls',
      rows: [
        { id: 'screen-1', index: 0 },
        { id: 'screen-2', index: 1 },
        { id: 'throw', index: 2 },
        { id: 'A', label: 'A', index: 3 },
        { id: 'B', label: 'B', index: 4 },
        { id: 'cross-aisle', index: 5 },
        { id: 'C', label: 'C', index: 6 },
      ],
      elements: [
        {
          id: 'screen',
          kind: 'screen',
          label: 'SCREEN',
          x: 79,
          y: 45,
          width: 130,
          height: 62,
        },
      ],
      seats: [
        { id: 'A1', label: '1', row: 'A', col: 1, x: 28, y: 130, type: 'standard' },
        { id: 'A2', label: '2', row: 'A', col: 2, x: 62, y: 130, type: 'standard' },
        { id: 'A3', label: '3', row: 'A', col: 4, x: 130, y: 130, type: 'standard' },
        { id: 'B1', label: '1', row: 'B', col: 1, x: 28, y: 164, type: 'standard' },
        { id: 'B2', label: '2', row: 'B', col: 2, x: 62, y: 164, type: 'standard' },
        { id: 'B3', label: '3', row: 'B', col: 4, x: 130, y: 164, type: 'standard' },
        { id: 'C1', label: '1', row: 'C', col: 1, x: 28, y: 232, type: 'standard' },
      ],
    },
  ],
};

/** §6.4 — matching state via direct `mapId` (sparse: 3 of N seats listed). */
export const CINEMA_STATE_BY_MAP: KerusiState = {
  kerusi: '1.0',
  mapId: 'cinema3-hallA',
  updatedAt: '2026-08-17T09:14:00Z',
  seats: {
    A1: { status: 'booked' },
    L1: { status: 'held', holdExpires: '2026-08-17T09:24:00Z' },
    L2: { status: 'held', holdExpires: '2026-08-17T09:24:00Z' },
  },
};

/** §6.5 — session-scoped state for one flight date, referencing `sessionId`. */
export const FLIGHT_STATE_BY_SESSION: KerusiState = {
  kerusi: '1.0',
  sessionId: 'MH123-2026-08-17',
  updatedAt: '2026-08-17T09:14:00Z',
  seats: {
    '1A': { status: 'booked' },
  },
};
