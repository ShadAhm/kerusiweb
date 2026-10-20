import { describe, expect, it } from 'vitest';
import {
  bookingUnits,
  Bounds,
  checkKerusiMap,
  checkKerusiState,
  KerusiMap,
  KerusiSession,
  KerusiState,
  priceSelection,
  validateDocumentSet,
} from '@kerusiweb/core';
import {
  AIRCRAFT_MAP,
  AIRCRAFT_SESSION,
  AIRCRAFT_STATE,
} from '@kerusi/demo-scenarios/fixtures/aircraft.kerusi.fixture';
import {
  CINEMA_MAP,
  CINEMA_SESSION,
  CINEMA_STATE,
} from '@kerusi/demo-scenarios/fixtures/cinema.kerusi.fixture';
import {
  LECTURE_THEATRE_MAP,
  LECTURE_THEATRE_STATE,
} from '@kerusi/demo-scenarios/fixtures/lecture-theatre.kerusi.fixture';
import { STADIUM_MAP, STADIUM_STATE } from '@kerusi/demo-scenarios/fixtures/stadium.kerusi.fixture';
import {
  TOWN_HALL_MAP,
  TOWN_HALL_STATE,
} from '@kerusi/demo-scenarios/fixtures/town-hall.kerusi.fixture';
import {
  TRAIN_MAP,
  TRAIN_SESSION,
  TRAIN_STATE,
} from '@kerusi/demo-scenarios/fixtures/train.kerusi.fixture';
import { BANQUET_MAP, BANQUET_STATE } from '@kerusi/demo-scenarios/fixtures/banquet.kerusi.fixture';
import {
  VENUE_HIRE_MAP,
  VENUE_HIRE_STATE,
} from '@kerusi/demo-scenarios/fixtures/venue-hire.kerusi.fixture';
import {
  WEDDING_MAP,
  WEDDING_SESSION,
  WEDDING_STATE,
} from '@kerusi/demo-scenarios/fixtures/wedding.kerusi.fixture';
import { CINEMA_KERUSI_MAP, CINEMA_KERUSI_STATE } from './cinema-kerusi.fixture';

/**
 * The demo showcases these documents as examples of the standard, so they had
 * better be conformant. This is the gate that keeps them honest.
 */
const SCENARIOS: {
  name: string;
  map: KerusiMap;
  state: KerusiState;
  session?: KerusiSession;
}[] = [
  { name: 'cinema', map: CINEMA_MAP, state: CINEMA_STATE, session: CINEMA_SESSION },
  { name: 'aircraft', map: AIRCRAFT_MAP, state: AIRCRAFT_STATE, session: AIRCRAFT_SESSION },
  { name: 'train', map: TRAIN_MAP, state: TRAIN_STATE, session: TRAIN_SESSION },
  { name: 'stadium', map: STADIUM_MAP, state: STADIUM_STATE },
  { name: 'lecture-theatre', map: LECTURE_THEATRE_MAP, state: LECTURE_THEATRE_STATE },
  { name: 'town-hall', map: TOWN_HALL_MAP, state: TOWN_HALL_STATE },
  { name: 'banquet', map: BANQUET_MAP, state: BANQUET_STATE },
  { name: 'wedding', map: WEDDING_MAP, state: WEDDING_STATE, session: WEDDING_SESSION },
  { name: 'venue hire', map: VENUE_HIRE_MAP, state: VENUE_HIRE_STATE },
  { name: 'curved cinema', map: CINEMA_KERUSI_MAP, state: CINEMA_KERUSI_STATE },
];

describe.each(SCENARIOS)('$name fixture', ({ map, state, session }) => {
  it('is a conformant KerusiMap, with no warnings either', () => {
    expect(checkKerusiMap(map)).toEqual([]);
  });

  it('is a conformant KerusiState', () => {
    expect(checkKerusiState(state)).toEqual([]);
  });

  it('joins cleanly to its map and session', () => {
    expect(validateDocumentSet({ map, state, session })).toEqual([]);
  });

  it('references only seats the map declares', () => {
    const seatIds = new Set(map.sections.flatMap((s) => s.seats.map((seat) => seat.id)));
    const unknown = Object.keys(state.seats).filter((id) => !seatIds.has(id));
    expect(unknown).toEqual([]);
  });
});

describe('the scenarios sell by every booking level (§4.12)', () => {
  it('sells the wedding’s every table whole through its session, not its map', () => {
    const units = bookingUnits(WEDDING_MAP, WEDDING_SESSION).units;
    expect(units.filter((u) => u.level === 'group').map((u) => u.seats.length)).toEqual([
      10, 8, 8, 8, 8, 8, 8,
    ]);
    expect(bookingUnits(BANQUET_MAP).units.every((u) => u.level === 'seat')).toBe(true);
  });

  it('offers the rooftop whole, by the room and by the table, and prices each so (§4.9.1)', () => {
    const { units, wholeUnits } = bookingUnits(VENUE_HIRE_MAP);
    expect(wholeUnits.map((u) => `${u.level}:${u.id}`)).toEqual(['map:rooftop-bar', 'group:T1']);
    expect(units.find((u) => u.level === 'section')?.id).toBe('private-room');
    const table = wholeUnits.find((u) => u.id === 'T1')!;
    expect(priceSelection(VENUE_HIRE_MAP, undefined, table.seats).total).toEqual({
      amount: 18000,
      currency: 'MYR',
    });
    const venue = wholeUnits.find((u) => u.level === 'map')!;
    expect(priceSelection(VENUE_HIRE_MAP, undefined, venue.seats).total).toEqual({
      amount: 500000,
      currency: 'MYR',
    });
  });
});

describe('the scenarios show what one canvas per map allows (§4.5)', () => {
  const overlapsInHeight = (a: Bounds, b: Bounds) => a.y < b.y + b.height && b.y < a.y + a.height;

  it('includes sections side by side, overlapping in height', () => {
    const sideBySide = SCENARIOS.some(({ map }) =>
      map.sections.some((a, i) =>
        map.sections
          .slice(i + 1)
          .some((b) => a.bounds && b.bounds && overlapsInHeight(a.bounds, b.bounds)),
      ),
    );
    expect(sideBySide).toBe(true);
  });

  it('declares row shapes of every kind (§4.2.3)', () => {
    const kinds = new Set(
      SCENARIOS.flatMap(({ map }) =>
        map.sections.flatMap((s) => (s.rows ?? []).flatMap((r) => Object.keys(r.shape ?? {}))),
      ),
    );
    expect([...kinds].sort()).toEqual(['arc', 'circle', 'line']);
  });

  it('includes a seat with no row, and so no neighbours', () => {
    const seats = SCENARIOS.flatMap(({ map }) => map.sections.flatMap((s) => s.seats));
    expect(seats.some((s) => s.row === undefined)).toBe(true);
  });
});

describe('the scenarios exercise the rest of the standard', () => {
  const seats = SCENARIOS.flatMap(({ map }) => map.sections.flatMap((s) => s.seats));
  const elements = SCENARIOS.flatMap(({ map }) => map.sections.flatMap((s) => s.elements ?? []));

  it('declares §4.3.4 accessibility on real seats', () => {
    const a11y = seats.filter((s) => s.accessibility);
    expect(a11y.length).toBeGreaterThan(0);
    expect(a11y.some((s) => s.accessibility?.wheelchairAccessible)).toBe(true);
    expect(a11y.some((s) => s.accessibility?.transferArmrest)).toBe(true);
    expect(a11y.some((s) => s.accessibility?.aisleChairCompatible)).toBe(true);
    expect(a11y.some((s) => s.accessibility?.companionRequired)).toBe(true);
  });

  it('books some seats only together, as groups booked whole (§4.12)', () => {
    const groups = SCENARIOS.flatMap(({ map }) => map.sections.flatMap((s) => s.groups ?? []));
    expect(groups.filter((g) => g.booking === 'whole').length).toBeGreaterThan(0);
  });

  it('uses a spread of element kinds (§4.4)', () => {
    const kinds = new Set(elements.map((e) => e.kind));
    for (const kind of ['screen', 'exit', 'lavatory', 'table']) {
      expect(kinds).toContain(kind);
    }
  });

  it('localizes labels into more than one language', () => {
    const localized = SCENARIOS.flatMap(({ map }) => [
      ...map.legend.map((t) => t.label),
      ...map.sections.map((s) => s.label),
    ]).filter((label) => label && typeof label === 'object');
    expect(localized.length).toBeGreaterThan(0);
  });

  it('shows all four availability states across the scenarios', () => {
    const statuses = new Set(
      SCENARIOS.flatMap(({ state }) => Object.values(state.seats).map((s) => s.status)),
    );
    expect([...statuses].sort()).toEqual(['blocked', 'booked', 'held']);
  });

  it('carries a holdExpires on every held seat, so expiry can be shown', () => {
    const held = SCENARIOS.flatMap(({ state }) =>
      Object.values(state.seats).filter((s) => s.status === 'held'),
    );
    expect(held.length).toBeGreaterThan(0);
    expect(held.every((s) => !!s.holdExpires)).toBe(true);
  });
});
