import { describe, expect, it } from 'vitest';
import { Group, KerusiMap, Seat } from '../kerusi/kerusi-map.model.js';
import { KerusiState } from '../kerusi/kerusi-state.model.js';
import { buildRenderModel } from '../render/build-render-model.js';
import {
  DEFAULT_SEAT_ARIA_STRINGS,
  disallowedAnnouncement,
  SeatAriaStrings,
  seatAriaLabel,
} from './seat-aria.js';

const mapWith = (seat: Seat): KerusiMap => ({
  kerusi: '1.0',
  id: 'm',
  canvas: { width: 200, height: 200 },
  seatSize: 28,
  legend: [{ id: 'business', label: { en: 'Business class' }, defaultPriceTier: 'biz' }],
  priceTiers: [{ id: 'biz', price: { amount: 45000, currency: 'MYR' } }],
  sections: [
    {
      id: 'cabin',
      rows: [{ id: '12', label: '12' }],
      seats: [seat],
    },
  ],
});

const labelFor = (seat: Seat, state?: KerusiState) =>
  seatAriaLabel(buildRenderModel(mapWith(seat), state).seatsById.get(seat.id)!, 'en');

const BASE: Seat = { id: '12A', label: 'A', row: '12', col: 1, x: 50, y: 50, type: 'business' };

describe('seatAriaLabel', () => {
  it('leads with the position, then type, price and status', () => {
    // Intl separates the currency code from the amount with U+00A0, so match
    // on the parts rather than a literal that depends on which space it used.
    expect(labelFor(BASE)).toMatch(/^Row 12, seat A, Business class, MYR.450\.00, available\.$/);
  });

  it('omits the row when the seat has none', () => {
    const rowless: Seat = { id: 'S1', label: '1', x: 50, y: 50, type: 'business' };
    expect(labelFor(rowless)).toContain('Seat 1,');
  });

  it('says so when a seat carries no price — a valid state (§4.9)', () => {
    const unpriced = buildRenderModel({
      ...mapWith(BASE),
      priceTiers: undefined,
      legend: [{ id: 'business', label: 'Business class' }],
    }).seatsById.get('12A')!;
    expect(seatAriaLabel(unpriced, 'en')).toContain('no price');
  });

  it('announces each unavailable status distinctly', () => {
    const state = (status: 'booked' | 'blocked' | 'held', holdExpires?: string): KerusiState => ({
      kerusi: '1.0',
      mapId: 'm',
      updatedAt: 't',
      seats: { '12A': { status, holdExpires } },
    });
    expect(labelFor(BASE, state('booked'))).toContain('booked, unavailable');
    expect(labelFor(BASE, state('blocked'))).toContain('blocked by the venue, unavailable');
    expect(labelFor(BASE, state('held'))).toContain('on hold, unavailable');
  });

  it('includes the hold expiry time when the document supplies one', () => {
    const held: KerusiState = {
      kerusi: '1.0',
      mapId: 'm',
      updatedAt: 't',
      seats: { '12A': { status: 'held', holdExpires: '2026-08-19T09:24:00Z' } },
    };
    expect(labelFor(BASE, held)).toMatch(/on hold until .+, unavailable/);
  });

  it('announces every §4.3.4 accessibility property', () => {
    const label = labelFor({
      ...BASE,
      accessibility: {
        wheelchairAccessible: true,
        transferArmrest: 'left',
        aisleChairCompatible: true,
        companionRequired: true,
      },
    });
    expect(label).toContain('wheelchair accessible');
    expect(label).toContain('transfer armrest left');
    expect(label).toContain('aisle chair compatible');
    expect(label).toContain('companion seat required');
  });

  it('says nothing about accessibility when the seat declares none', () => {
    expect(labelFor(BASE)).not.toMatch(/wheelchair|armrest|companion/);
  });

  it('appends descriptive attributes last', () => {
    const label = labelFor({ ...BASE, attributes: ['window', 'exit-row'] });
    expect(label.endsWith('window, exit-row.')).toBe(true);
  });

  it('leaves selection state to aria-pressed, so it is not announced twice', () => {
    expect(labelFor(BASE)).not.toContain('selected');
  });

  it('localizes the price to the given locale', () => {
    const seat = buildRenderModel(mapWith(BASE)).seatsById.get('12A')!;
    // ms-MY renders MYR as "RM"; en does not.
    expect(seatAriaLabel(seat, 'ms-MY')).toContain('RM');
  });
});

describe('seatAriaLabel — aisles (§4.3.5, D6)', () => {
  const rowOf = (seats: Seat[]): KerusiMap => ({
    ...mapWith(BASE),
    sections: [{ id: 'cabin', rows: [{ id: '12', label: '12' }], seats }],
  });
  const seat = (id: string, col: number, x: number): Seat => ({
    id,
    label: id.slice(2),
    row: '12',
    col,
    x,
    y: 50,
    type: 'business',
  });
  // Cols 1, 2, 4: col 3 is skipped, so an aisle runs between 12B and 12D.
  const model = buildRenderModel(
    rowOf([seat('12A', 1, 30), seat('12B', 2, 60), seat('12D', 4, 120)]),
  );
  const label = (id: string) => seatAriaLabel(model.seatsById.get(id)!, 'en');

  it('says a seat is next to an aisle when the next seat skips a col', () => {
    expect(label('12B')).toMatch(/^Row 12, seat B, next to an aisle, /);
    expect(label('12D')).toMatch(/^Row 12, seat D, next to an aisle, /);
  });

  it('says nothing about an aisle between neighbours', () => {
    expect(label('12A')).not.toContain('aisle');
  });

  it('reads the aisle from adjacency, not from the gap on the canvas', () => {
    // Neighbours drawn far apart are still neighbours.
    const wide = buildRenderModel(rowOf([seat('12A', 1, 30), seat('12B', 2, 180)]));
    expect(seatAriaLabel(wide.seatsById.get('12A')!, 'en')).not.toContain('aisle');
  });
});

describe('disallowedAnnouncement', () => {
  const seat = () => buildRenderModel(mapWith(BASE)).seatsById.get('12A')!;

  it('names the seat and the reason', () => {
    expect(disallowedAnnouncement(seat(), 'held')).toBe(
      'Row 12, seat A is held by another customer.',
    );
    expect(disallowedAnnouncement(seat(), 'max-selection')).toContain(
      'would exceed the seat limit',
    );
    expect(disallowedAnnouncement(seat(), 'companion-unavailable')).toContain(
      'must be booked with a seat that is unavailable',
    );
  });
});

describe('seatAriaLabel for a seat in a group (§4.11)', () => {
  const groupMap = (label?: string): KerusiMap => ({
    ...mapWith(BASE),
    sections: [
      {
        id: 'cabin',
        rows: [{ id: '12', label: '12' }],
        seats: [BASE],
        groups: [{ id: 'g', kind: 'table', label, seats: ['12A'], shape: undefined } as Group],
      },
    ],
  });
  const seatOf = (label?: string) => buildRenderModel(groupMap(label)).seatsById.get('12A')!;

  it('says the group in place of the row: "Table 3, seat A"', () => {
    expect(seatAriaLabel(seatOf('Table 3'), 'en')).toMatch(/^Table 3, seat A, Business class,/);
  });

  it('keeps the row for a group with no label, which names nothing', () => {
    expect(seatAriaLabel(seatOf(undefined), 'en')).toMatch(/^Row 12, seat A, Business class,/);
  });

  it('takes the wording from the strings a caller supplies, and falls back to English without one', () => {
    const strings: SeatAriaStrings = {
      ...DEFAULT_SEAT_ARIA_STRINGS,
      groupSeat: (group, seat) => `${seat} at ${group}`,
    };
    expect(seatAriaLabel(seatOf('Table 3'), 'en', strings)).toMatch(/^A at Table 3, Business/);

    // A caller written before groups existed supplies no `groupSeat`.
    const { groupSeat: _omitted, ...before } = DEFAULT_SEAT_ARIA_STRINGS;
    expect(seatAriaLabel(seatOf('Table 3'), 'en', before)).toMatch(/^Table 3, seat A, Business/);
  });

  it('names the group when a selection is refused too', () => {
    expect(disallowedAnnouncement(seatOf('Table 3'), 'booked')).toBe(
      'Table 3, seat A is already booked.',
    );
  });
});
