/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { KerusiMap, Section } from '../kerusi/kerusi-map.model.js';
import { buildRenderModel } from './build-render-model.js';
import { computeMapLayout, MapLayoutOptions, PlacedSection } from './map-layout.js';
import { computeRowsLayout } from './rows-layout.js';
import TOWN_HALL_JSON from '../kerusi/conformance/corpus/town-hall.map.kerusi.json';

const TOWN_HALL = TOWN_HALL_JSON as unknown as KerusiMap;

const mapWith = (...sections: Section[]): KerusiMap => ({
  kerusi: '1.0',
  id: 'm',
  canvas: { width: 400, height: 200 },
  seatSize: 20,
  legend: [{ id: 'standard' }],
  sections,
});

const rowsOf = (map: KerusiMap, options?: MapLayoutOptions) =>
  computeRowsLayout(buildRenderModel(map), options);

const seat = (section: PlacedSection, id: string) => section.seats.find((p) => p.seat.id === id)!;

describe('the rows view (§4.5.1)', () => {
  const layout = rowsOf(TOWN_HALL);
  const stalls = layout.sections[0];
  const pitch = 40 * 1.25;

  it('straightens a shaped row onto one line, with no seat turned', () => {
    const table = stalls.seats.filter((p) => p.seat.row === 'T1');
    expect(new Set(table.map((p) => p.centerY)).size).toBe(1);
    expect(table.map((p) => p.centerX - table[0].centerX)).toEqual(
      [0, 1, 2, 3].map((i) => i * pitch),
    );
    expect(stalls.seats.every((p) => p.rotation === 0)).toBe(true);
  });

  it('puts a seat off its guide back in line', () => {
    // A9 sits 40 units below row A's guide in the document.
    expect(seat(stalls, 'A9').centerY).toBe(seat(stalls, 'A1').centerY);
  });

  it('keeps a skipped col as a gap', () => {
    const a4 = seat(stalls, 'A4');
    const a6 = seat(stalls, 'A6');
    expect(a6.centerX - a4.centerX).toBe(2 * pitch);
  });

  it('follows the §4.2.1 row order, then the seats with no row, unlabelled', () => {
    const ys = ['A1', 'T1-1', 'S1'].map((id) => seat(stalls, id).centerY);
    expect(ys).toEqual([ys[0], ys[0] + pitch, ys[0] + 2 * pitch]);
    expect(stalls.rowLabels.map((l) => [l.rowId, l.label, l.y])).toEqual([
      ['A', 'A', ys[0]],
      ['T1', 'Table 1', ys[1]],
    ]);
  });

  it('labels every row in a gutter before its seats', () => {
    for (const label of stalls.rowLabels) {
      expect(label.x).toBeLessThan(seat(stalls, 'A1').x);
      expect(label.x).toBeGreaterThanOrEqual(stalls.bounds.x);
    }
  });

  it('stacks the sections, each with its label drawn above it', () => {
    const [first, second] = layout.sections;
    expect(second.bounds.y).toBeGreaterThan(first.bounds.y + first.bounds.height);
    expect(layout.sections.every((s) => s.drawsLabel)).toBe(true);
    expect(second.labelAnchor.y + second.labelAnchor.fontSize).toBeLessThanOrEqual(second.bounds.y);
  });

  it('keeps every seat inside its section bounds and the canvas', () => {
    for (const section of layout.sections) {
      const b = section.bounds;
      for (const p of section.seats) {
        expect(p.x).toBeGreaterThanOrEqual(b.x);
        expect(p.x + p.width).toBeLessThanOrEqual(b.x + b.width + 1e-9);
        expect(p.y + p.height).toBeLessThanOrEqual(b.y + b.height + 1e-9);
      }
      expect(b.x + b.width).toBeLessThanOrEqual(layout.width);
      expect(b.y + b.height).toBeLessThanOrEqual(layout.height);
    }
  });

  it('draws no elements and no group footprints, but still wraps a named group', () => {
    expect(stalls.elements).toEqual([]);
    const table = stalls.groups.find((g) => g.group.id === 'T1')!;
    expect(table.shape).toBeUndefined();
    expect(table.seats.length).toBe(4);
  });

  it('draws every seat in the render model', () => {
    const model = buildRenderModel(TOWN_HALL);
    expect(layout.sections.flatMap((s) => s.seats.map((p) => p.seat.id))).toEqual(
      model.sections.flatMap((s) => s.seats.map((x) => x.id)),
    );
  });

  it('mirrors the whole layout in RTL, row labels and all', () => {
    const rtl = rowsOf(TOWN_HALL, { rtl: true });
    expect([rtl.width, rtl.height]).toEqual([layout.width, layout.height]);
    const r = rtl.sections[0];
    expect(seat(r, 'A1').centerX).toBe(layout.width - seat(stalls, 'A1').centerX);
    expect(r.rowLabels[0].x).toBe(layout.width - stalls.rowLabels[0].x);
    expect(seat(r, 'A2').centerX).toBeLessThan(seat(r, 'A1').centerX);
  });

  it('skips an empty row, and puts a seat repeating a col beside the other', () => {
    const map = mapWith({
      id: 's',
      rows: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      seats: [
        { id: 'A1', row: 'A', col: 1, x: 10, y: 10, type: 'standard' },
        { id: 'A1b', row: 'A', col: 1, x: 40, y: 10, type: 'standard' },
        { id: 'C1', row: 'C', col: 3, x: 10, y: 80, type: 'standard' },
      ],
    });
    const [section] = rowsOf(map).sections;
    expect(seat(section, 'A1b').centerX - seat(section, 'A1').centerX).toBe(25);
    expect(seat(section, 'C1').centerY - seat(section, 'A1').centerY).toBe(25);
    // A row's first col starts the line, wherever it is numbered from.
    expect(seat(section, 'C1').centerX).toBe(seat(section, 'A1').centerX);
    expect(section.rowLabels.map((l) => l.rowId)).toEqual(['A', 'C']);
  });

  it('leaves the canonical layout as it was', () => {
    const canonical = computeMapLayout(buildRenderModel(TOWN_HALL));
    expect([canonical.width, canonical.height]).toEqual([1600, 900]);
    expect(canonical.sections.every((s) => s.rowLabels.length === 0)).toBe(true);
    expect(canonical.sections.map((s) => s.drawsLabel)).toEqual(
      canonical.sections.map((s) => s.section.boundsDeclared),
    );
  });
});
