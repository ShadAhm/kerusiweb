import { describe, expect, it } from 'vitest';
import { Group, KerusiMap } from '../kerusi/kerusi-map.model.js';
import { KerusiState } from '../kerusi/kerusi-state.model.js';
import { DEFAULT_KERUSI_COLORS } from '../view/kerusi-seatmap-colors.js';
import { groupPaint, resolveGroupGlyph } from '../view/group-glyph.js';
import { buildRenderModel } from './build-render-model.js';
import { groupFootprint } from './group-shapes.js';
import { computeMapLayout, PlacedGroupShape } from './map-layout.js';

/** A section with a round table of four, a sofa of two, and one seat standing alone. */
const MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'm',
  canvas: { width: 400, height: 300 },
  seatSize: 20,
  legend: [{ id: 'standard' }],
  sections: [
    {
      id: 's',
      seats: [
        { id: 'T1', row: 'T', col: 1, x: 100, y: 60, type: 'standard' },
        { id: 'T2', row: 'T', col: 2, x: 140, y: 100, type: 'standard' },
        { id: 'T3', row: 'T', col: 3, x: 100, y: 140, type: 'standard' },
        { id: 'T4', row: 'T', col: 4, x: 60, y: 100, type: 'standard' },
        { id: 'F1', x: 260, y: 100, type: 'standard' },
        { id: 'F2', x: 290, y: 100, type: 'standard' },
        { id: 'LONE', x: 340, y: 240, type: 'standard' },
      ],
      groups: [
        {
          id: 'table-3',
          kind: 'table',
          label: { en: 'Table 3', ms: 'Meja 3' },
          seats: ['T1', 'T2', 'T3', 'T4'],
          shape: { circle: { center: [100, 100], radius: 30 } },
        },
        {
          id: 'sofa',
          kind: 'sofa',
          seats: ['F1', 'F2'],
          shape: { rect: { x: 275, y: 100, width: 70, height: 30, rotation: 90 } },
        },
      ],
    },
  ],
};

const modelOf = (map: KerusiMap = MAP, state?: KerusiState) => buildRenderModel(map, state);

describe('the render model reads groups (§4.11)', () => {
  const model = modelOf();
  const section = model.sections[0]!;

  it('resolves each group with its label, kind, seats and shape', () => {
    expect(section.groups.map((g) => [g.id, g.kind, g.label, g.seatIds, g.sectionId])).toEqual([
      ['table-3', 'table', 'Table 3', ['T1', 'T2', 'T3', 'T4'], 's'],
      ['sofa', 'sofa', undefined, ['F1', 'F2'], 's'],
    ]);
    expect(section.groups[0]!.shape).toEqual({ kind: 'circle', x: 100, y: 100, radius: 30 });
    expect(section.groups[1]!.shape).toEqual({
      kind: 'rect',
      x: 275,
      y: 100,
      width: 70,
      height: 30,
      rotation: 90,
    });
  });

  it('localizes the label against the map’s locale', () => {
    const ms = modelOf({ ...MAP, locale: 'ms' }).sections[0]!.groups[0]!;
    expect(ms.label).toBe('Meja 3');
  });

  it('gives each seat its group, and a seat in none no group', () => {
    expect(model.seatsById.get('T2')!.group).toBe(section.groups[0]);
    expect(model.seatsById.get('F1')!.group).toBe(section.groups[1]);
    expect(model.seatsById.get('LONE')!.group).toBeUndefined();
  });

  it('leaves the seat list as it was: groups add structure, they do not reorder', () => {
    expect(section.seats.map((s) => s.id)).toEqual(['T1', 'T2', 'T3', 'T4', 'F1', 'F2', 'LONE']);
    expect(
      modelOf({ ...MAP, sections: [{ ...MAP.sections[0]!, groups: undefined }] }).sections[0]!
        .groups,
    ).toEqual([]);
  });

  it('draws a group with no shape as its seats alone', () => {
    const bare: Group = { id: 'g', kind: 'companion', seats: ['LONE'] };
    const m = modelOf({ ...MAP, sections: [{ ...MAP.sections[0]!, groups: [bare] }] });
    expect(m.sections[0]!.groups[0]!.shape).toBeUndefined();
    expect(m.seatsById.get('LONE')!.group?.id).toBe('g');
  });

  it('keeps a model of an invalid document usable: unknown seats dropped, bad shapes left out', () => {
    const bad: Group[] = [
      {
        id: 'a',
        kind: 'table',
        seats: ['T1', 'ghost'],
        shape: { circle: { center: [1, 1], radius: 0 } },
      },
      // Two kinds is invalid; neither is guessed at.
      {
        id: 'b',
        kind: 'table',
        seats: ['T2'],
        shape: {
          circle: { center: [1, 1], radius: 5 },
          rect: { x: 1, y: 1, width: 2, height: 2 },
        } as unknown as Group['shape'],
      },
      {
        id: 'c',
        kind: 'table',
        seats: ['T3'],
        shape: { rect: { x: 1, y: 1, width: -2, height: 2 } },
      },
    ];
    const m = modelOf({ ...MAP, sections: [{ ...MAP.sections[0]!, groups: bad }] });
    const groups = m.sections[0]!.groups;
    expect(groups.map((g) => g.seatIds)).toEqual([['T1'], ['T2'], ['T3']]);
    expect(groups.map((g) => g.shape)).toEqual([undefined, undefined, undefined]);
  });

  it('puts a seat in the first group that lists it, when an invalid document lists it twice', () => {
    const twice: Group[] = [
      { id: 'a', kind: 'table', seats: ['T1'] },
      { id: 'b', kind: 'table', seats: ['T1', 'T2'] },
    ];
    const m = modelOf({ ...MAP, sections: [{ ...MAP.sections[0]!, groups: twice }] });
    expect(m.seatsById.get('T1')!.group?.id).toBe('a');
    expect(m.seatsById.get('T2')!.group?.id).toBe('b');
  });

  it('counts a group’s footprint toward a section’s computed bounds, but not a declared one', () => {
    const noBounds = modelOf({
      ...MAP,
      sections: [
        {
          id: 's',
          seats: [{ id: 'A', x: 100, y: 100, type: 'standard' }],
          groups: [
            {
              id: 'g',
              kind: 'table',
              seats: ['A'],
              shape: { circle: { center: [100, 100], radius: 60 } },
            },
          ],
        },
      ],
    });
    expect(noBounds.sections[0]!.bounds).toEqual({ x: 40, y: 40, width: 120, height: 120 });
  });
});

describe('the layout places groups with the canvas (D3)', () => {
  const placed = (rtl = false) => computeMapLayout(modelOf(), { rtl }).sections[0]!;

  it('places a circle by its centre and a rect as an element: top-left, then turned', () => {
    const [table, sofa] = placed().groups;
    expect(table!.shape).toEqual({ kind: 'circle', centerX: 100, centerY: 100, radius: 30 });
    expect(sofa!.shape).toEqual({
      kind: 'rect',
      x: 240,
      y: 85,
      width: 70,
      height: 30,
      centerX: 275,
      centerY: 100,
      rotation: 90,
    });
  });

  it('gives each group its seats, in the order the group lists them', () => {
    const [table, sofa] = placed().groups;
    expect(table!.seats.map((s) => s.seat.id)).toEqual(['T1', 'T2', 'T3', 'T4']);
    expect(sofa!.seats.map((s) => s.seat.id)).toEqual(['F1', 'F2']);
  });

  it('follows the order a group lists its seats, not the order of the section', () => {
    const reversed = computeMapLayout(
      modelOf({
        ...MAP,
        sections: [
          {
            ...MAP.sections[0]!,
            groups: [{ id: 'g', kind: 'table', label: 'G', seats: ['T4', 'T2', 'T1'] }],
          },
        ],
      }),
    ).sections[0]!;
    expect(reversed.groups[0]!.seats.map((s) => s.seat.id)).toEqual(['T4', 'T2', 'T1']);
    // The flat list, and so the keyboard order, is untouched.
    expect(reversed.seats.map((s) => s.seat.id)).toEqual([
      'T1',
      'T2',
      'T3',
      'T4',
      'F1',
      'F2',
      'LONE',
    ]);
  });

  it('keeps every seat in the flat list, and loose only those outside a labelled group', () => {
    const section = placed();
    expect(section.seats.map((s) => s.seat.id)).toEqual([
      'T1',
      'T2',
      'T3',
      'T4',
      'F1',
      'F2',
      'LONE',
    ]);
    // The sofa has no label, so its seats are drawn loose; the table's are wrapped.
    expect(section.loose.map((s) => s.seat.id)).toEqual(['F1', 'F2', 'LONE']);
  });

  it('mirrors a footprint with the whole canvas in RTL, and negates its rotation', () => {
    const [table, sofa] = placed(true).groups;
    expect(table!.shape).toMatchObject({ centerX: 300, centerY: 100 });
    expect(sofa!.shape).toMatchObject({ x: 400 - 275 - 35, centerX: 125, rotation: -90 });
    // Mirroring each footprint on its own would move it relative to its seats.
    const t1 = placed(true).groups[0]!.seats[0]!;
    expect(table!.shape).toMatchObject({ centerX: 400 - 100 });
    expect(t1.centerX).toBe(400 - 100);
  });
});

describe('group footprints (D18)', () => {
  const rect = (rotation = 0): PlacedGroupShape => ({
    kind: 'rect',
    x: 100,
    y: 50,
    width: 120,
    height: 60,
    centerX: 160,
    centerY: 80,
    rotation,
  });
  const circle: PlacedGroupShape = { kind: 'circle', centerX: 100, centerY: 100, radius: 50 };

  const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

  /** The on-curve points of a `d` made of M, L, A and Z: an arc's radii and flags are not points. */
  function points(d: string): [number, number][] {
    const t = d.trim().split(/\s+/);
    const out: [number, number][] = [];
    for (let i = 0; i < t.length;) {
      if (t[i] === 'M' || t[i] === 'L') {
        out.push([Number(t[i + 1]), Number(t[i + 2])]);
        i += 3;
      } else if (t[i] === 'A') {
        out.push([Number(t[i + 6]), Number(t[i + 7])]);
        i += 8;
      } else {
        i += 1;
      }
    }
    return out;
  }

  for (const kind of ['table', 'sofa', 'loveseat', 'pew', 'bench', 'booth']) {
    it(`gives a ${kind} its own look on a rect, inside the footprint`, () => {
      const f = groupFootprint(kind, rect());
      expect(f.details.length).toBeGreaterThan(0);
      for (const d of [f.body, ...f.details]) {
        expect(d.trim().endsWith('Z')).toBe(true);
      }
      // Every detail's on-curve points stay within the body's box (x 100..220, y 50..110).
      for (const d of f.details) {
        const pts = points(d);
        expect(pts.length).toBeGreaterThanOrEqual(4);
        for (const [x, y] of pts) {
          expect(x).toBeGreaterThanOrEqual(99.5);
          expect(x).toBeLessThanOrEqual(220.5);
          expect(y).toBeGreaterThanOrEqual(49.5);
          expect(y).toBeLessThanOrEqual(110.5);
        }
      }
    });
  }

  it('draws other kinds, registered or not, as the plain body', () => {
    for (const kind of ['box', 'companion', 'hammock']) {
      expect(groupFootprint(kind, rect()).details).toEqual([]);
      expect(groupFootprint(kind, circle).details).toEqual([]);
    }
  });

  it('draws a round table as a disc with a cloth, and no other circle with one', () => {
    expect(groupFootprint('table', circle).details).toHaveLength(1);
    expect(groupFootprint('sofa', circle).details).toEqual([]);
    expect(groupFootprint('table', circle).transform).toBeNull();
  });

  it('turns a rotated rect about its centre, and leaves an unturned one alone', () => {
    expect(groupFootprint('sofa', rect(90)).transform).toBe('rotate(90 160 80)');
    expect(groupFootprint('sofa', rect()).transform).toBeNull();
  });

  it('puts a sofa’s back on its bottom edge: front is the top', () => {
    const [back] = groupFootprint('sofa', rect()).details;
    // The back is the first detail: a band along the bottom 26% of the rect.
    expect(numbers(back!).some((v) => Math.abs(v - (50 + 60 * 0.74)) < 0.01)).toBe(true);
  });
});

describe('resolveGroupGlyph', () => {
  const layout = computeMapLayout(modelOf());
  const [table, sofa] = layout.sections[0]!.groups;

  it('names the classes and data a stylesheet picks a piece out by', () => {
    const glyph = resolveGroupGlyph(table!, DEFAULT_KERUSI_COLORS)!;
    expect(glyph.className).toBe('kerusi-group kerusi-group--table');
    expect([glyph.id, glyph.kind]).toEqual(['table-3', 'table']);
  });

  it('paints from the kind’s token, then the shared token, then the palette', () => {
    const glyph = resolveGroupGlyph(sofa!, DEFAULT_KERUSI_COLORS)!;
    expect(glyph.body.fill).toBe(
      `var(--kerusi-group-sofa-fill, var(--kerusi-group-fill, ${DEFAULT_KERUSI_COLORS.groupFill}))`,
    );
    expect(glyph.body.stroke).toContain('--kerusi-group-sofa-stroke');
    expect(glyph.details[0]!.fill).toContain('--kerusi-group-sofa-detail');
  });

  it('uses the colors prop as the palette tier', () => {
    const colors = { ...DEFAULT_KERUSI_COLORS, groupFill: '#123456' };
    expect(resolveGroupGlyph(table!, colors)!.body.fill).toContain('#123456');
  });

  it('skips the per-kind tier for a kind that is not a safe property name', () => {
    expect(groupPaint('my kind', 'fill', DEFAULT_KERUSI_COLORS)).toBe(
      `var(--kerusi-group-fill, ${DEFAULT_KERUSI_COLORS.groupFill})`,
    );
    expect(groupPaint('my)kind', 'stroke', DEFAULT_KERUSI_COLORS)).not.toContain('my)kind');
  });

  it('draws nothing for a group with no shape', () => {
    const bare = computeMapLayout(
      modelOf({
        ...MAP,
        sections: [{ ...MAP.sections[0]!, groups: [{ id: 'g', kind: 'table', seats: ['LONE'] }] }],
      }),
    ).sections[0]!.groups[0]!;
    expect(resolveGroupGlyph(bare, DEFAULT_KERUSI_COLORS)).toBeUndefined();
  });
});
