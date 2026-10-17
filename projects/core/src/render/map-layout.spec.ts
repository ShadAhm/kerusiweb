/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { KerusiMap, Section } from '../kerusi/kerusi-map.model.js';
import { BUS_MAP, CINEMA_GRID_MAP, CINEMA_MAP } from '../kerusi/kerusi-examples.fixture.js';
import { seatSizeOf } from '../kerusi/kerusi-geometry.js';
import { buildRenderModel } from './build-render-model.js';
import { computeMapLayout, MapLayoutOptions } from './map-layout.js';

/** Every conformant map in the vendored rev 15 corpus, by file name. */
const CORPUS_MAPS: Record<string, KerusiMap> = Object.fromEntries(
  Object.entries(
    import.meta.glob<KerusiMap>('../kerusi/conformance/corpus/*.map.kerusi.json', {
      eager: true,
      import: 'default',
    }),
  ).map(([path, doc]) => [path.split('/').at(-1)!, doc]),
);

const TOWN_HALL = CORPUS_MAPS['town-hall.map.kerusi.json'];

const mapWith = (...sections: Section[]): KerusiMap => ({
  kerusi: '1.0',
  id: 'm',
  canvas: { width: 400, height: 200 },
  seatSize: 20,
  legend: [{ id: 'standard' }],
  sections,
});

const layoutOf = (map: KerusiMap, options?: MapLayoutOptions) =>
  computeMapLayout(buildRenderModel(map), options);

describe('placement copies the document (§4.5)', () => {
  it('places every corpus seat at its x/y, at its seat size and rotation', () => {
    // The acceptance criterion in #32: a seat's footprint is the document's,
    // in every conformant example.
    expect(Object.keys(CORPUS_MAPS).length).toBeGreaterThan(0);
    for (const [name, map] of Object.entries(CORPUS_MAPS)) {
      const layout = layoutOf(map);
      expect([layout.width, layout.height], name).toEqual([map.canvas.width, map.canvas.height]);
      for (const section of map.sections) {
        const placed = layout.sections.find((s) => s.section.id === section.id)!;
        const size = seatSizeOf(map, section)!;
        for (const seat of section.seats) {
          const p = placed.seats.find((s) => s.seat.id === seat.id)!;
          expect(
            [p.centerX, p.centerY, p.width, p.height, p.rotation],
            `${name} ${seat.id}`,
          ).toEqual([seat.x, seat.y, size, size, seat.rotation ?? 0]);
          expect([p.x, p.y]).toEqual([seat.x - size / 2, seat.y - size / 2]);
        }
      }
    }
  });

  it('keeps sections where the document puts them, side by side on one canvas', () => {
    const layout = layoutOf(TOWN_HALL);
    expect(layout.sections.map((s) => s.section.id)).toEqual(['stalls', 'balcony']);
    const a1 = layout.sections[0].seats.find((p) => p.seat.id === 'A1')!;
    const l1 = layout.sections[1].seats.find((p) => p.seat.id === 'L1')!;
    expect([a1.centerX, a1.centerY]).toEqual([320, 400]);
    expect([l1.centerX, l1.centerY]).toEqual([480, 614]);
  });

  it('draws a round table where its seats are, not on a lattice', () => {
    const table = layoutOf(TOWN_HALL)
      .sections[0].seats.filter((p) => p.seat.row === 'T1')
      .map((p) => [p.seat.id, p.centerX, p.centerY]);
    expect(table).toEqual([
      ['T1-1', 1300, 230],
      ['T1-2', 1370, 300],
      ['T1-3', 1300, 370],
      ['T1-4', 1230, 300],
    ]);
  });

  it("uses a section's own seat size for its seats", () => {
    const layout = layoutOf(
      mapWith(
        { id: 'eco', seats: [{ id: 'E1', x: 50, y: 50, type: 'standard' }] },
        { id: 'biz', seatSize: 30, seats: [{ id: 'B1', x: 150, y: 50, type: 'standard' }] },
      ),
    );
    expect(layout.sections.map((s) => s.seats[0].width)).toEqual([20, 30]);
    expect(layout.sections[1].seats[0].x).toBe(135);
  });

  it('carries per-seat rotation through', () => {
    const layout = layoutOf(CINEMA_MAP);
    const rotations = layout.sections[0].seats.map((p) => [p.seat.id, p.rotation]);
    expect(rotations).toEqual([
      ['A1', -5],
      ['A2', -3],
      ['L1', 0],
      ['L2', 0],
    ]);
  });

  it('emits no placeholder for a skipped col (§4.3.2 no filler objects)', () => {
    expect(layoutOf(BUS_MAP).sections[0].seats).toHaveLength(4);
  });

  it('never reads row or col to place a seat', () => {
    const base = mapWith({
      id: 's',
      seats: [
        { id: 'A1', row: 'A', col: 1, x: 50, y: 50, type: 'standard' },
        { id: 'A2', row: 'A', col: 2, x: 90, y: 50, type: 'standard' },
      ],
    });
    const swapped = mapWith({
      id: 's',
      seats: [
        { id: 'A1', row: 'B', col: 7, x: 50, y: 50, type: 'standard' },
        { id: 'A2', row: 'A', col: 1, x: 90, y: 50, type: 'standard' },
      ],
    });
    const centres = (map: KerusiMap) =>
      layoutOf(map)
        .sections[0].seats.map((p) => [p.seat.id, p.centerX, p.centerY])
        .sort();
    expect(centres(swapped)).toEqual(centres(base));
  });

  it('lets an empty row reserve nothing (§4.2.2)', () => {
    // Hall B declares four seatless rows; dropping them moves no seat.
    const bare: KerusiMap = {
      ...CINEMA_GRID_MAP,
      sections: [{ ...CINEMA_GRID_MAP.sections[0], rows: undefined }],
    };
    const centres = (map: KerusiMap) =>
      layoutOf(map).sections[0].seats.map((p) => [p.seat.id, p.centerX, p.centerY]);
    expect(centres(CINEMA_GRID_MAP).sort()).toEqual(centres(bare).sort());
  });
});

describe('the canvas', () => {
  it('is the viewBox, whatever the seats cover', () => {
    const layout = layoutOf(BUS_MAP);
    expect([layout.width, layout.height]).toEqual([192, 56]);
  });

  it('does not shrink when sections are left out (D4)', () => {
    const balconyOnly = computeMapLayout(
      buildRenderModel(TOWN_HALL, undefined, { sectionIds: ['balcony'] }),
    );
    expect([balconyOnly.width, balconyOnly.height]).toEqual([1600, 900]);
    const l1 = balconyOnly.sections[0].seats.find((p) => p.seat.id === 'L1')!;
    expect([l1.centerX, l1.centerY]).toEqual([480, 614]);
  });

  it("carries each section's bounds, declared or from its content", () => {
    const layout = layoutOf(TOWN_HALL);
    expect(layout.sections[0].bounds).toEqual({ x: 280, y: 60, width: 1180, height: 680 });
    // Bus seats span x 28..164 and y 28, each 28 wide.
    expect(layoutOf(BUS_MAP).sections[0].bounds).toEqual({ x: 14, y: 14, width: 164, height: 28 });
  });
});

describe('elements (§4.4.1)', () => {
  it('centres an element on its x/y at its own size', () => {
    const [screen] = layoutOf(CINEMA_MAP).sections[0].elements;
    expect([screen.centerX, screen.centerY, screen.width, screen.height]).toEqual([
      500, 20, 800, 30,
    ]);
    expect([screen.x, screen.y]).toEqual([100, 5]);
  });

  it('defaults a missing width or height to the section seat size', () => {
    const layout = layoutOf(
      mapWith({
        id: 's',
        seatSize: 24,
        seats: [],
        elements: [
          { id: 'exit', kind: 'exit', x: 100, y: 100 },
          { id: 'wide', kind: 'gap', x: 200, y: 100, width: 60 },
        ],
      }),
    );
    const [exit, wide] = layout.sections[0].elements;
    expect([exit.width, exit.height]).toEqual([24, 24]);
    expect([wide.width, wide.height]).toEqual([60, 24]);
  });

  it('carries rotation through', () => {
    const layout = layoutOf(
      mapWith({
        id: 's',
        seats: [],
        elements: [{ id: 'l', kind: 'label', label: 'Bar', x: 100, y: 100, rotation: 90 }],
      }),
    );
    expect(layout.sections[0].elements[0].rotation).toBe(90);
  });
});

describe('right-to-left: the whole canvas mirrors (D3)', () => {
  const tilted = mapWith(
    {
      id: 'left',
      bounds: { x: 0, y: 0, width: 150, height: 200 },
      seats: [
        { id: 'A1', row: 'A', col: 1, x: 50, y: 50, rotation: 10, type: 'standard' },
        { id: 'A2', row: 'A', col: 2, x: 80, y: 50, type: 'standard' },
      ],
      elements: [
        { id: 'bar', kind: 'label', label: 'Bar', x: 100, y: 150, width: 60, rotation: 5 },
      ],
    },
    {
      id: 'right',
      seats: [{ id: 'B1', x: 350, y: 60, type: 'standard' }],
    },
  );
  const ltr = layoutOf(tilted);
  const rtl = layoutOf(tilted, { rtl: true });

  it('maps every x to canvas.width − x and leaves y alone', () => {
    const centres = (layout: typeof ltr) =>
      layout.sections.flatMap((s) => s.seats.map((p) => [p.seat.id, p.centerX, p.centerY]));
    expect(centres(rtl)).toEqual([
      ['A1', 350, 50],
      ['A2', 320, 50],
      ['B1', 50, 60],
    ]);
    expect(centres(ltr)).toEqual([
      ['A1', 50, 50],
      ['A2', 80, 50],
      ['B1', 350, 60],
    ]);
  });

  it('negates rotation and keeps size', () => {
    const a1 = rtl.sections[0].seats[0];
    expect(a1.rotation).toBe(-10);
    expect([a1.width, a1.height]).toEqual([20, 20]);
    expect(rtl.sections[0].seats[1].rotation).toBe(0);
    expect(Object.is(rtl.sections[0].seats[1].rotation, -0)).toBe(false);
  });

  it('mirrors elements and section bounds with everything else', () => {
    const [bar] = rtl.sections[0].elements;
    expect([bar.centerX, bar.centerY, bar.rotation]).toEqual([300, 150, -5]);
    expect(rtl.sections[0].bounds).toEqual({ x: 250, y: 0, width: 150, height: 200 });
  });

  it('keeps the canvas size and the seat order', () => {
    expect([rtl.width, rtl.height]).toEqual([ltr.width, ltr.height]);
    expect(rtl.sections[0].seats.map((p) => p.seat.id)).toEqual(['A1', 'A2']);
  });
});

describe('text element font size', () => {
  // Seat size 20, so the floor is 4.
  const withLabel = (label: string | undefined, extra = {}) =>
    layoutOf(
      mapWith({
        id: 'house',
        seats: [{ id: 'A1', x: 200, y: 100, type: 'standard' }],
        elements: [
          { id: 'l', kind: 'label', label, x: 200, y: 20, width: 200, height: 25, ...extra },
          { id: 'x', kind: 'exit', label: 'Exit', x: 200, y: 180, width: 200, height: 25 },
        ],
      }),
    ).sections[0].elements;

  it('sizes a short label from the box height', () => {
    expect(withLabel('Balcony')[0].fontSize).toBeCloseTo(25 * 0.6);
  });

  it('shrinks a long label so it fits the box width', () => {
    const label = 'A very long section heading over the seats';
    const [text] = withLabel(label);
    expect(text.fontSize).toBeLessThan(25 * 0.6);
    expect(label.length * text.fontSize * 0.6).toBeLessThanOrEqual(200 + 1e-9);
  });

  it('keeps a floor relative to the seat size', () => {
    expect(withLabel('Hi', { height: 0.5 })[0].fontSize).toBe(20 * 0.2);
  });

  it('does not depend on the width for a label that fits', () => {
    expect(withLabel('Hi', { width: 100 })[0].fontSize).toBe(
      withLabel('Hi', { width: 400 })[0].fontSize,
    );
  });

  it('keeps the box rule for other kinds', () => {
    expect(withLabel('Balcony')[1].fontSize).toBe(Math.max(Math.min(25 * 0.5, 200 * 0.18), 4));
  });
});

describe('section label anchor (D5)', () => {
  it('sits just above the top-left of the bounds, sized from the seat size', () => {
    const [stalls, balcony] = layoutOf(TOWN_HALL).sections;
    // Seat size 40: gap 10, font 20, so the text spans the 30 units above.
    expect(stalls.labelAnchor).toEqual({ x: 280, y: 30, fontSize: 20 });
    expect(balcony.labelAnchor).toEqual({ x: 440, y: 550, fontSize: 20 });
  });

  it('moves to the top-right corner when the canvas mirrors', () => {
    const stalls = layoutOf(TOWN_HALL, { rtl: true }).sections[0];
    // Bounds mirror to x 140..1320.
    expect(stalls.labelAnchor).toEqual({ x: 1320, y: 30, fontSize: 20 });
  });

  it('goes inside the corner when the canvas has no room above', () => {
    const flush = layoutOf(
      mapWith({
        id: 's',
        bounds: { x: 0, y: 0, width: 200, height: 200 },
        seats: [{ id: 'A1', x: 50, y: 50, type: 'standard' }],
      }),
    ).sections[0];
    // Seat size 20: inset 5, font 10.
    expect(flush.labelAnchor).toEqual({ x: 5, y: 5, fontSize: 10 });
  });
});
