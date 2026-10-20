import {
  KerusiValidationError,
  validateKerusiMap,
  validateKerusiState,
  validateKerusiStateDelta,
} from './kerusi-validator.js';
import { Seat } from './kerusi-map.model.js';
import { KerusiState, KerusiStateDelta } from './kerusi-state.model.js';
import { BUS_MAP, CINEMA_GRID_MAP, CINEMA_MAP, FLIGHT_MAP } from './kerusi-examples.fixture.js';

// Deep-clone a fixture so a negative test can corrupt it without leaking into
// other tests that share the same imported object.
const clone = <T>(v: T): T => structuredClone(v);

describe('validateKerusiMap — valid documents', () => {
  it('accepts the §6.1 bus map', () => {
    expect(() => validateKerusiMap(BUS_MAP)).not.toThrow();
  });
  it('accepts the §6.2 cinema map', () => {
    expect(() => validateKerusiMap(CINEMA_MAP)).not.toThrow();
  });
  it('accepts the §6.3 flight map', () => {
    expect(() => validateKerusiMap(FLIGHT_MAP)).not.toThrow();
  });
  it('accepts the lattice cinema map', () => {
    expect(() => validateKerusiMap(CINEMA_GRID_MAP)).not.toThrow();
  });
});

describe('validateKerusiMap — referential integrity (§4.6)', () => {
  it('rejects a leftover companions list, retired in rev 17, and says a group replaces it', () => {
    const map = clone(CINEMA_MAP);
    // A rev 16 map: the pair as companions rather than a group.
    (map.sections[0].seats.find((s) => s.id === 'L1') as { companions?: string[] }).companions = [
      'L2',
    ];
    try {
      validateKerusiMap(map);
      throw new Error('expected validation to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(KerusiValidationError);
      const err = e as KerusiValidationError;
      expect(err.rule).toBe('companions-retired');
      expect(err.id).toBe('L1');
      expect(err.message).toMatch(/group/);
    }
  });

  it('rejects an empty companions list too: the member is reserved (§4.12.4)', () => {
    const map = clone(CINEMA_MAP);
    (map.sections[0].seats[0] as { companions?: string[] }).companions = [];
    expect(() => validateKerusiMap(map)).toThrowError(/companions/);
  });

  it('rejects an unknown seat type', () => {
    const map = clone(BUS_MAP);
    map.sections[0].seats[0].type = 'nonexistent';
    try {
      validateKerusiMap(map);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as KerusiValidationError).rule).toBe('seat-type-reference');
      expect((e as KerusiValidationError).id).toBe('1A');
    }
  });

  it('rejects an unknown priceTier reference', () => {
    const map = clone(CINEMA_MAP);
    map.sections[0].seats.find((s) => s.id === 'A1')!.priceTier = 'ghost';
    try {
      validateKerusiMap(map);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as KerusiValidationError).rule).toBe('seat-pricetier-reference');
    }
  });

  it('rejects a dangling row reference when the section declares rows', () => {
    const map = clone(CINEMA_MAP);
    map.sections[0].seats.find((s) => s.id === 'A1')!.row = 'Z';
    try {
      validateKerusiMap(map);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as KerusiValidationError).rule).toBe('seat-row-reference');
    }
  });

  it('treats a free-text row as opaque when the section declares no rows', () => {
    const map = clone(BUS_MAP); // no `rows` array on the section
    map.sections[0].seats[0].row = 'anything-goes';
    expect(() => validateKerusiMap(map)).not.toThrow();
  });
});

describe('validateKerusiMap — positioning (§4.3.1)', () => {
  it('rejects a seat with no x', () => {
    const map = clone(BUS_MAP);
    delete (map.sections[0].seats[0] as Partial<Seat>).x;
    try {
      validateKerusiMap(map);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as KerusiValidationError).rule).toBe('seat-position');
      expect((e as KerusiValidationError).id).toBe('1A');
    }
  });

  it('rejects a seat off the canvas', () => {
    const map = clone(BUS_MAP);
    map.sections[0].seats[0].x = map.canvas.width + 1;
    expect(() => validateKerusiMap(map)).toThrowError(/outside the canvas/);
  });

  it('does not throw for overlapping seats, which are only a warning', () => {
    const map = clone(BUS_MAP);
    map.sections[0].seats[1].x = map.sections[0].seats[0].x + 1;
    expect(() => validateKerusiMap(map)).not.toThrow();
  });
});

describe('validateKerusiMap — single currency (§4.9)', () => {
  it('rejects a map that mixes currencies', () => {
    const map = clone(CINEMA_MAP);
    map.priceTiers!.find((t) => t.id === 'premium')!.price.currency = 'USD';
    try {
      validateKerusiMap(map);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as KerusiValidationError).rule).toBe('single-currency');
      expect((e as KerusiValidationError).message).toMatch(/MYR/);
      expect((e as KerusiValidationError).message).toMatch(/USD/);
    }
  });
});

describe('validateKerusiState / Delta — scope rule (§5.1)', () => {
  const baseState: KerusiState = {
    kerusi: '1.0',
    mapId: 'm',
    updatedAt: '2026-08-17T09:14:00Z',
    seats: {},
  };

  it('accepts a state with exactly one of sessionId/mapId', () => {
    expect(() => validateKerusiState(baseState)).not.toThrow();
  });

  it('rejects a state with both sessionId and mapId', () => {
    const bad = { ...baseState, sessionId: 's' };
    try {
      validateKerusiState(bad);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as KerusiValidationError).rule).toBe('state-scope');
      expect((e as KerusiValidationError).message).toContain('both');
    }
  });

  it('rejects a state with neither sessionId nor mapId', () => {
    const bad: KerusiState = { kerusi: '1.0', updatedAt: '2026-08-17T09:14:00Z', seats: {} };
    try {
      validateKerusiState(bad);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as KerusiValidationError).rule).toBe('state-scope');
      expect((e as KerusiValidationError).message).toContain('neither');
    }
  });

  it('applies the same scope rule to a delta', () => {
    const delta: KerusiStateDelta = {
      kerusi: '1.0',
      sessionId: 's',
      mapId: 'm',
      updatedAt: '2026-08-17T09:14:00Z',
      changes: {},
    };
    expect(() => validateKerusiStateDelta(delta)).toThrowError(/exactly one/i);
  });
});
