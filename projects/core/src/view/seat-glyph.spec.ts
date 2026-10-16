import { describe, expect, it } from 'vitest';
import { KerusiMap } from '../kerusi/kerusi-map.model.js';
import { KerusiState } from '../kerusi/kerusi-state.model.js';
import { buildRenderModel } from '../render/build-render-model.js';
import { seatBodyPath, seatOccupantPath, seatSelectedFrame } from '../render/seat-shapes.js';
import { computeSectionLayout, PlacedSeat } from '../render/section-layout.js';
import {
  cssVar,
  DEFAULT_KERUSI_COLORS,
  legendSwatchFill,
  legendSwatchText,
  occupantFillFor,
  occupantStrokeFor,
  readableOn,
  seatCoreFill,
  seatFill,
  seatTextFill,
  seatWashFill,
} from './kerusi-seatmap-colors.js';
import { resolveSeatGlyph, seatClassName, seatDataAttributes } from './seat-glyph.js';

const MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'm',
  legend: [{ id: 'standard', color: '#3a8f63' }, { id: 'plain' }],
  sections: [
    {
      id: 'main',
      layout: 'freeform',
      seats: [
        {
          id: 'A1',
          label: '1',
          row: 'A',
          x: 10,
          y: 10,
          type: 'standard',
          attributes: ['aisle', 'extra-legroom'],
        },
        { id: 'A2', label: '2', x: 30, y: 10, type: 'plain', rotation: 30 },
        {
          id: 'A3',
          label: '3',
          x: 50,
          y: 10,
          type: 'standard',
          accessibility: { wheelchairAccessible: true },
        },
        { id: 'L1', x: 70, y: 10, type: 'standard', companions: ['L2'] },
        { id: 'L2', x: 80, y: 10, type: 'standard', companions: ['L1'] },
      ],
    },
  ],
};

const STATE: KerusiState = {
  kerusi: '1.0',
  mapId: 'm',
  updatedAt: '2026-10-01T00:00:00Z',
  seats: { L1: { status: 'held' }, L2: { status: 'booked' } },
};

const colors = DEFAULT_KERUSI_COLORS;

function placed(id: string, state: KerusiState = STATE): PlacedSeat {
  const section = buildRenderModel(MAP, state).sections[0];
  const seat = computeSectionLayout(section).seats.find((p) => p.seat.id === id);
  if (!seat) throw new Error(`no seat ${id}`);
  return seat;
}

describe('resolveSeatGlyph', () => {
  it('draws an available seat as a body and a label, nothing else', () => {
    const p = placed('A1');
    const glyph = resolveSeatGlyph(p, false, colors, true);

    expect(glyph.variant).toBeNull();
    expect(glyph.body).toEqual({
      d: seatBodyPath(p.x, p.y, p.width, p.height),
      fill: seatFill(p.seat, false, colors, true),
    });
    expect(glyph.wash).toBeUndefined();
    expect(glyph.core).toBeUndefined();
    expect(glyph.occupant).toBeUndefined();
    expect(glyph.wheelchair).toBeUndefined();
    expect(glyph.label).toEqual({
      text: '1',
      x: p.centerX,
      y: p.centerY,
      fontSize: p.fontSize,
      fill: seatTextFill(p.seat, false, colors, true),
      halo: 'none',
      haloWidth: 0,
      transform: null,
    });
    expect(glyph.markBox).toEqual(glyph.box);
  });

  it('takes the type colour, or the theme when typeColors is off', () => {
    const p = placed('A1');
    expect(resolveSeatGlyph(p, false, colors, true).body.fill).toBe(
      'var(--kerusi-seat-fill, #3a8f63)',
    );
    expect(resolveSeatGlyph(p, false, colors, false).body.fill).toBe(
      `var(--kerusi-seat-fill, ${cssVar('availableBg', colors.availableBg)})`,
    );
  });

  it('draws a selected seat from a frame and a core, with everything measured from the core', () => {
    const p = placed('A3');
    const glyph = resolveSeatGlyph(p, true, colors, true);
    const frame = seatSelectedFrame(p.width, p.height);
    const core = {
      x: p.x + frame,
      y: p.y + frame,
      width: p.width - frame * 2,
      height: p.height - frame * 2,
    };

    expect(glyph.variant).toBe('selected');
    expect(glyph.markBox).toEqual(core);
    expect(glyph.core).toEqual({
      d: seatBodyPath(core.x, core.y, core.width, core.height),
      fill: seatCoreFill(colors),
    });
    expect(glyph.occupant?.d).toBe(seatOccupantPath(core.x, core.y, core.width, core.height));
    expect(glyph.label.halo).toBe(seatCoreFill(colors));
    expect(glyph.label.haloWidth).toBeCloseTo(p.fontSize * 0.22);
    expect(glyph.wheelchair).toEqual({
      cx: core.x + core.width * 0.82,
      cy: core.y + core.height * 0.18,
      r: core.width * 0.13,
      fill: glyph.label.fill,
    });
  });

  it('washes a held seat and draws its occupant hollow', () => {
    const p = placed('L1');
    const glyph = resolveSeatGlyph(p, false, colors, true);

    expect(glyph.wash).toEqual({ d: glyph.body.d, fill: seatWashFill('held', colors) });
    expect(glyph.occupant).toMatchObject({
      variant: 'held',
      fill: occupantFillFor('held', colors),
      stroke: occupantStrokeFor('held', colors),
    });
    expect(glyph.occupant?.fill).toBe('none');
  });

  it('washes a booked seat and draws its occupant solid, on the seat’s own box', () => {
    const p = placed('L2');
    const glyph = resolveSeatGlyph(p, false, colors, true);

    expect(glyph.wash?.fill).toBe(seatWashFill('booked', colors));
    expect(glyph.occupant?.stroke).toBe('none');
    expect(glyph.occupant?.d).toBe(seatOccupantPath(p.x, p.y, p.width, p.height));
  });

  it('counter-rotates the label of a rotated seat', () => {
    const p = placed('A2');
    expect(resolveSeatGlyph(p, false, colors, true).label.transform).toBe(
      `rotate(-30 ${p.centerX} ${p.centerY})`,
    );
  });

  it('routes the palette through the custom properties, so the CSS tier still wins', () => {
    const glyph = resolveSeatGlyph(placed('A3'), true, { ...colors, selectedBg: '#123456' }, true);
    expect(glyph.body.fill).toBe('var(--kerusi-selected-bg, #123456)');
  });
});

describe('seatClassName', () => {
  it('carries the status and every modifier the READMEs document', () => {
    expect(seatClassName(placed('A1').seat, false)).toBe('kerusi-seat kerusi-seat--available');
    expect(seatClassName(placed('A3').seat, true)).toBe(
      'kerusi-seat kerusi-seat--available kerusi-seat--selected kerusi-seat--wheelchair',
    );
    expect(seatClassName(placed('L1').seat, false)).toBe(
      'kerusi-seat kerusi-seat--held kerusi-seat--unselectable kerusi-seat--companion',
    );
  });
});

describe('the per-seat tokens', () => {
  it('lets --kerusi-seat-fill and --kerusi-seat-label replace a seat’s own colour', () => {
    const glyph = resolveSeatGlyph(placed('A1'), false, colors, true);
    expect(glyph.body.fill).toBe('var(--kerusi-seat-fill, #3a8f63)');
    expect(glyph.label.fill).toBe(`var(--kerusi-seat-label, ${readableOn('#3a8f63')})`);
  });

  it('keeps them under a held or booked seat’s wash, which still marks the status', () => {
    for (const id of ['L1', 'L2']) {
      const glyph = resolveSeatGlyph(placed(id), false, colors, true);
      expect(glyph.body.fill).toBe('var(--kerusi-seat-fill, #3a8f63)');
      expect(glyph.wash).toBeDefined();
      expect(glyph.occupant).toBeDefined();
    }
  });

  it('never reaches a selected or blocked seat, whose colour is the status cue', () => {
    const selected = resolveSeatGlyph(placed('A1'), true, colors, true);
    expect(selected.body.fill).toBe(cssVar('selectedBg', colors.selectedBg));
    expect(selected.label.fill).not.toContain('--kerusi-seat-label');

    const blockedState: KerusiState = { ...STATE, seats: { A1: { status: 'blocked' } } };
    const blocked = resolveSeatGlyph(placed('A1', blockedState), false, colors, true);
    expect(blocked.body.fill).toBe(cssVar('blockedBg', colors.blockedBg));
    expect(blocked.label.fill).toBe(cssVar('blockedFg', colors.blockedFg));
  });

  it('gives a legend swatch the same token and fallback as an available seat of its type', () => {
    const [standard, plain] = buildRenderModel(MAP, STATE).legend;
    expect(legendSwatchFill(standard, colors, true)).toBe('var(--kerusi-seat-fill, #3a8f63)');
    expect(legendSwatchFill(standard, colors, false)).toBe(
      `var(--kerusi-seat-fill, ${cssVar('availableBg', colors.availableBg)})`,
    );
    expect(legendSwatchFill(plain, colors, true)).toBe(
      seatFill(placed('A2').seat, false, colors, true),
    );
    expect(legendSwatchText(standard, colors, true)).toBe(
      seatTextFill(placed('A1').seat, false, colors, true),
    );
  });
});

describe('seatDataAttributes', () => {
  it('carries the type, status, section, row and attributes the document gives', () => {
    expect(seatDataAttributes(placed('A1').seat)).toEqual({
      type: 'standard',
      status: 'available',
      section: 'main',
      row: 'A',
      attributes: 'aisle extra-legroom',
    });
  });

  it('omits a row and attributes the seat does not have', () => {
    expect(seatDataAttributes(placed('L1').seat)).toEqual({
      type: 'standard',
      status: 'held',
      section: 'main',
      row: undefined,
      attributes: undefined,
    });
  });

  it('is what the glyph carries', () => {
    expect(resolveSeatGlyph(placed('A1'), false, colors, true).data).toEqual(
      seatDataAttributes(placed('A1').seat),
    );
  });
});
