import { describe, expect, it } from 'vitest';
import { buildRenderModel } from '../render/build-render-model.js';
import { KerusiMap } from '../kerusi/kerusi-map.model.js';
import {
  canHover,
  cssLengthToPx,
  DEFAULT_HOVER_CARD_DELAY,
  resolveHoverCardDelay,
  seatCardClassName,
  seatCardDataAttributes,
  seatCardClickAction,
  seatCardId,
  seatCardKeyExists,
  wholeUnitCardContext,
  wholeUnitCardDataAttributes,
  wholeUnitCardGroup,
  wholeUnitHoverKey,
  wholeUnitOfHoverKey,
} from './seat-card.js';
import { isWholeUnitSelected, wholeUnitControlGroups } from './group-glyph.js';

const map: KerusiMap = {
  kerusi: '1.0',
  id: 'm',
  canvas: { width: 100, height: 100 },
  seatSize: 20,
  legend: [{ id: 'std', label: 'Standard' }],
  sections: [
    { id: 's1', label: 'One', index: 0, seats: [{ id: 'A1', x: 20, y: 20, type: 'std' }] },
  ],
};

describe('resolveHoverCardDelay', () => {
  it('defaults to 150 ms open and 100 ms close', () => {
    expect(resolveHoverCardDelay()).toEqual({ open: 150, close: 100 });
    expect(DEFAULT_HOVER_CARD_DELAY).toEqual({ open: 150, close: 100 });
  });

  it('fills in whichever half is missing', () => {
    expect(resolveHoverCardDelay({ open: 0 })).toEqual({ open: 0, close: 100 });
    expect(resolveHoverCardDelay({ close: 400 })).toEqual({ open: 150, close: 400 });
  });

  it('turns a negative or non-numeric delay into a usable one', () => {
    expect(resolveHoverCardDelay({ open: -5 })).toEqual({ open: 0, close: 100 });
    expect(resolveHoverCardDelay({ open: Number.NaN })).toEqual({ open: 150, close: 100 });
  });
});

describe('canHover', () => {
  it('is true for a mouse and a pen only', () => {
    expect(canHover('mouse')).toBe(true);
    expect(canHover('pen')).toBe(true);
    expect(canHover('touch')).toBe(false);
    expect(canHover('')).toBe(false);
    expect(canHover(undefined)).toBe(false);
  });
});

describe('seat card attributes', () => {
  it('derives an id per card kind from the prefix', () => {
    expect(seatCardId('kerusi-1', 'hover')).toBe('kerusi-1-seat-card-hover');
    expect(seatCardId('kerusi-1', 'click')).toBe('kerusi-1-seat-card-click');
  });

  it('mirrors the seat onto the card as data attributes', () => {
    const seat = buildRenderModel(map).seatsById.get('A1')!;
    expect(seatCardDataAttributes(seat)).toEqual({
      'data-seat-id': 'A1',
      'data-seat-status': 'available',
      'data-seat-type': 'std',
      'data-section-id': 's1',
    });
  });

  it('builds the class list: hooks first, then the consumer’s own', () => {
    expect(seatCardClassName('hover', 'default')).toBe('kerusi-seat-card kerusi-seat-card--hover');
    expect(seatCardClassName('click', 'default', 'mine other')).toBe(
      'kerusi-seat-card kerusi-seat-card--click mine other',
    );
    expect(seatCardClassName('click', 'none')).toBe(
      'kerusi-seat-card kerusi-seat-card--click kerusi-seat-card--bare',
    );
  });
});

describe('cssLengthToPx', () => {
  it('reads px, rem, em and bare numbers', () => {
    expect(cssLengthToPx('8px', 0)).toBe(8);
    expect(cssLengthToPx(' 12.5px ', 0)).toBe(12.5);
    expect(cssLengthToPx('6', 0)).toBe(6);
    expect(cssLengthToPx('0.5rem', 0)).toBe(8);
    expect(cssLengthToPx('0.5rem', 0, { root: 20 })).toBe(10);
    expect(cssLengthToPx('2em', 0, { root: 16, element: 10 })).toBe(20);
    expect(cssLengthToPx('0', 5)).toBe(0);
  });

  it('falls back for anything else', () => {
    expect(cssLengthToPx('', 8)).toBe(8);
    expect(cssLengthToPx(undefined, 8)).toBe(8);
    expect(cssLengthToPx(null, 8)).toBe(8);
    expect(cssLengthToPx('calc(1px + 2px)', 8)).toBe(8);
    expect(cssLengthToPx('50%', 8)).toBe(8);
  });
});

describe('whole-unit card helpers (D25)', () => {
  it('keys a control so it cannot be taken for a seat id, and reads the key back', () => {
    const key = wholeUnitHoverKey('T3');
    expect(key).not.toBe('T3');
    expect(wholeUnitOfHoverKey(key)).toBe('T3');
    expect(wholeUnitOfHoverKey('T3')).toBeUndefined();
    expect(wholeUnitOfHoverKey('unit:T3')).toBeUndefined();
    expect(wholeUnitOfHoverKey(null)).toBeUndefined();
  });

  it('mirrors the group as data attributes on its card', () => {
    const group = {
      id: 'T3',
      kind: 'table',
      sectionId: 'floor',
    } as Parameters<typeof wholeUnitCardDataAttributes>[0];
    expect(wholeUnitCardDataAttributes(group)).toEqual({
      'data-group-id': 'T3',
      'data-group-kind': 'table',
      'data-section-id': 'floor',
    });
  });
});

describe('whole-unit card state (D25)', () => {
  // T1 is an `either` table with a shape, so it is a control; T2 is `either`
  // with no shape, so it is a whole unit the app offers, not a control (D19).
  const tables: KerusiMap = {
    kerusi: '1.0',
    id: 'tables',
    canvas: { width: 200, height: 100 },
    seatSize: 20,
    legend: [{ id: 'std', label: 'Standard' }],
    sections: [
      {
        id: 'floor',
        label: 'Floor',
        index: 0,
        seats: [
          { id: 'A1', x: 20, y: 20, type: 'std' },
          { id: 'A2', x: 50, y: 20, type: 'std' },
          { id: 'B1', x: 120, y: 20, type: 'std' },
          { id: 'B2', x: 150, y: 20, type: 'std' },
        ],
        groups: [
          {
            id: 'T1',
            kind: 'table',
            label: 'Table 1',
            seats: ['A1', 'A2'],
            shape: { rect: { x: 35, y: 50, width: 50, height: 20 } },
            booking: 'either',
          },
          { id: 'T2', kind: 'table', label: 'Table 2', seats: ['B1', 'B2'], booking: 'either' },
        ],
      },
    ],
  };
  const groupsById = new Map(
    buildRenderModel(tables).sections.flatMap((s) => s.groups.map((g) => [g.id, g] as const)),
  );
  const seatsById = buildRenderModel(tables).seatsById;
  const t1 = groupsById.get('T1')!;

  it('takes as controls only the whole units with a shape, and none while selection is off', () => {
    expect([...wholeUnitControlGroups(groupsById, true).keys()]).toEqual(['T1']);
    expect(wholeUnitControlGroups(groupsById, false).size).toBe(0);
  });

  it('counts a unit selected only when every one of its seats is', () => {
    const unit = t1.wholeUnit!;
    expect(isWholeUnitSelected(unit, new Set(['A1', 'A2']))).toBe(true);
    expect(isWholeUnitSelected(unit, new Set(['A1']))).toBe(false);
    expect(isWholeUnitSelected({ ...unit, seatIds: [] }, new Set(['A1']))).toBe(false);
  });

  it('finds the group a card key names, among the controls only', () => {
    const controls = wholeUnitControlGroups(groupsById, true);
    expect(wholeUnitCardGroup(wholeUnitHoverKey('T1'), controls)).toBe(t1);
    expect(wholeUnitCardGroup(wholeUnitHoverKey('T2'), controls)).toBeUndefined();
    expect(wholeUnitCardGroup('A1', controls)).toBeUndefined();
    expect(wholeUnitCardGroup(null, controls)).toBeUndefined();
  });

  it('builds the card context from the group and the selection', () => {
    const close = () => {};
    expect(wholeUnitCardContext(t1, new Set(['A1', 'A2']), 'click', close)).toEqual({
      unit: t1.wholeUnit,
      group: t1,
      selected: true,
      trigger: 'click',
      close,
    });
    expect(wholeUnitCardContext(t1, new Set(['A1']), 'hover', close).selected).toBe(false);
  });

  it('keeps a card only while its seat or control is still on the map', () => {
    const controls = wholeUnitControlGroups(groupsById, true);
    expect(seatCardKeyExists('A1', seatsById, controls)).toBe(true);
    expect(seatCardKeyExists('Z9', seatsById, controls)).toBe(false);
    expect(seatCardKeyExists(wholeUnitHoverKey('T1'), seatsById, controls)).toBe(true);
    expect(seatCardKeyExists(wholeUnitHoverKey('T1'), seatsById, new Map())).toBe(false);
  });

  describe('seatCardClickAction', () => {
    const unit = wholeUnitHoverKey('T1');

    it('opens a card, and closes it on a second press of the same key', () => {
      expect(seatCardClickAction(null, 'A1', true)).toBe('open');
      expect(seatCardClickAction('A1', 'A2', true)).toBe('open');
      expect(seatCardClickAction(unit, 'A1', true)).toBe('open');
      expect(seatCardClickAction('A1', 'A1', true)).toBe('close');
      expect(seatCardClickAction(unit, unit, true)).toBe('close');
    });

    it("with no renderer for the pressed kind, closes only the other kind's card", () => {
      expect(seatCardClickAction(unit, 'A1', false)).toBe('give-way');
      expect(seatCardClickAction('A1', unit, false)).toBe('give-way');
      expect(seatCardClickAction('A1', 'A2', false)).toBe('none');
      expect(seatCardClickAction(null, unit, false)).toBe('none');
    });
  });
});
