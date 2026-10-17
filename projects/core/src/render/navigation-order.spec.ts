import { describe, expect, it } from 'vitest';
import { KerusiMap, Section } from '../kerusi/kerusi-map.model.js';
import { BUS_MAP } from '../kerusi/kerusi-examples.fixture.js';
import TOWN_HALL from '../kerusi/conformance/corpus/town-hall.map.kerusi.json' with { type: 'json' };
import { buildRenderModel } from './build-render-model.js';
import { buildNavigationGraph, NavigationOptions } from './navigation-order.js';

const mapWith = (section: Section): KerusiMap => ({
  kerusi: '1.0',
  id: 'm',
  canvas: { width: 400, height: 400 },
  seatSize: 20,
  legend: [{ id: 'standard' }],
  sections: [section],
});

const graphOf = (map: KerusiMap, options?: NavigationOptions, section = 0) =>
  buildNavigationGraph(buildRenderModel(map).sections[section], options);

describe('left and right follow adjacency (§4.3.5, D6)', () => {
  const bus = graphOf(BUS_MAP);

  it('crosses an aisle rather than stopping at it', () => {
    // Cols are 1, 2, 4, 5 — col 3 is the aisle, and it is not a stop.
    expect(bus.neighbours.get('1B')!.right).toBe('1C');
    expect(bus.neighbours.get('1C')!.left).toBe('1B');
  });

  it('stops at the ends of a row', () => {
    expect(bus.neighbours.get('1A')!.left).toBeUndefined();
    expect(bus.neighbours.get('1D')!.right).toBeUndefined();
  });

  it('exposes the row ends for Home and End', () => {
    expect(bus.neighbours.get('1C')!.rowStart).toBe('1A');
    expect(bus.neighbours.get('1C')!.rowEnd).toBe('1D');
  });

  it('traverses in col order', () => {
    expect(bus.order).toEqual(['1A', '1B', '1C', '1D']);
    expect(bus.first).toBe('1A');
    expect(bus.last).toBe('1D');
  });

  it('follows col, not x, along a curved row', () => {
    // The balcony curves, and L5 dips below its neighbours; col still decides.
    const balcony = graphOf(TOWN_HALL as KerusiMap, {}, 1);
    expect(balcony.order).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']);
    expect(balcony.neighbours.get('L4')!.right).toBe('L5');
    expect(balcony.neighbours.get('L5')!.right).toBe('L6');
  });

  it('swaps left and right for a row whose cols run right to left on the canvas', () => {
    const reversed = graphOf(
      mapWith({
        id: 's',
        seats: [
          { id: 'A1', row: 'A', col: 1, x: 300, y: 50, type: 'standard' },
          { id: 'A2', row: 'A', col: 2, x: 200, y: 50, type: 'standard' },
          { id: 'A3', row: 'A', col: 3, x: 100, y: 50, type: 'standard' },
        ],
      }),
    );
    expect(reversed.order).toEqual(['A1', 'A2', 'A3']);
    expect(reversed.neighbours.get('A2')!.right).toBe('A1');
    expect(reversed.neighbours.get('A2')!.left).toBe('A3');
  });
});

describe('up and down follow the row order and the canvas', () => {
  const staggered = mapWith({
    id: 'main',
    rows: [
      { id: 'A', index: 0 },
      { id: 'B', index: 1 },
    ],
    seats: [
      { id: 'A1', row: 'A', col: 1, x: 20, y: 50, type: 'standard' },
      { id: 'A9', row: 'A', col: 9, x: 340, y: 50, type: 'standard' },
      { id: 'B4', row: 'B', col: 4, x: 140, y: 90, type: 'standard' },
      { id: 'B8', row: 'B', col: 8, x: 300, y: 90, type: 'standard' },
    ],
  });
  const nav = graphOf(staggered);

  it('moves down to the seat nearest on the canvas, not the first in the row', () => {
    expect(nav.neighbours.get('A1')!.down).toBe('B4');
    expect(nav.neighbours.get('A9')!.down).toBe('B8');
  });

  it('moves up symmetrically', () => {
    expect(nav.neighbours.get('B8')!.up).toBe('A9');
    expect(nav.neighbours.get('B4')!.up).toBe('A1');
  });

  it('stops at the top and bottom rows', () => {
    expect(nav.neighbours.get('A1')!.up).toBeUndefined();
    expect(nav.neighbours.get('B4')!.down).toBeUndefined();
  });

  it('measures nearness on the canvas, not by col', () => {
    // B1 is col-nearest to A1, but B9 sits right beneath it.
    const offset = graphOf(
      mapWith({
        id: 's',
        seats: [
          { id: 'A1', row: 'A', col: 1, x: 300, y: 50, type: 'standard' },
          { id: 'B1', row: 'B', col: 1, x: 40, y: 90, type: 'standard' },
          { id: 'B9', row: 'B', col: 9, x: 300, y: 90, type: 'standard' },
        ],
      }),
    );
    expect(offset.neighbours.get('A1')!.down).toBe('B9');
  });

  it('swaps up and down when the row order runs up the screen', () => {
    // Row A is nearest a stage at the bottom of the canvas.
    const upward = graphOf(
      mapWith({
        id: 's',
        rows: [
          { id: 'A', index: 0 },
          { id: 'B', index: 1 },
        ],
        seats: [
          { id: 'A1', row: 'A', col: 1, x: 100, y: 300, type: 'standard' },
          { id: 'B1', row: 'B', col: 1, x: 100, y: 260, type: 'standard' },
        ],
      }),
    );
    expect(upward.order).toEqual(['A1', 'B1']);
    expect(upward.neighbours.get('A1')!.up).toBe('B1');
    expect(upward.neighbours.get('B1')!.down).toBe('A1');
  });
});

describe('empty rows are stepped over, not into (§4.2.2)', () => {
  const withCrossAisle = mapWith({
    id: 's',
    rows: [
      { id: 'A', index: 0 },
      { id: 'cross-aisle', index: 1 },
      { id: 'C', index: 2 },
    ],
    seats: [
      { id: 'A1', row: 'A', col: 1, x: 50, y: 50, type: 'standard' },
      { id: 'C1', row: 'C', col: 1, x: 50, y: 130, type: 'standard' },
    ],
  });

  const graph = graphOf(withCrossAisle);

  it('moves from the row above to the row below in one step', () => {
    expect(graph.neighbours.get('A1')!.down).toBe('C1');
    expect(graph.neighbours.get('C1')!.up).toBe('A1');
  });

  it('leaves the empty row out of the traversal order entirely', () => {
    expect(graph.order).toEqual(['A1', 'C1']);
  });
});

describe('right-to-left: the canvas mirrors, so the arrows swap (D3)', () => {
  it('swaps left and right so the arrow keys stay visually correct', () => {
    const rtl = graphOf(BUS_MAP, { rtl: true });
    expect(rtl.neighbours.get('1B')!.left).toBe('1C');
    expect(rtl.neighbours.get('1B')!.right).toBe('1A');
    // The underlying col order — and so the reading order — is unchanged.
    expect(rtl.order).toEqual(['1A', '1B', '1C', '1D']);
  });

  it('leaves up and down alone', () => {
    const map = mapWith({
      id: 's',
      seats: [
        { id: 'A1', row: 'A', col: 1, x: 50, y: 50, type: 'standard' },
        { id: 'B1', row: 'B', col: 1, x: 50, y: 90, type: 'standard' },
      ],
    });
    expect(graphOf(map, { rtl: true }).neighbours.get('A1')!.down).toBe('B1');
  });
});

describe('seats with no row', () => {
  it('bands rowless seats by y and orders them by x', () => {
    const rowless = mapWith({
      id: 'house',
      seats: [
        { id: 'far', x: 320, y: 80, type: 'standard' },
        { id: 'near', x: 80, y: 84, type: 'standard' },
        { id: 'below', x: 200, y: 280, type: 'standard' },
      ],
    });
    const nav = graphOf(rowless);
    expect(nav.order).toEqual(['near', 'far', 'below']);
    expect(nav.neighbours.get('near')!.right).toBe('far');
    expect(nav.neighbours.get('far')!.down).toBe('below');
  });

  it('keeps a rowless seat reachable beside seats in rows', () => {
    // The town hall's wheelchair space S1 has no row.
    const stalls = graphOf(TOWN_HALL as KerusiMap);
    expect(stalls.order).toContain('S1');
    expect(stalls.order.at(-1)).toBe('S1');
  });
});

describe('filtering', () => {
  it('can exclude seats from traversal without disturbing the rest', () => {
    const nav = graphOf(BUS_MAP, { includes: (id) => id !== '1B' });
    expect(nav.order).not.toContain('1B');
    expect(nav.neighbours.get('1A')!.right).toBe('1C');
  });

  it('drops a row that ends up empty, rather than leaving a dead band', () => {
    const threeRows = mapWith({
      id: 'main',
      seats: [
        { id: 'A1', row: 'A', col: 1, x: 50, y: 50, type: 'standard' },
        { id: 'B1', row: 'B', col: 1, x: 50, y: 90, type: 'standard' },
        { id: 'C1', row: 'C', col: 1, x: 50, y: 130, type: 'standard' },
      ],
    });
    const nav = graphOf(threeRows, { includes: (id) => id !== 'B1' });
    expect(nav.order).toEqual(['A1', 'C1']);
    // A1 now steps straight down to C1; there is no empty stop in between.
    expect(nav.neighbours.get('A1')!.down).toBe('C1');
  });
});
