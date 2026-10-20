import { Group, KerusiMap, KerusiState, Seat } from '@kerusiweb/core';

/**
 * A rooftop bar that sells by the seat, by the table, by the room, or the whole
 * place: every booking level of §4.12 on one map, as in the standard's lounge
 * (§6.8).
 *
 * - The venue is `either`: book seats, or hire the whole place at a venue price.
 *   It has no shape to press, so the app offers it with a button of its own,
 *   built from the map's whole units (D19).
 * - Table 1 on the terrace is `either` with a table price: sold by the seat, or
 *   whole from its tabletop.
 * - Table 2 is sold by the seat only.
 * - The private room is `whole`: a tap on any of its seats takes the room.
 * - The bar stools are sold one by one.
 *
 * A selection's price never depends on how it was picked (§4.9.1): four seats
 * of Table 1 tapped one by one cost the table price.
 */

const SEAT = 30;
const TABLE_RADIUS = 36;
const RING = TABLE_RADIUS + SEAT * 0.6;

/** The rotation that turns a seat at angle `phi` on a ring to face the ring's centre. */
function facingCentre(phi: number): number {
  const rotation = (Math.atan2(-Math.cos(phi), Math.sin(phi)) * 180) / Math.PI;
  return Math.round(rotation * 10) / 10;
}

/** Four chairs round a table, seat 1 at the top, clockwise. */
function tableOfFour(n: number, cx: number, cy: number): Seat[] {
  return Array.from({ length: 4 }, (_, i) => {
    const phi = -Math.PI / 2 + (i / 4) * Math.PI * 2;
    return {
      id: `T${n}-${i + 1}`,
      label: String(i + 1),
      row: `T${n}`,
      col: i + 1,
      x: Math.round((cx + Math.cos(phi) * RING) * 10) / 10,
      y: Math.round((cy + Math.sin(phi) * RING) * 10) / 10,
      rotation: facingCentre(phi),
      type: 'chair',
    };
  });
}

const TABLE_1 = tableOfFour(1, 120, 140);
const TABLE_2 = tableOfFour(2, 290, 140);

/** Five stools along the bar. */
const STOOLS: Seat[] = Array.from({ length: 5 }, (_, i) => ({
  id: `B${i + 1}`,
  label: String(i + 1),
  row: 'B',
  col: i + 1,
  x: 90 + i * 55,
  y: 300,
  type: 'stool',
}));

/** Three places down each side of the private room's long table, facing it. */
const ROOM: Seat[] = [130, 200, 270].flatMap((y, i) => [
  { id: `R${i + 1}L`, label: `${i + 1}L`, x: 450, y, rotation: 90, type: 'chair' },
  { id: `R${i + 1}R`, label: `${i + 1}R`, x: 550, y, rotation: 270, type: 'chair' },
]);

const TERRACE_GROUPS: Group[] = [
  {
    id: 'T1',
    kind: 'table',
    label: 'Table 1',
    seats: TABLE_1.map((s) => s.id),
    shape: { circle: { center: [120, 140], radius: TABLE_RADIUS } },
    booking: 'either',
    wholePrice: { amount: 18000, currency: 'MYR' },
  },
  {
    id: 'T2',
    kind: 'table',
    label: 'Table 2',
    seats: TABLE_2.map((s) => s.id),
    shape: { circle: { center: [290, 140], radius: TABLE_RADIUS } },
  },
];

export const VENUE_HIRE_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'rooftop-bar',
  name: 'The Rooftop',
  domain: 'bar',
  canvas: { width: 620, height: 380 },
  seatSize: SEAT,
  // Book seats, or hire the whole place (§4.12).
  booking: 'either',
  wholePrice: { amount: 500000, currency: 'MYR' },
  legend: [
    { id: 'chair', label: 'Chair', defaultPriceTier: 'seat' },
    { id: 'stool', label: 'Bar stool', form: 'stool', defaultPriceTier: 'stool' },
  ],
  priceTiers: [
    { id: 'seat', label: 'Seat', price: { amount: 5000, currency: 'MYR' } },
    { id: 'stool', label: 'Stool', price: { amount: 3500, currency: 'MYR' } },
    { id: 'room', label: 'Room hire', price: { amount: 120000, currency: 'MYR' } },
  ],
  sections: [
    {
      id: 'terrace',
      label: 'Terrace',
      index: 0,
      bounds: { x: 20, y: 40, width: 380, height: 320 },
      elements: [{ id: 'bar', kind: 'bar', label: 'Bar', x: 200, y: 345, width: 300, height: 18 }],
      seats: [...TABLE_1, ...TABLE_2, ...STOOLS],
      groups: TERRACE_GROUPS,
    },
    {
      id: 'private-room',
      label: 'Private room',
      index: 1,
      bounds: { x: 420, y: 40, width: 160, height: 320 },
      // Hired only whole, at the room price (§4.9.1, §4.12).
      booking: 'whole',
      wholePriceTier: 'room',
      seats: ROOM,
      groups: [
        {
          id: 'long-table',
          kind: 'table',
          label: 'Long table',
          seats: ROOM.map((s) => s.id),
          shape: { rect: { x: 500, y: 200, width: 56, height: 200 } },
        },
      ],
    },
  ],
};

/** Nothing taken yet, so the venue can still be hired whole. */
export const VENUE_HIRE_STATE: KerusiState = {
  kerusi: '1.0',
  mapId: 'rooftop-bar',
  updatedAt: '2026-10-20T18:00:00+08:00',
  seats: {},
};
