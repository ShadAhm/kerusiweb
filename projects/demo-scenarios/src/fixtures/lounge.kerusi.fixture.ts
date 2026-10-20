import { KerusiMap, KerusiState, Seat, SeatForm } from '@kerusiweb/core';

/**
 * A lounge with one seat of every registered form (§4.7.1), so the outlines can
 * be compared side by side.
 *
 * Row A draws each form untouched, facing the stage. Row B draws the same forms
 * again, turned to face down the canvas, to show the outline turns with the
 * seat. Below them, a sofa is three places of the `sofa` form, a pew is four of
 * `bench`, and a second pew runs up the right-hand wall, turned a quarter.
 *
 * A `form` is only a drawing hint (§4.7.1): it changes no price, no neighbour
 * and no footprint, which is why two types here share a price tier.
 */

/** Every form, in the order the legend lists them. `standard` declares none. */
const FORMS: readonly (SeatForm | undefined)[] = [
  undefined,
  'chair',
  'armchair',
  'stool',
  'recliner',
  'beanbag',
  'cushion',
  'wheelchair-space',
];

const TYPE_ID = (form: SeatForm | undefined): string => form ?? 'standard';

/** The horizontal pitch of rows A and B, in canvas units. */
const PITCH = 62;
const LEFT = 50;

/** One row, one seat per form, optionally turned. */
function formRow(row: string, y: number, rotation?: number): Seat[] {
  return FORMS.map((form, i) => ({
    id: `${row}${i + 1}`,
    row,
    col: i + 1,
    x: LEFT + i * PITCH,
    y,
    type: TYPE_ID(form),
    ...(rotation ? { rotation } : {}),
    ...(form === 'wheelchair-space' ? { accessibility: { wheelchairAccessible: true } } : {}),
  }));
}

/** Seats `count` places of one form side by side, `pitch` apart, from (x, y). */
function places(
  row: string,
  type: string,
  count: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  rotation?: number,
): Seat[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${row}${i + 1}`,
    row,
    col: i + 1,
    x: x + i * dx,
    y: y + i * dy,
    type,
    ...(rotation ? { rotation } : {}),
  }));
}

export const LOUNGE_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'lounge',
  name: 'Lounge',
  domain: 'lounge',
  canvas: { width: 560, height: 420 },
  seatSize: 40,
  legend: [
    { id: 'standard', label: 'Standard', defaultPriceTier: 'regular' },
    { id: 'chair', label: 'Chair', form: 'chair', defaultPriceTier: 'regular' },
    { id: 'armchair', label: 'Armchair', form: 'armchair', defaultPriceTier: 'premium' },
    { id: 'stool', label: 'Stool', form: 'stool', defaultPriceTier: 'regular' },
    { id: 'recliner', label: 'Recliner', form: 'recliner', defaultPriceTier: 'premium' },
    { id: 'beanbag', label: 'Beanbag', form: 'beanbag', defaultPriceTier: 'regular' },
    { id: 'cushion', label: 'Floor cushion', form: 'cushion', defaultPriceTier: 'regular' },
    {
      id: 'wheelchair-space',
      label: 'Wheelchair space',
      form: 'wheelchair-space',
      defaultPriceTier: 'regular',
    },
    { id: 'sofa', label: 'Sofa place', form: 'sofa', defaultPriceTier: 'premium' },
    { id: 'bench', label: 'Pew place', form: 'bench', defaultPriceTier: 'regular' },
  ],
  priceTiers: [
    { id: 'regular', label: 'Regular', price: { amount: 2500, currency: 'MYR' } },
    { id: 'premium', label: 'Premium', price: { amount: 4500, currency: 'MYR' } },
  ],
  sections: [
    {
      id: 'lounge',
      label: 'Lounge',
      elements: [
        { id: 'stage', kind: 'stage', label: 'Stage', x: 280, y: 30, width: 400, height: 36 },
      ],
      seats: [
        ...formRow('A', 100),
        ...formRow('B', 180, 180),
        ...places('S', 'sofa', 3, 80, 270, 42, 0),
        ...places('P', 'bench', 4, 80, 350, 42, 0),
        ...places('W', 'bench', 4, 500, 260, 0, 42, 90),
      ],
    },
  ],
};

export const LOUNGE_STATE: KerusiState = {
  kerusi: '1.0',
  mapId: 'lounge',
  updatedAt: '2026-10-20T20:00:00+08:00',
  seats: {
    A2: { status: 'held', holdExpires: '2026-10-20T20:08:00+08:00' },
    A3: { status: 'booked' },
    A5: { status: 'booked' },
    B3: { status: 'booked' },
    B4: { status: 'held', holdExpires: '2026-10-20T20:08:00+08:00' },
    S2: { status: 'booked' },
    P3: { status: 'booked' },
    W2: { status: 'held', holdExpires: '2026-10-20T20:08:00+08:00' },
  },
};
