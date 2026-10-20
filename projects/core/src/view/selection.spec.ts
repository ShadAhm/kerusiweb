import { describe, expect, it } from 'vitest';
import { KerusiMap } from '../kerusi/kerusi-map.model.js';
import { KerusiSession, KerusiState } from '../kerusi/kerusi-state.model.js';
import { buildRenderModel, BuildRenderModelOptions } from '../render/build-render-model.js';
import {
  canPickSeat,
  selectedWholeUnits,
  summarizeSelection,
  toggleSeatSelection,
  toggleWholeUnit,
} from './selection.js';

/**
 * A row of singles, a love seat booked as a pair, a three-seat family pod booked
 * whole, and a table of four sold by the seat or whole at a table price.
 */
const MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'm',
  canvas: { width: 300, height: 300 },
  seatSize: 28,
  legend: [
    { id: 'standard', defaultPriceTier: 'base' },
    { id: 'sofa', defaultPriceTier: 'top' },
  ],
  priceTiers: [
    { id: 'base', price: { amount: 1500, currency: 'MYR' } },
    { id: 'top', price: { amount: 4500, currency: 'MYR' } },
  ],
  sections: [
    {
      id: 'main',
      seats: [
        { id: 'A1', row: 'A', col: 1, x: 50, y: 50, type: 'standard' },
        { id: 'A2', row: 'A', col: 2, x: 80, y: 50, type: 'standard' },
        { id: 'L1', row: 'L', col: 1, x: 50, y: 90, type: 'sofa' },
        { id: 'L2', row: 'L', col: 2, x: 80, y: 90, type: 'sofa' },
        { id: 'F1', row: 'F', col: 1, x: 50, y: 130, type: 'standard' },
        { id: 'F2', row: 'F', col: 2, x: 80, y: 130, type: 'standard' },
        { id: 'F3', row: 'F', col: 3, x: 110, y: 130, type: 'standard' },
        { id: 'T1', row: 'T', col: 1, x: 50, y: 200, type: 'standard' },
        { id: 'T2', row: 'T', col: 2, x: 80, y: 200, type: 'standard' },
        { id: 'T3', row: 'T', col: 3, x: 110, y: 200, type: 'standard' },
        { id: 'T4', row: 'T', col: 4, x: 140, y: 200, type: 'standard' },
      ],
      groups: [
        { id: 'pair', kind: 'loveseat', label: 'Love seat', seats: ['L1', 'L2'], booking: 'whole' },
        { id: 'pod', kind: 'companion', seats: ['F1', 'F2', 'F3'], booking: 'whole' },
        {
          id: 'table-3',
          kind: 'table',
          label: 'Table 3',
          seats: ['T1', 'T2', 'T3', 'T4'],
          booking: 'either',
          wholePrice: { amount: 5000, currency: 'MYR' },
          shape: { circle: { center: [95, 230], radius: 20 } },
        },
      ],
    },
  ],
};

const stateOf = (seats: KerusiState['seats']): KerusiState => ({
  kerusi: '1.0',
  mapId: 'm',
  updatedAt: '2026-10-20T10:00:00Z',
  seats,
});

const modelOf = (state?: KerusiState, options: BuildRenderModelOptions = {}) =>
  buildRenderModel(MAP, state, options);

const ctxFor = (state?: KerusiState, extra: { maxSelection?: number } = {}, options = {}) => ({
  seatsById: modelOf(state, options).seatsById,
  ...extra,
});

describe('booking units on the render model (§4.12.2)', () => {
  it('gives a lone seat itself, and a seat in a whole group the group', () => {
    const { seatsById } = modelOf();
    expect(seatsById.get('A1')!.unit).toMatchObject({ level: 'seat', id: 'A1', seatIds: ['A1'] });
    expect(seatsById.get('L2')!.unit).toMatchObject({
      level: 'group',
      id: 'pair',
      label: 'Love seat',
      kind: 'loveseat',
      seatIds: ['L1', 'L2'],
    });
    // Every seat of a unit shares the one object.
    expect(seatsById.get('F1')!.unit).toBe(seatsById.get('F3')!.unit);
  });

  it('leaves an either table sold by the seat, and offers it whole', () => {
    const model = modelOf();
    expect(model.seatsById.get('T1')!.unit.seatIds).toEqual(['T1']);
    expect(model.wholeUnits.map((u) => u.id)).toEqual(['table-3']);
    const table = model.sections[0].groups.find((g) => g.id === 'table-3')!;
    expect(table.booking).toBe('either');
    expect(table.wholeUnit).toBe(model.wholeUnits[0]);
    expect(table.wholeUnit!.wholePrice).toEqual({ amount: 5000, currency: 'MYR' });
  });

  it('applies a session’s overrides: a wedding sells the table whole', () => {
    const session: KerusiSession = {
      kerusi: '1.0',
      id: 'wedding',
      mapId: 'm',
      bookingModes: { groups: { 'table-3': 'whole' } },
    };
    const model = modelOf(undefined, { session });
    expect(model.seatsById.get('T2')!.unit.seatIds).toEqual(['T1', 'T2', 'T3', 'T4']);
    expect(model.wholeUnits).toEqual([]);
    expect(model.sections[0].groups.find((g) => g.id === 'table-3')!.booking).toBe('whole');
  });

  it('makes every seat its own unit under unitMode "seats", whole units kept', () => {
    const model = modelOf(undefined, { unitMode: 'seats' });
    expect(model.unitMode).toBe('seats');
    expect(model.seatsById.get('L1')!.unit.seatIds).toEqual(['L1']);
    expect(model.units).toHaveLength(11);
    expect(model.wholeUnits.map((u) => u.id)).toEqual(['table-3']);
  });

  it('marks the other half of a sold pair as blocked, and so not pickable', () => {
    const { seatsById } = modelOf(stateOf({ L2: { status: 'booked' } }));
    const free = seatsById.get('L1')!;
    expect(free.selectable).toBe(true);
    expect(free.unitBlocked).toBe(true);
    expect(canPickSeat(free)).toBe(false);
    expect(free.unit.selectable).toBe(false);
    // The sold half is unpickable by its own rules, not its unit's.
    expect(seatsById.get('L2')!.unitBlocked).toBe(false);
    expect(canPickSeat(seatsById.get('A1')!)).toBe(true);
  });
});

describe('toggleSeatSelection', () => {
  it('selects and deselects a lone seat', () => {
    const ctx = ctxFor();
    const on = toggleSeatSelection([], 'A1', ctx);
    expect(on).toMatchObject({ kind: 'select', selection: ['A1'], changed: ['A1'] });

    const off = toggleSeatSelection(on.selection, 'A1', ctx);
    expect(off).toMatchObject({ kind: 'deselect', selection: [], changed: ['A1'] });
  });

  it('selects a whole pair together', () => {
    const result = toggleSeatSelection([], 'L1', ctxFor());
    expect(result).toMatchObject({ kind: 'select', changed: ['L1', 'L2'] });
    expect([...result.selection].sort()).toEqual(['L1', 'L2']);
  });

  it('selects a pod of three as one unit', () => {
    expect(toggleSeatSelection(['A1'], 'F2', ctxFor()).selection).toEqual(['A1', 'F1', 'F2', 'F3']);
  });

  it('deselects the whole pair when either half is clicked', () => {
    const ctx = ctxFor();
    const selected = toggleSeatSelection([], 'L1', ctx).selection;
    expect(toggleSeatSelection(selected, 'L2', ctx)).toMatchObject({
      kind: 'deselect',
      selection: [],
      changed: ['L1', 'L2'],
    });
  });

  it('takes one seat of an either table: the table is offered whole on its shape instead', () => {
    expect(toggleSeatSelection([], 'T2', ctxFor()).selection).toEqual(['T2']);
  });

  it('leaves the pair apart under unitMode "seats"', () => {
    const result = toggleSeatSelection([], 'L1', ctxFor(undefined, {}, { unitMode: 'seats' }));
    expect(result.selection).toEqual(['L1']);
  });

  it('refuses a pair whose other half is already sold, as unit-unavailable', () => {
    const result = toggleSeatSelection([], 'L1', ctxFor(stateOf({ L2: { status: 'booked' } })));
    expect(result).toMatchObject({ kind: 'disallowed', reason: 'unit-unavailable', changed: [] });
    expect(result.selection).toEqual([]);
  });

  it('reports the availability status as the disallowed reason', () => {
    const ctx = ctxFor(stateOf({ A1: { status: 'booked' }, A2: { status: 'held' } }));
    expect(toggleSeatSelection([], 'A1', ctx).reason).toBe('booked');
    expect(toggleSeatSelection([], 'A2', ctx).reason).toBe('held');
  });

  it('counts every seat of a unit against maxSelection (D21)', () => {
    const ctx = ctxFor(undefined, { maxSelection: 3 });
    // The pair needs two, and two are free.
    expect(toggleSeatSelection(['A1'], 'L1', ctx).kind).toBe('select');
    // The pod needs three, and only two are free.
    expect(toggleSeatSelection(['A1'], 'F1', ctx)).toMatchObject({
      kind: 'disallowed',
      reason: 'max-selection',
    });
  });

  it('refuses a unit bigger than the limit as unit-too-large, whatever is selected (D21)', () => {
    expect(toggleSeatSelection([], 'F1', ctxFor(undefined, { maxSelection: 2 }))).toMatchObject({
      kind: 'disallowed',
      reason: 'unit-too-large',
    });
    // A lone seat over a limit of none is just over the limit.
    expect(toggleSeatSelection([], 'A1', ctxFor(undefined, { maxSelection: 0 })).reason).toBe(
      'max-selection',
    );
  });

  it('mends a split unit: a controlled selection holding half a pair', () => {
    const ctx = ctxFor();
    // Tapping the missing half adds it; nothing else changes.
    expect(toggleSeatSelection(['L1'], 'L2', ctx)).toMatchObject({
      kind: 'select',
      selection: ['L1', 'L2'],
      changed: ['L2'],
    });
    // Tapping the selected half drops what is selected of the unit.
    expect(toggleSeatSelection(['A1', 'L1'], 'L1', ctx)).toMatchObject({
      kind: 'deselect',
      selection: ['A1'],
      changed: ['L1'],
    });
  });

  it('always allows deselection, even at the limit', () => {
    const ctx = ctxFor(undefined, { maxSelection: 1 });
    expect(toggleSeatSelection(['A1'], 'A1', ctx).kind).toBe('deselect');
  });

  it('never mutates the selection it was given', () => {
    const selection = Object.freeze(['A1']);
    expect(() => toggleSeatSelection(selection, 'A2', ctxFor())).not.toThrow();
    expect(selection).toEqual(['A1']);
  });

  it('reports an unknown seat id as not selectable', () => {
    expect(toggleSeatSelection([], 'nope', ctxFor())).toMatchObject({
      kind: 'disallowed',
      reason: 'not-selectable',
    });
  });
});

describe('toggleWholeUnit (D19)', () => {
  const tableOf = (state?: KerusiState) => modelOf(state).wholeUnits[0]!;

  it('selects every seat of the table, and deselects them all again', () => {
    const ctx = ctxFor();
    const on = toggleWholeUnit(['A1'], tableOf(), ctx);
    expect(on).toMatchObject({
      kind: 'select',
      selection: ['A1', 'T1', 'T2', 'T3', 'T4'],
      changed: ['T1', 'T2', 'T3', 'T4'],
    });
    expect(toggleWholeUnit(on.selection, tableOf(), ctx)).toMatchObject({
      kind: 'deselect',
      selection: ['A1'],
      changed: ['T1', 'T2', 'T3', 'T4'],
    });
  });

  it('completes a table picked partly, rather than deselecting it', () => {
    expect(toggleWholeUnit(['T2'], tableOf(), ctxFor())).toMatchObject({
      kind: 'select',
      selection: ['T2', 'T1', 'T3', 'T4'],
      changed: ['T1', 'T3', 'T4'],
    });
  });

  it('refuses while a seat at it is taken (§4.12.3)', () => {
    const state = stateOf({ T3: { status: 'held' } });
    expect(tableOf(state).selectable).toBe(false);
    expect(toggleWholeUnit([], tableOf(state), ctxFor(state))).toMatchObject({
      kind: 'disallowed',
      reason: 'unit-unavailable',
      selection: [],
    });
  });

  it('counts its seats against maxSelection (D21)', () => {
    expect(toggleWholeUnit([], tableOf(), ctxFor(undefined, { maxSelection: 3 })).reason).toBe(
      'unit-too-large',
    );
    expect(toggleWholeUnit(['A1'], tableOf(), ctxFor(undefined, { maxSelection: 4 })).reason).toBe(
      'max-selection',
    );
  });
});

describe('selectedWholeUnits (D20)', () => {
  const model = modelOf();

  it('lists a whole unit once every seat of it is selected, however they were picked', () => {
    expect(selectedWholeUnits(model, ['T1', 'T2', 'T3'])).toEqual([]);
    expect(selectedWholeUnits(model, ['T4', 'T3', 'T2', 'T1', 'A1']).map((u) => u.id)).toEqual([
      'table-3',
    ]);
  });

  it('is empty for an empty selection', () => {
    expect(selectedWholeUnits(model, [])).toEqual([]);
  });
});

describe('summarizeSelection', () => {
  const model = modelOf();

  it('totals a selection in the map currency, in minor units', () => {
    const summary = summarizeSelection(model, ['A1', 'L1', 'L2']);
    expect(summary.seats.map((s) => s.id)).toEqual(['A1', 'L1', 'L2']);
    expect(summary.total).toEqual({ amount: 10500, currency: 'MYR' });
    expect(summary.unpriced).toBe(0);
    expect(summary.wholes).toEqual([]);
  });

  it('charges a table its whole price when all its seats are selected (§4.9.1)', () => {
    const summary = summarizeSelection(model, ['A1', 'T1', 'T2', 'T3', 'T4']);
    expect(summary.total).toEqual({ amount: 1500 + 5000, currency: 'MYR' });
    expect(summary.wholes).toEqual([
      {
        level: 'group',
        id: 'table-3',
        price: { amount: 5000, currency: 'MYR' },
        seats: ['T1', 'T2', 'T3', 'T4'],
      },
    ]);
    expect(summary.wholeUnits.map((u) => u.id)).toEqual(['table-3']);
  });

  it('prices part of a table by its seats', () => {
    expect(summarizeSelection(model, ['T1', 'T2']).total).toEqual({
      amount: 3000,
      currency: 'MYR',
    });
  });

  it('ignores a whole price while the session books the level by the seat', () => {
    const session: KerusiSession = {
      kerusi: '1.0',
      id: 'quiz',
      mapId: 'm',
      bookingModes: { groups: { 'table-3': 'seats' } },
    };
    const summary = summarizeSelection(modelOf(undefined, { session }), ['T1', 'T2', 'T3', 'T4']);
    expect(summary.total).toEqual({ amount: 6000, currency: 'MYR' });
    expect(summary.wholeUnits).toEqual([]);
  });

  it('counts unpriced seats rather than treating them as free', () => {
    const unpricedMap: KerusiMap = {
      ...MAP,
      priceTiers: undefined,
      legend: [{ id: 'standard' }, { id: 'sofa' }],
      sections: [{ ...MAP.sections[0], groups: [] }],
    };
    const summary = summarizeSelection(buildRenderModel(unpricedMap), ['A1', 'A2']);
    expect(summary.total).toBeUndefined();
    expect(summary.unpriced).toBe(2);
  });

  it('is empty for an empty selection', () => {
    expect(summarizeSelection(model, [])).toEqual({
      seats: [],
      total: undefined,
      unpriced: 0,
      wholes: [],
      wholeUnits: [],
    });
  });
});
