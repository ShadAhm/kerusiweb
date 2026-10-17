import { describe, expect, it } from 'vitest';
import { areNeighbours, guidePoint, isOnGuide, seatSizeOf } from './kerusi-geometry.js';
import { Point, RowShape } from './kerusi-map.model.js';

// Cases ported from the reference validator's schema/test/semantic-cases.mjs,
// so these helpers agree with it to the canvas unit.

// The shapes of the town hall in the corpus's town-hall.map.kerusi.json.
const rowA: RowShape = { line: { from: [320, 400], to: [1088, 400], cols: [1, 9] } };
const table: RowShape = { circle: { center: [1300, 300], radius: 70, start: -90, cols: [1, 4] } };
const balcony: RowShape = {
  arc: { center: [800, 60], radius: 640, start: 120, sweep: -60, cols: [1, 7] },
};

const expectNear = (actual: Point | null, [x, y]: Point) => {
  expect(actual).not.toBeNull();
  expect(actual![0]).toBeCloseTo(x, 0);
  expect(actual![1]).toBeCloseTo(y, 0);
};

describe('seatSizeOf (§4.5)', () => {
  it("prefers the section's own seat size, and falls back to the map's", () => {
    expect(seatSizeOf({ seatSize: 40 }, { seatSize: 50 })).toBe(50);
    expect(seatSizeOf({ seatSize: 40 }, {})).toBe(40);
    expect(seatSizeOf({ seatSize: 40 })).toBe(40);
  });
});

describe('areNeighbours (§4.3.5)', () => {
  const a1 = { row: 'A', col: 1 };
  const a2 = { row: 'A', col: 2 };
  const a4 = { row: 'A', col: 4 };

  it('is true for the same row and cols one apart, in either order', () => {
    expect(areNeighbours(a1, a2)).toBe(true);
    expect(areNeighbours(a2, a1)).toBe(true);
  });

  it('is false across an aisle (a skipped col)', () => {
    expect(areNeighbours(a2, a4)).toBe(false);
  });

  it('is false across rows, and for a seat in no row however close', () => {
    expect(areNeighbours(a1, { row: 'B', col: 2 })).toBe(false);
    expect(areNeighbours(a1, {})).toBe(false);
  });
});

describe('guidePoint (§4.2.3)', () => {
  it('spreads a line evenly from `from` to `to`, aisle cols keeping their gap', () => {
    expectNear(guidePoint(rowA, 1), [320, 400]);
    expectNear(guidePoint(rowA, 4), [608, 400]);
    expectNear(guidePoint(rowA, 5), [704, 400]);
    expectNear(guidePoint(rowA, 6), [800, 400]);
    expectNear(guidePoint(rowA, 9), [1088, 400]);
  });

  it('measures arc angles on the canvas axes, a negative sweep turning anticlockwise', () => {
    expectNear(guidePoint(balcony, 1), [480, 614.3]);
    expectNear(guidePoint(balcony, 4), [800, 700]);
    expectNear(guidePoint(balcony, 5), [911.1, 690.3]);
    expectNear(guidePoint(balcony, 7), [1120, 614.3]);
  });

  it('spaces a circle evenly round, the last col not landing back on the first', () => {
    expectNear(guidePoint(table, 1), [1300, 230]);
    expectNear(guidePoint(table, 2), [1370, 300]);
    expectNear(guidePoint(table, 3), [1300, 370]);
    expectNear(guidePoint(table, 4), [1230, 300]);
  });

  it('puts a single-column shape at `from`, or at `start` on an arc', () => {
    expectNear(guidePoint({ line: { from: [10, 20], to: [90, 20], cols: [3, 3] } }, 3), [10, 20]);
    expectNear(
      guidePoint({ arc: { center: [0, 0], radius: 10, start: 90, sweep: 45, cols: [2, 2] } }, 2),
      [0, 10],
    );
  });

  it("has no point for a col outside the shape's range", () => {
    expect(guidePoint(rowA, 10)).toBeNull();
    expect(guidePoint(rowA, 0)).toBeNull();
  });
});

describe('isOnGuide (§4.2.3)', () => {
  it('means within seatSize / 4 of the guide point', () => {
    expect(isOnGuide({ col: 9, x: 1100, y: 440 }, rowA, 40)).toBe(false);
    expect(isOnGuide({ col: 5, x: 930, y: 760 }, balcony, 40)).toBe(false);
    expect(isOnGuide({ col: 4, x: 800, y: 700 }, balcony, 40)).toBe(true);
    expect(isOnGuide({ col: 4, x: 800, y: 709.9 }, balcony, 40)).toBe(true);
    expect(isOnGuide({ col: 4, x: 800, y: 710.1 }, balcony, 40)).toBe(false);
  });

  it('is false for a seat with no col', () => {
    expect(isOnGuide({ x: 320, y: 400 }, rowA, 40)).toBe(false);
  });
});
