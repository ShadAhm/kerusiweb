import { describe, expect, it } from 'vitest';
import { KerusiMap, Section } from '../kerusi/kerusi-map.model.js';
import { buildRenderModel } from './build-render-model.js';
import { contentBounds, mapContentBounds } from './content-bounds.js';
import { computeMapLayout, MapLayoutOptions } from './map-layout.js';
import { GLYPH_WIDTH } from './placement.js';
import { computeRowsLayout } from './rows-layout.js';

const mapWith = (...sections: Section[]): KerusiMap => ({
  kerusi: '1.0',
  id: 'm',
  canvas: { width: 1000, height: 800 },
  seatSize: 20,
  legend: [{ id: 'standard' }],
  sections,
});

const layoutOf = (map: KerusiMap, options?: MapLayoutOptions) =>
  computeMapLayout(buildRenderModel(map), options);

/** The box with no margin, so each case reads as the geometry alone. */
const tight = (map: KerusiMap, options?: MapLayoutOptions) =>
  contentBounds(layoutOf(map, options), { padding: 0, ...options });

const close = (
  actual: { x: number; y: number; width: number; height: number },
  expected: typeof actual,
) => {
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(actual[key], key).toBeCloseTo(expected[key], 6);
  }
};

describe('contentBounds (#63)', () => {
  it('wraps every seat footprint', () => {
    const map = mapWith({
      id: 's',
      seats: [
        { id: 'A1', x: 300, y: 200, type: 'standard' },
        { id: 'A2', x: 400, y: 260, type: 'standard' },
      ],
    });
    expect(tight(map)).toEqual({ x: 290, y: 190, width: 120, height: 80 });
  });

  it('takes a turned seat as drawn: a 45° square reaches s·√2/2 from its centre', () => {
    const map = mapWith({
      id: 's',
      seats: [{ id: 'A1', x: 300, y: 200, rotation: 45, type: 'standard' }],
    });
    const half = 10 * Math.SQRT2;
    close(tight(map), { x: 300 - half, y: 200 - half, width: 2 * half, height: 2 * half });
  });

  it('counts elements, turned as they are', () => {
    const map = mapWith({
      id: 's',
      seats: [{ id: 'A1', x: 500, y: 500, type: 'standard' }],
      elements: [
        { id: 'stage', kind: 'stage', x: 500, y: 200, width: 200, height: 40, rotation: 90 },
      ],
    });
    // Turned a quarter, the 200 × 40 stage stands 40 wide and 200 tall.
    close(tight(map), { x: 480, y: 100, width: 40, height: 410 });
  });

  it('counts a round tabletop and a turned sofa footprint', () => {
    const map = mapWith({
      id: 's',
      seats: [
        { id: 'T1', x: 100, y: 70, type: 'standard' },
        { id: 'F1', x: 300, y: 100, type: 'standard' },
      ],
      groups: [
        {
          id: 'table',
          kind: 'table',
          seats: ['T1'],
          shape: { circle: { center: [100, 100], radius: 50 } },
        },
        {
          id: 'sofa',
          kind: 'sofa',
          seats: ['F1'],
          shape: { rect: { x: 300, y: 100, width: 120, height: 30, rotation: 90 } },
        },
      ],
    });
    // The table reaches 50 left and below its centre; the turned sofa runs
    // 60 up and down from its own.
    close(tight(map), { x: 50, y: 40, width: 265, height: 120 });
  });

  it('counts a drawn section label only when asked, and the override text when given', () => {
    const map = mapWith({
      id: 's',
      label: 'Balcony',
      bounds: { x: 200, y: 200, width: 100, height: 100 },
      seats: [{ id: 'A1', x: 250, y: 250, type: 'standard' }],
    });
    const layout = layoutOf(map);
    const anchor = layout.sections[0]!.labelAnchor;
    expect(contentBounds(layout, { padding: 0 })).toEqual({
      x: 240,
      y: 240,
      width: 20,
      height: 20,
    });

    const width = 'Balcony'.length * GLYPH_WIDTH * anchor.fontSize;
    close(contentBounds(layout, { padding: 0, sectionLabels: true }), {
      x: anchor.x,
      y: anchor.y,
      width: Math.max(width, 260 - anchor.x),
      height: 260 - anchor.y,
    });

    const long = 'The long upper balcony';
    const overridden = contentBounds(layout, { padding: 0, sectionLabels: () => long });
    close(overridden, {
      x: anchor.x,
      y: anchor.y,
      width: long.length * GLYPH_WIDTH * anchor.fontSize,
      height: 260 - anchor.y,
    });
  });

  it('runs a mirrored label leftward from its anchor in RTL', () => {
    const map = mapWith({
      id: 's',
      label: 'The long upper balcony',
      bounds: { x: 200, y: 200, width: 100, height: 100 },
      seats: [{ id: 'A1', x: 250, y: 250, type: 'standard' }],
    });
    const layout = layoutOf(map, { rtl: true });
    const anchor = layout.sections[0]!.labelAnchor;
    const width = 'The long upper balcony'.length * GLYPH_WIDTH * anchor.fontSize;
    const box = contentBounds(layout, { padding: 0, rtl: true, sectionLabels: true });
    expect(box.x + box.width).toBeCloseTo(anchor.x, 6);
    expect(box.width).toBeCloseTo(width, 6);
  });

  it('mirrors with the canvas in RTL', () => {
    const map = mapWith({
      id: 's',
      seats: [{ id: 'A1', x: 300, y: 200, type: 'standard' }],
    });
    expect(tight(map, { rtl: true })).toEqual({ x: 690, y: 190, width: 20, height: 20 });
  });

  it('adds the padding, by default the largest seat size, and keeps it on the canvas', () => {
    const map = mapWith(
      { id: 'a', seats: [{ id: 'A1', x: 300, y: 200, type: 'standard' }] },
      { id: 'b', seatSize: 30, seats: [{ id: 'B1', x: 500, y: 400, type: 'standard' }] },
    );
    const layout = layoutOf(map);
    expect(contentBounds(layout)).toEqual({ x: 260, y: 160, width: 285, height: 285 });
    expect(contentBounds(layout, { padding: 5 })).toEqual({
      x: 285,
      y: 185,
      width: 235,
      height: 235,
    });

    const corner = mapWith({ id: 's', seats: [{ id: 'A1', x: 10, y: 790, type: 'standard' }] });
    expect(contentBounds(layoutOf(corner), { padding: 50 })).toEqual({
      x: 0,
      y: 730,
      width: 70,
      height: 70,
    });
  });

  it('is the whole canvas when nothing is drawn', () => {
    const map = mapWith({ id: 's', seats: [] });
    expect(contentBounds(layoutOf(map))).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
  });

  it('counts the rows view and its row labels', () => {
    const map = mapWith({
      id: 's',
      seats: [
        { id: 'A1', row: 'A', col: 1, x: 300, y: 200, type: 'standard' },
        { id: 'A2', row: 'A', col: 2, x: 330, y: 200, type: 'standard' },
      ],
    });
    const layout = computeRowsLayout(buildRenderModel(map));
    const box = contentBounds(layout, { padding: 0 });
    const label = layout.sections[0]!.rowLabels[0]!;
    expect(box.x).toBeCloseTo(label.x - (GLYPH_WIDTH * label.fontSize) / 2, 6);
    const last = layout.sections[0]!.seats.at(-1)!;
    expect(box.x + box.width).toBeCloseTo(last.x + last.width, 6);
  });

  it('mapContentBounds is contentBounds on the canonical layout, padded by the map seat size', () => {
    const map = mapWith(
      { id: 'a', seats: [{ id: 'A1', x: 300, y: 200, type: 'standard' }] },
      { id: 'b', seatSize: 30, seats: [{ id: 'B1', x: 500, y: 400, type: 'standard' }] },
    );
    expect(mapContentBounds(map)).toEqual(contentBounds(layoutOf(map), { padding: 20 }));
    expect(mapContentBounds(map, { sectionIds: ['a'], padding: 0 })).toEqual({
      x: 290,
      y: 190,
      width: 20,
      height: 20,
    });
    expect(mapContentBounds(map, { view: 'rows' })).toEqual(
      contentBounds(computeRowsLayout(buildRenderModel(map)), { padding: 20 }),
    );
  });
});
