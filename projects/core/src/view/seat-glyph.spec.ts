import { describe, expect, it } from 'vitest';
import { KerusiMap } from '../kerusi/kerusi-map.model.js';
import { KerusiState } from '../kerusi/kerusi-state.model.js';
import { buildRenderModel } from '../render/build-render-model.js';
import { seatBodyPath, seatOccupantPath, seatSelectedFrame } from '../render/seat-shapes.js';
import { computeSectionLayout, PlacedSeat } from '../render/section-layout.js';
import {
  cssVar,
  DEFAULT_KERUSI_COLORS,
  occupantFillFor,
  occupantStrokeFor,
  seatCoreFill,
  seatFill,
  seatTextFill,
  seatWashFill,
} from './kerusi-seatmap-colors.js';
import { resolveSeatGlyph, seatClassName } from './seat-glyph.js';

const MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'm',
  legend: [{ id: 'standard', color: '#3a8f63' }, { id: 'plain' }],
  sections: [
    {
      id: 'main',
      layout: 'freeform',
      seats: [
        { id: 'A1', label: '1', x: 10, y: 10, type: 'standard' },
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
    expect(resolveSeatGlyph(p, false, colors, true).body.fill).toBe('#3a8f63');
    expect(resolveSeatGlyph(p, false, colors, false).body.fill).toBe(
      cssVar('availableBg', colors.availableBg),
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
