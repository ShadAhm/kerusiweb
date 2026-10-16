import { describe, expect, it } from 'vitest';
import { KerusiMap } from '../kerusi/kerusi-map.model.js';
import { KerusiState, SeatStatus } from '../kerusi/kerusi-state.model.js';
import { buildRenderModel } from '../render/build-render-model.js';
import { RenderSeat } from '../render/render-model.js';
import { classList, KerusiSeatStyle, resolveSeatStyle, SeatStyleFn } from './kerusi-seat-style.js';
import {
  cssVar,
  DEFAULT_KERUSI_COLORS,
  isHexColor,
  legendSwatchFill,
  readableOn,
  seatFill,
  seatTextFill,
} from './kerusi-seatmap-colors.js';

const MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'm',
  legend: [{ id: 'standard', color: '#3a8f63' }, { id: 'vip' }],
  sections: [
    {
      id: 'main',
      layout: 'grid',
      seats: [
        { id: 'A1', row: 'A', col: 1, type: 'standard' },
        { id: 'A2', row: 'A', col: 2, type: 'vip' },
      ],
    },
  ],
};

const colors = DEFAULT_KERUSI_COLORS;

function seat(id: string, status: SeatStatus['status'] = 'available'): RenderSeat {
  const state: KerusiState = {
    kerusi: '1.0',
    mapId: 'm',
    updatedAt: '2026-10-01T00:00:00Z',
    seats: { [id]: { status } },
  };
  return buildRenderModel(MAP, state).seatsById.get(id)!;
}

describe('resolveSeatStyle', () => {
  it('is undefined when neither the type nor the function has anything to say', () => {
    expect(resolveSeatStyle(seat('A1'), false)).toBeUndefined();
    expect(resolveSeatStyle(seat('A1'), false, { vip: { fill: '#d4a017' } })).toBeUndefined();
    expect(resolveSeatStyle(seat('A1'), false, undefined, () => undefined)).toBeUndefined();
    expect(resolveSeatStyle(seat('A1'), false, undefined, () => null)).toBeUndefined();
  });

  it('takes a seat’s type style', () => {
    expect(resolveSeatStyle(seat('A2'), false, { vip: { fill: '#d4a017' } })).toEqual({
      fill: '#d4a017',
      labelColor: undefined,
      className: undefined,
    });
  });

  it('lays the per-seat style over the type style field by field', () => {
    const style = resolveSeatStyle(
      seat('A2'),
      false,
      { vip: { fill: '#d4a017', labelColor: '#000000', className: 'vip' } },
      () => ({ fill: '#123456', className: ['picked', 'best  view'] }),
    );
    expect(style).toEqual({
      fill: '#123456',
      // Not named by the per-seat style, so the type's survives.
      labelColor: '#000000',
      className: ['vip', 'picked', 'best', 'view'],
    });
  });

  it('hands the function the seat and whether it is selected', () => {
    const calls: [string, boolean][] = [];
    const fn: SeatStyleFn = (s, { selected }) => {
      calls.push([s.id, selected]);
      return undefined;
    };
    resolveSeatStyle(seat('A1'), true, undefined, fn);
    expect(calls).toEqual([['A1', true]]);
  });
});

describe('classList', () => {
  it('flattens a string or a list into class names', () => {
    expect(classList(undefined)).toEqual([]);
    expect(classList('')).toEqual([]);
    expect(classList(' a  b ')).toEqual(['a', 'b']);
    expect(classList(['a', 'b c', ''])).toEqual(['a', 'b', 'c']);
  });
});

describe('a style in the fill precedence', () => {
  const gold: KerusiSeatStyle = { fill: '#d4a017' };
  const own = (fill: string) => `var(--kerusi-seat-fill, ${fill})`;

  it('replaces the type colour and the theme for an available seat', () => {
    expect(seatFill(seat('A1'), false, colors, true, gold)).toBe(own('#d4a017'));
    expect(seatFill(seat('A2'), false, colors, true, gold)).toBe(own('#d4a017'));
  });

  it('applies whether or not typeColors is on', () => {
    expect(seatFill(seat('A1'), false, colors, false, gold)).toBe(own('#d4a017'));
  });

  it('stays under a held or booked seat’s wash, which still marks the status', () => {
    expect(seatFill(seat('A1', 'held'), false, colors, true, gold)).toBe(own('#d4a017'));
    expect(seatFill(seat('A1', 'booked'), false, colors, true, gold)).toBe(own('#d4a017'));
  });

  it('never reaches a selected or blocked seat (D4)', () => {
    expect(seatFill(seat('A1'), true, colors, true, gold)).toBe(
      cssVar('selectedBg', colors.selectedBg),
    );
    expect(seatFill(seat('A1', 'blocked'), false, colors, true, gold)).toBe(
      cssVar('blockedBg', colors.blockedBg),
    );
    expect(seatTextFill(seat('A1'), true, colors, true, { labelColor: '#ff0000' })).toBe(
      cssVar('selectedBg', colors.selectedBg),
    );
    expect(
      seatTextFill(seat('A1', 'blocked'), false, colors, true, { labelColor: '#ff0000' }),
    ).toBe(cssVar('blockedFg', colors.blockedFg));
  });

  it('falls back to the type colour when a style has no fill', () => {
    expect(seatFill(seat('A1'), false, colors, true, { className: 'x' })).toBe(own('#3a8f63'));
  });
});

describe('a style’s label colour', () => {
  const label = (fill: string) => `var(--kerusi-seat-label, ${fill})`;

  it('uses labelColor when given', () => {
    expect(
      seatTextFill(seat('A1'), false, colors, true, { fill: '#d4a017', labelColor: '#ff0000' }),
    ).toBe(label('#ff0000'));
  });

  it('reads black or white from a hex fill', () => {
    expect(seatTextFill(seat('A1'), false, colors, true, { fill: '#101010' })).toBe(
      label(readableOn('#101010')),
    );
    expect(readableOn('#101010')).toBe('#ffffff');
  });

  it('falls back to the theme for a fill it cannot read', () => {
    expect(seatTextFill(seat('A1'), false, colors, true, { fill: 'hsl(40 70% 50%)' })).toBe(
      label(cssVar('availableFg', colors.availableFg)),
    );
    expect(seatTextFill(seat('A1'), false, colors, true, { fill: 'var(--brand)' })).toBe(
      label(cssVar('availableFg', colors.availableFg)),
    );
  });
});

describe('isHexColor', () => {
  it('accepts #rgb and #rrggbb only', () => {
    expect(isHexColor('#abc')).toBe(true);
    expect(isHexColor('#a1b2c3')).toBe(true);
    expect(isHexColor('red')).toBe(false);
    expect(isHexColor('var(--x)')).toBe(false);
  });
});

describe('the legend swatch with a type style', () => {
  it('shows the type style, matching the seats of that type', () => {
    const vip = buildRenderModel(MAP).legend.find((e) => e.id === 'vip')!;
    const style = { fill: '#d4a017' };
    expect(legendSwatchFill(vip, colors, true, style)).toBe(
      seatFill(seat('A2'), false, colors, true, style),
    );
  });
});
