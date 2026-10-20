import { describe, expect, it } from 'vitest';
import { KerusiMap, Seat } from './kerusi-map.model.js';
import { KerusiSession, KerusiState } from './kerusi-state.model.js';
import { BUS_MAP } from './kerusi-examples.fixture.js';
import {
  checkKerusiMap,
  checkKerusiSession,
  checkKerusiState,
  checkKerusiStateDelta,
  errorsOf,
  KerusiValidationError,
  validateDocumentSet,
  validateKerusiMap,
  validateKerusiSession,
} from './kerusi-validator.js';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('checkKerusiMap — non-throwing collection', () => {
  it('returns an empty array for a valid document', () => {
    expect(checkKerusiMap(BUS_MAP)).toEqual([]);
  });

  it('collects every fault instead of stopping at the first', () => {
    const map = clone(BUS_MAP);
    map.sections[0].seats[0].type = 'nope';
    map.sections[0].seats[1].priceTier = 'nope';
    (map.sections[0].seats[2] as { companions?: string[] }).companions = ['ghost'];

    expect(checkKerusiMap(map).map((v) => v.rule)).toEqual([
      'seat-type-reference',
      'seat-pricetier-reference',
      'companions-retired',
    ]);
  });

  it('throws the first collected error, and carries the rest along', () => {
    const map = clone(BUS_MAP);
    map.sections[0].seats[0].type = 'nope';
    map.sections[0].seats[1].type = 'also-nope';

    const collected = checkKerusiMap(map);
    try {
      validateKerusiMap(map);
      throw new Error('expected throw');
    } catch (e) {
      const err = e as KerusiValidationError;
      expect(err.rule).toBe(collected[0].rule);
      expect(err.id).toBe(collected[0].id);
      expect(err.violations).toHaveLength(2);
    }
  });

  it('does not throw for warning-severity findings', () => {
    const map = clone(BUS_MAP);
    map.sections[0].seats[0].accessibility = { transferArmrest: 'sideways' as never };

    const violations = checkKerusiMap(map);
    expect(violations.map((v) => v.rule)).toEqual(['accessibility-transfer-armrest']);
    expect(violations[0].severity).toBe('warning');
    expect(errorsOf(violations)).toEqual([]);
    expect(() => validateKerusiMap(map)).not.toThrow();
  });

  it('returns a shape violation for malformed input rather than crashing', () => {
    for (const bad of [null, undefined, 42, 'a map', []]) {
      const violations = checkKerusiMap(bad);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].severity).toBe('error');
    }
  });

  it('stops walking when legend or sections are missing, to keep the report readable', () => {
    expect(checkKerusiMap({ kerusi: '1.0', id: 'm' }).map((v) => v.rule)).toEqual([
      'map-canvas',
      'map-seat-size',
      'map-legend',
      'map-sections',
    ]);
  });
});

describe('version negotiation', () => {
  it('accepts a future minor version — unknown members are ignored, not rejected', () => {
    const map = clone(BUS_MAP);
    map.kerusi = '1.4' as never;
    expect(checkKerusiMap(map)).toEqual([]);
  });

  it('rejects a different major version', () => {
    const map = clone(BUS_MAP);
    map.kerusi = '2.0' as never;
    expect(checkKerusiMap(map).map((v) => v.rule)).toEqual(['map-version-unsupported']);
  });

  it('applies the same rule to states, deltas and sessions', () => {
    expect(
      checkKerusiState({ kerusi: '3.0', mapId: 'm', updatedAt: 't', seats: {} }).map((v) => v.rule),
    ).toContain('state-version-unsupported');
    expect(
      checkKerusiStateDelta({ kerusi: '3.0', mapId: 'm', updatedAt: 't', changes: {} }).map(
        (v) => v.rule,
      ),
    ).toContain('delta-version-unsupported');
    expect(checkKerusiSession({ kerusi: '3.0', id: 's', mapId: 'm' }).map((v) => v.rule)).toContain(
      'session-version-unsupported',
    );
  });
});

describe('id uniqueness', () => {
  it('rejects a duplicate seat id across sections (§4.3 global uniqueness)', () => {
    const map = clone(BUS_MAP);
    map.sections.push({ ...clone(map.sections[0]), id: 'upper' });
    expect(errorsOf(checkKerusiMap(map)).map((v) => v.rule)).toEqual([
      'seat-id-duplicate',
      'seat-id-duplicate',
      'seat-id-duplicate',
      'seat-id-duplicate',
    ]);
  });

  it('rejects a duplicate section id', () => {
    const map = clone(BUS_MAP);
    map.sections.push({ id: map.sections[0].id, seats: [] });
    expect(checkKerusiMap(map).map((v) => v.rule)).toEqual(['section-id-duplicate']);
  });

  it('rejects a duplicate seat type or price tier id (§4.6)', () => {
    const map = clone(BUS_MAP);
    map.legend.push({ id: 'standard' });
    map.priceTiers = [
      { id: 'regular', price: { amount: 100, currency: 'MYR' } },
      { id: 'regular', price: { amount: 200, currency: 'MYR' } },
    ];
    expect(checkKerusiMap(map).map((v) => v.rule)).toEqual([
      'seat-type-id-duplicate',
      'price-tier-id-duplicate',
    ]);
  });

  it('rejects a duplicate row id within a section, but not across sections', () => {
    const map = clone(BUS_MAP);
    map.sections[0].rows = [{ id: '1' }, { id: '1' }];
    expect(checkKerusiMap(map).map((v) => v.rule)).toEqual(['row-id-duplicate']);

    map.sections[0].rows = [{ id: '1' }];
    map.sections.push({ id: 'upper', rows: [{ id: '1' }], seats: [] });
    expect(checkKerusiMap(map)).toEqual([]);
  });
});

describe('§4.5 canvas and seat size', () => {
  it('rejects a canvas without a positive width and height', () => {
    const map = clone(BUS_MAP);
    map.canvas = { width: 0, height: 56 };
    expect(checkKerusiMap(map).map((v) => v.rule)).toEqual(['map-canvas-size']);
  });

  it('rejects a seat size that is not positive, on the map or a section', () => {
    const map = clone(BUS_MAP);
    map.seatSize = -1;
    map.sections[0].seatSize = 0;
    expect(checkKerusiMap(map).map((v) => v.rule)).toEqual(['map-seat-size', 'section-seat-size']);
  });

  it('rejects a rev 14 map, which has no canvas or seat size', () => {
    const map = clone(BUS_MAP) as Partial<KerusiMap>;
    delete map.canvas;
    delete map.seatSize;
    expect(errorsOf(checkKerusiMap(map)).map((v) => v.rule)).toEqual([
      'map-canvas',
      'map-seat-size',
    ]);
  });
});

describe('§4.3 seat position and adjacency', () => {
  it('requires x and y on every seat (§4.3.1)', () => {
    const map = clone(BUS_MAP);
    delete (map.sections[0].seats[0] as Partial<Seat>).y;
    const violations = checkKerusiMap(map);
    expect(violations.map((v) => v.rule)).toEqual(['seat-position']);
    expect(violations[0].id).toBe('1A');
  });

  it('accepts a seat on the very edge of the canvas', () => {
    const map = clone(BUS_MAP);
    Object.assign(map.sections[0].seats[0], { x: 0, y: 56 });
    Object.assign(map.sections[0].seats[3], { x: 192, y: 0 });
    expect(errorsOf(checkKerusiMap(map))).toEqual([]);
  });

  it('reports a seat past both edges of the canvas once per axis', () => {
    const map = clone(BUS_MAP);
    Object.assign(map.sections[0].seats[3], { x: 193, y: 60 });
    expect(checkKerusiMap(map).map((v) => [v.rule, v.path])).toEqual([
      ['seat-outside-canvas', 'sections[0].seats[3].x'],
      ['seat-outside-canvas', 'sections[0].seats[3].y'],
    ]);
  });

  it('accepts a seat with no row and no col: it simply has no neighbours', () => {
    const map = clone(BUS_MAP);
    delete map.sections[0].seats[0].row;
    delete map.sections[0].seats[0].col;
    expect(checkKerusiMap(map)).toEqual([]);
  });

  it('rejects a col without a row (§4.3.5)', () => {
    const map = clone(BUS_MAP);
    delete map.sections[0].seats[0].row;
    expect(checkKerusiMap(map).map((v) => v.rule)).toEqual(['seat-col-without-row']);
  });

  it('rejects a col that is not a positive integer', () => {
    const map = clone(BUS_MAP);
    map.sections[0].seats[0].col = 0;
    map.sections[0].seats[1].col = 1.5;
    expect(checkKerusiMap(map).map((v) => v.rule)).toEqual([
      'seat-col-invalid',
      'seat-col-invalid',
    ]);
  });

  it('rejects two seats sharing a row and col in one section, but not across sections', () => {
    const map = clone(BUS_MAP);
    map.sections[0].seats[1].col = 1;
    const violations = checkKerusiMap(map);
    expect(violations.map((v) => [v.rule, v.id])).toEqual([['seat-row-col-duplicate', '1B']]);

    const separate = clone(BUS_MAP);
    separate.sections.push({
      id: 'upper',
      seats: [{ id: 'U1', row: '1', col: 1, x: 28, y: 5, type: 'standard' }],
    });
    expect(errorsOf(checkKerusiMap(separate))).toEqual([]);
  });
});

describe('§4.2.3 row shapes', () => {
  const withShape = (shape: unknown): KerusiMap => {
    const map = clone(BUS_MAP);
    map.sections[0].rows = [{ id: '1', shape: shape as never }];
    return map;
  };

  it('accepts a line, an arc and a circle, whether or not the seats lie on them', () => {
    for (const shape of [
      { line: { from: [28, 28], to: [164, 28], cols: [1, 5] } },
      { arc: { center: [96, 300], radius: 270, start: -120, sweep: 60, cols: [1, 5] } },
      { circle: { center: [96, 28], radius: 20, start: 0, cols: [1, 5] } },
    ]) {
      expect(checkKerusiMap(withShape(shape))).toEqual([]);
    }
  });

  it('rejects a shape that is not exactly one known kind', () => {
    const line = { from: [0, 0], to: [10, 0], cols: [1, 2] };
    expect(checkKerusiMap(withShape({ line, circle: line })).map((v) => v.rule)).toEqual([
      'row-shape-kind',
    ]);
    expect(checkKerusiMap(withShape({ spiral: line })).map((v) => v.rule)).toEqual([
      'row-shape-kind',
    ]);
  });

  it('rejects a malformed shape: missing sweep, zero radius, bad cols', () => {
    for (const shape of [
      { arc: { center: [0, 0], radius: 10, start: 0, cols: [1, 2] } },
      { circle: { center: [0, 0], radius: 0, start: 0, cols: [1, 2] } },
      { line: { from: [0, 0], to: [10, 0], cols: [0, 2] } },
      { line: { from: [0], to: [10, 0], cols: [1, 2] } },
    ]) {
      expect(checkKerusiMap(withShape(shape)).map((v) => v.rule)).toEqual(['row-shape-invalid']);
    }
  });

  it('rejects reversed cols', () => {
    const violations = checkKerusiMap(
      withShape({ line: { from: [0, 0], to: [10, 0], cols: [4, 1] } }),
    );
    expect(violations.map((v) => [v.rule, v.path])).toEqual([
      ['row-shape-cols-reversed', 'sections[0].rows[0].shape.line.cols'],
    ]);
  });
});

describe('§4.4 element validation', () => {
  const withElements = (elements: unknown[]): KerusiMap => {
    const map = clone(BUS_MAP);
    map.sections[0].elements = elements as never;
    return map;
  };

  it('requires id and kind', () => {
    expect(
      checkKerusiMap(withElements([{ kind: 'exit', x: 96, y: 10 }])).map((v) => v.rule),
    ).toEqual(['element-id']);
    expect(checkKerusiMap(withElements([{ id: 'e1', x: 96, y: 10 }])).map((v) => v.rule)).toEqual([
      'element-kind',
    ]);
  });

  it('rejects a duplicate element id, across sections too (§4.6)', () => {
    const map = withElements([{ id: 'e1', kind: 'exit', x: 96, y: 10 }]);
    map.sections.push({
      id: 'upper',
      seats: [],
      elements: [{ id: 'e1', kind: 'exit', x: 96, y: 50 }],
    });
    expect(checkKerusiMap(map).map((v) => v.rule)).toEqual(['element-id-duplicate']);
  });

  it('rejects an element with no position (§4.4.1)', () => {
    const violations = checkKerusiMap(withElements([{ id: 'e1', kind: 'gap' }]));
    expect(violations.map((v) => v.rule)).toEqual(['element-position']);
    expect(violations[0].severity).toBe('error');
  });

  it('rejects an element off the canvas', () => {
    const violations = checkKerusiMap(withElements([{ id: 'e1', kind: 'exit', x: 96, y: 57 }]));
    expect(violations.map((v) => [v.rule, v.path])).toEqual([
      ['element-outside-canvas', 'sections[0].elements[0].y'],
    ]);
  });

  it('rejects a width or height that is not positive, and accepts any positive size', () => {
    expect(
      checkKerusiMap(
        withElements([{ id: 'e1', kind: 'screen', x: 96, y: 5, width: 0, height: -2 }]),
      ).map((v) => v.rule),
    ).toEqual(['element-size-invalid', 'element-size-invalid']);
    expect(
      checkKerusiMap(
        withElements([{ id: 'e1', kind: 'screen', x: 96, y: 5, width: 150.5, height: 4 }]),
      ),
    ).toEqual([]);
  });

  it('ignores a rev 14 row/col on an element, as members it does not recognize (§7)', () => {
    expect(
      checkKerusiMap(
        withElements([{ id: 'e1', kind: 'gap', x: 96, y: 10, row: 'nowhere', col: 3 }]),
      ),
    ).toEqual([]);
  });
});

describe('warnings: seat overlap (§4.3.1) and section bounds (§4.1)', () => {
  const looseMap = (seats: Partial<Seat>[], sectionSeatSize?: number): KerusiMap => ({
    kerusi: '1.0',
    id: 'case',
    canvas: { width: 1000, height: 1000 },
    seatSize: 40,
    legend: [{ id: 'standard' }],
    sections: [
      {
        id: 's',
        ...(sectionSeatSize ? { seatSize: sectionSeatSize } : {}),
        seats: seats.map((seat, i) => ({ id: `s${i}`, type: 'standard', x: 0, y: 0, ...seat })),
      },
    ],
  });

  it('warns once, at the later seat, and does not invalidate the map', () => {
    const map = looseMap([
      { x: 100, y: 100 },
      { x: 120, y: 110 },
    ]);
    const violations = checkKerusiMap(map);
    expect(violations.map((v) => [v.rule, v.severity, v.path])).toEqual([
      ['seat-overlap', 'warning', 'sections[0].seats[1]'],
    ]);
    expect(() => validateKerusiMap(map)).not.toThrow();
  });

  it('does not warn for seats exactly one seat size apart, which only touch', () => {
    expect(
      checkKerusiMap(
        looseMap([
          { x: 100, y: 100 },
          { x: 140, y: 100 },
        ]),
      ),
    ).toEqual([]);
  });

  it('turns the footprint by its rotation: 45° seats 40 apart overlap, 57 apart do not', () => {
    const pair = (dx: number) =>
      checkKerusiMap(
        looseMap([
          { x: 100, y: 100, rotation: 45 },
          { x: 100 + dx, y: 100, rotation: 45 },
        ]),
      ).map((v) => v.rule);
    expect(pair(40)).toEqual(['seat-overlap']);
    expect(pair(57)).toEqual([]);
  });

  it("uses a section's own seat size: 45 apart is clear at 40, overlapping at 50", () => {
    const seats = [
      { x: 100, y: 100 },
      { x: 145, y: 100 },
    ];
    expect(checkKerusiMap(looseMap(seats))).toEqual([]);
    expect(checkKerusiMap(looseMap(seats, 50)).map((v) => v.rule)).toEqual(['seat-overlap']);
  });

  it('warns for seats in two sections, which share one canvas', () => {
    const map = looseMap([{ x: 100, y: 100 }]);
    map.sections.push({ id: 'balcony', seats: [{ id: 'b', type: 'standard', x: 110, y: 100 }] });
    expect(checkKerusiMap(map).map((v) => [v.rule, v.path])).toEqual([
      ['seat-overlap', 'sections[1].seats[0]'],
    ]);
  });

  it("warns for a seat whose centre lies outside its section's bounds", () => {
    const map = looseMap([
      { x: 100, y: 100 },
      { x: 300, y: 100 },
    ]);
    map.sections[0].bounds = { x: 0, y: 0, width: 200, height: 200 };
    expect(checkKerusiMap(map).map((v) => [v.rule, v.severity, v.path])).toEqual([
      ['seat-outside-section-bounds', 'warning', 'sections[0].seats[1]'],
    ]);
  });
});

describe('§5.1.1 RFC 3339 timestamps', () => {
  const state = (updatedAt: string): unknown => ({
    kerusi: '1.0',
    mapId: 'm',
    updatedAt,
    seats: {},
  });

  it('accepts the profile the published schemas mean by format: date-time', () => {
    expect(checkKerusiState(state('2026-08-17T09:14:00Z'))).toEqual([]);
    expect(checkKerusiState(state('2026-08-17T21:15:00+08:00'))).toEqual([]);
    expect(checkKerusiState(state('2026-08-17T09:14:00.123Z'))).toEqual([]);
  });

  it('rejects the ISO 8601 forms rev 13 narrowed away', () => {
    // Seconds omitted, basic format, and a local time with no offset: each is
    // ISO 8601 and none can be parsed interoperably.
    for (const value of ['2026-08-17T09:14Z', '20260817T091400Z', '2026-08-17T09:14:00']) {
      expect(checkKerusiState(state(value)).map((v) => v.rule)).toEqual(['state-updatedat-format']);
    }
  });

  it('rejects a shape-valid but impossible date', () => {
    expect(checkKerusiState(state('2026-02-31T09:14:00Z')).map((v) => v.rule)).toEqual([
      'state-updatedat-format',
    ]);
  });

  it('checks holdExpires, which a countdown depends on', () => {
    const doc = {
      kerusi: '1.0',
      mapId: 'm',
      updatedAt: '2026-08-17T09:14:00Z',
      seats: { A1: { status: 'held', holdExpires: '2026-08-17T09:29Z' } },
    };
    const violations = checkKerusiState(doc);
    expect(violations.map((v) => v.rule)).toEqual(['seat-status-hold-expires-format']);
    expect(violations[0].id).toBe('A1');
  });

  it('checks a delta and a session too', () => {
    expect(
      checkKerusiStateDelta({
        kerusi: '1.0',
        mapId: 'm',
        updatedAt: 'yesterday',
        changes: {},
      }).map((v) => v.rule),
    ).toEqual(['state-updatedat-format']);
    expect(
      checkKerusiSession({
        kerusi: '1.0',
        id: 's',
        mapId: 'm',
        startsAt: '2026-08-17T19:30',
        endsAt: '2026-08-17T21:30:00+08:00',
      }).map((v) => v.rule),
    ).toEqual(['session-startsat-format']);
  });
});

describe('§5.3 sessions and document joins', () => {
  const session: KerusiSession = { kerusi: '1.0', id: 'sess-1', mapId: BUS_MAP.id };
  const state: KerusiState = {
    kerusi: '1.0',
    sessionId: 'sess-1',
    updatedAt: '2026-08-19T00:00:00Z',
    seats: {},
  };

  it('requires kerusi, id and mapId on a session', () => {
    expect(checkKerusiSession({ kerusi: '1.0' }).map((v) => v.rule)).toEqual([
      'session-id',
      'session-mapid',
    ]);
    expect(() => validateKerusiSession(session)).not.toThrow();
  });

  it('accepts a consistent map/session/state trio', () => {
    expect(validateDocumentSet({ map: BUS_MAP, session, state })).toEqual([]);
  });

  it('rejects a session pointing at a different map', () => {
    const wrong = { ...session, mapId: 'other-bus' };
    expect(validateDocumentSet({ map: BUS_MAP, session: wrong }).map((v) => v.rule)).toEqual([
      'session-map-mismatch',
    ]);
  });

  it('rejects a state pointing at a different map', () => {
    const wrong: KerusiState = { ...state, sessionId: undefined, mapId: 'other-bus' };
    expect(validateDocumentSet({ map: BUS_MAP, state: wrong }).map((v) => v.rule)).toEqual([
      'state-map-mismatch',
    ]);
  });

  it('rejects a state pointing at a different session', () => {
    const wrong: KerusiState = { ...state, sessionId: 'sess-2' };
    expect(validateDocumentSet({ map: BUS_MAP, session, state: wrong }).map((v) => v.rule)).toEqual(
      ['state-session-mismatch'],
    );
  });
});

describe('groups (§4.11)', () => {
  /** Two seats side by side and a group over them. */
  const groupMap = (groups: unknown): KerusiMap =>
    ({
      kerusi: '1.0',
      id: 'g',
      canvas: { width: 200, height: 100 },
      seatSize: 20,
      legend: [{ id: 'std' }],
      sections: [
        {
          id: 's',
          seats: [
            { id: 'A', x: 40, y: 50, type: 'std' },
            { id: 'B', x: 70, y: 50, type: 'std' },
            { id: 'C', x: 160, y: 50, type: 'std' },
          ],
          groups,
        },
      ],
    }) as KerusiMap;
  const sofa = { id: 'sofa', kind: 'sofa', seats: ['A', 'B'] };
  const rules = (groups: unknown) => checkKerusiMap(groupMap(groups)).map((v) => v.rule);

  it('accepts a group, with or without a shape, and a group of one seat', () => {
    expect(rules([sofa])).toEqual([]);
    expect(rules([{ ...sofa, shape: { rect: { x: 55, y: 50, width: 60, height: 30 } } }])).toEqual(
      [],
    );
    expect(rules([{ id: 'one', kind: 'table', seats: ['A'] }])).toEqual([]);
    expect(rules(undefined)).toEqual([]);
  });

  it('requires an id, a kind and at least one seat', () => {
    expect(rules([{ kind: 'sofa', seats: ['A'] }])).toEqual(['group-id']);
    expect(rules([{ id: 'x', seats: ['A'] }])).toEqual(['group-kind']);
    expect(rules([{ id: 'x', kind: 'sofa', seats: [] }])).toEqual(['group-seats']);
    expect(rules([{ id: 'x', kind: 'sofa' }])).toEqual(['group-seats']);
    expect(rules({ id: 'x' })).toEqual(['section-groups']);
  });

  it('rejects a seat that is not in the group’s own section', () => {
    expect(rules([{ ...sofa, seats: ['A', 'ghost'] }])).toEqual(['group-seat-unresolved']);
  });

  it('rejects a seat in two groups, or listed twice, at the later listing', () => {
    const violations = checkKerusiMap(
      groupMap([sofa, { id: 'other', kind: 'table', seats: ['B', 'C'] }]),
    );
    expect(violations.map((v) => [v.rule, v.id, v.path])).toEqual([
      ['group-seat-shared', 'other', 'sections[0].groups[1].seats[0]'],
    ]);
    expect(rules([{ ...sofa, seats: ['A', 'A'] }])).toEqual(['group-seat-shared']);
  });

  it('rejects a duplicate group id across the map', () => {
    expect(rules([sofa, { id: 'sofa', kind: 'table', seats: ['C'] }])).toEqual([
      'group-id-duplicate',
    ]);
  });

  it('wants exactly one well-formed shape, centred on the canvas', () => {
    const shaped = (shape: unknown) => rules([{ ...sofa, shape }]);
    expect(shaped({})).toEqual(['group-shape-kind']);
    expect(
      shaped({ rect: { x: 1, y: 1, width: 1, height: 1 }, circle: { center: [1, 1], radius: 1 } }),
    ).toEqual(['group-shape-kind']);
    expect(shaped({ oval: {} })).toEqual(['group-shape-kind']);
    expect(shaped({ circle: { center: [50, 50], radius: 0 } })).toEqual(['group-shape-invalid']);
    expect(shaped({ circle: { center: [50], radius: 5 } })).toEqual(['group-shape-invalid']);
    expect(shaped({ rect: { x: 50, y: 50, width: 0, height: 5 } })).toEqual([
      'group-shape-invalid',
    ]);
    expect(shaped({ rect: { x: 50, y: 50, width: 5, height: 5, rotation: 'up' } })).toEqual([
      'group-shape-invalid',
    ]);
    expect(shaped({ circle: { center: [500, 50], radius: 5 } })).toEqual([
      'group-shape-outside-canvas',
    ]);
    // Only the centre must be on the canvas: a shape may hang over the edge.
    expect(shaped({ circle: { center: [190, 50], radius: 40 } })).toEqual([
      'group-shape-overlaps-seat',
    ]);
  });

  it('warns, and does not reject, when a shape covers a seat outside its group', () => {
    const violations = checkKerusiMap(
      groupMap([{ ...sofa, shape: { rect: { x: 100, y: 50, width: 160, height: 30 } } }]),
    );
    expect(violations.map((v) => [v.rule, v.severity, v.id])).toEqual([
      ['group-shape-overlaps-seat', 'warning', 'sofa'],
    ]);
    expect(() =>
      validateKerusiMap(
        groupMap([{ ...sofa, shape: { rect: { x: 100, y: 50, width: 160, height: 30 } } }]),
      ),
    ).not.toThrow();
  });

  it('does not warn about the group’s own seats, or a shape that only touches a seat', () => {
    expect(rules([{ ...sofa, shape: { rect: { x: 55, y: 50, width: 60, height: 30 } } }])).toEqual(
      [],
    );
    // C's footprint starts at x 150: a rect ending exactly there touches, not overlaps.
    expect(
      rules([{ ...sofa, shape: { rect: { x: 100, y: 50, width: 100, height: 30 } } }]),
    ).toEqual([]);
  });
});

describe('booking modes and whole prices (§4.9.1, §4.12)', () => {
  const PRICED: KerusiMap = {
    ...clone(BUS_MAP),
    priceTiers: [
      { id: 'seat', price: { amount: 1000, currency: 'MYR' } },
      { id: 'hire', price: { amount: 9000, currency: 'MYR' } },
    ],
  };
  const withGroup = (group: Record<string, unknown>): KerusiMap => {
    const map = clone(PRICED);
    map.sections[0].groups = [
      { id: 'front', kind: 'bench', seats: ['1A', '1B'], ...group } as never,
    ];
    return map;
  };
  const rules = (map: KerusiMap) => checkKerusiMap(map).map((v) => v.rule);

  it('accepts every booking mode on every level, with a whole price on each', () => {
    const map = withGroup({ booking: 'either', wholePrice: { amount: 1800, currency: 'MYR' } });
    map.booking = 'either';
    map.wholePriceTier = 'hire';
    map.sections[0].booking = 'whole';
    map.sections[0].wholePriceTier = 'hire';
    expect(checkKerusiMap(map)).toEqual([]);
  });

  it('accepts a whole price on a level booked by the seat: a session may make it either', () => {
    expect(checkKerusiMap(withGroup({ wholePrice: { amount: 1800, currency: 'MYR' } }))).toEqual(
      [],
    );
  });

  it('rejects a booking mode it does not know, on the map, a section or a group', () => {
    const map = withGroup({ booking: 'all' });
    map.booking = 'exclusive' as never;
    map.sections[0].booking = 'Whole' as never;
    const found = checkKerusiMap(map);
    expect(found.map((v) => v.rule)).toEqual([
      'booking-mode-invalid',
      'booking-mode-invalid',
      'booking-mode-invalid',
    ]);
    expect(found.map((v) => v.path)).toEqual([
      'booking',
      'sections[0].booking',
      'sections[0].groups[0].booking',
    ]);
  });

  it('rejects a whole price tier the map does not declare, by the reference id', () => {
    const map = withGroup({ wholePriceTier: 'ghost' });
    expect(rules(map)).toEqual(['whole-price-tier-unresolved']);
    expect(checkKerusiMap(map)[0].id).toBe('front');
  });

  it('counts a whole price toward the one currency of the map (§4.9)', () => {
    expect(rules(withGroup({ wholePrice: { amount: 50, currency: 'USD' } }))).toEqual([
      'single-currency',
    ]);
  });
});

describe('a session’s booking modes (§4.12.1, §5.3)', () => {
  const SESSION: KerusiSession = { kerusi: '1.0', id: 'night', mapId: BUS_MAP.id };
  const MAP: KerusiMap = {
    ...clone(BUS_MAP),
    sections: [
      { ...clone(BUS_MAP.sections[0]), groups: [{ id: 'g', kind: 'bench', seats: ['1A'] }] },
    ],
  };

  it('accepts overrides that name the map’s own sections and groups', () => {
    const session = {
      ...SESSION,
      bookingModes: { map: 'either', sections: { main: 'seats' }, groups: { g: 'whole' } },
    } satisfies KerusiSession;
    expect(checkKerusiSession(session)).toEqual([]);
    expect(validateDocumentSet({ map: MAP, session })).toEqual([]);
  });

  it('rejects a mode it does not know, wherever it is set', () => {
    const session = {
      ...SESSION,
      bookingModes: { map: 'any', sections: { main: 'all' }, groups: { g: 'Whole' } },
    } as unknown as KerusiSession;
    const found = checkKerusiSession(session);
    expect(found.map((v) => v.rule)).toEqual([
      'session-booking-mode-invalid',
      'session-booking-mode-invalid',
      'session-booking-mode-invalid',
    ]);
    expect(found.map((v) => v.path)).toEqual([
      'bookingModes.map',
      'bookingModes.sections.main',
      'bookingModes.groups.g',
    ]);
  });

  it('rejects an override naming a section or group the map does not have, given the map', () => {
    const session: KerusiSession = {
      ...SESSION,
      bookingModes: { sections: { balcony: 'whole' }, groups: { 'table-9': 'whole' } },
    };
    // Alone, a session cannot know which ids its map has.
    expect(checkKerusiSession(session)).toEqual([]);
    const found = validateDocumentSet({ map: MAP, session });
    expect(found.map((v) => v.rule)).toEqual([
      'session-booking-mode-unresolved',
      'session-booking-mode-unresolved',
    ]);
    expect(found.map((v) => v.path)).toEqual([
      'bookingModes.sections.balcony',
      'bookingModes.groups.table-9',
    ]);
  });
});
