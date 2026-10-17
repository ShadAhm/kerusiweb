import { RenderRow, RenderSeat, RenderSection } from './render-model.js';

/**
 * Keyboard navigation order over a seat map.
 *
 * §4.3.5 makes `row` and `col` the source of truth for "next to": two seats are
 * neighbours when they share a row and their cols differ by one, whatever the
 * drawing looks like. That is exactly what "the seat to my right" must mean for
 * a keyboard or a screen reader, so a curved balcony or a round table still
 * reads seat 1, 2, 3.
 *
 *  - Left/right moves along the row in `col` order. At an aisle, a skipped
 *    `col`, it jumps to the next seat in the row rather than stopping, so a
 *    keyboard user is never stranded; `RenderSeat.besideAisle` lets the seat's
 *    description say the aisle is there.
 *  - Up/down moves to the next row in the §4.2.1 order and picks the seat
 *    nearest on the canvas.
 *  - Seats with no `row` have no adjacency, so they fall back to a heuristic:
 *    banded by `y` and ordered by `x`.
 *
 * The arrows follow the screen. A row whose cols run right to left on the
 * canvas, or a mirrored canvas (D3), swaps left and right; rows ordered up the
 * screen swap up and down.
 */

/** The seats reachable from a given seat, by id. */
export interface SeatNeighbours {
  left?: string;
  right?: string;
  up?: string;
  down?: string;
  rowStart?: string;
  rowEnd?: string;
}

export interface NavigationGraph {
  /** Seats in traversal order: row by row, position by position. */
  order: readonly string[];
  /** Per-seat neighbours. */
  neighbours: ReadonlyMap<string, SeatNeighbours>;
  /** The first seat in the section, or `undefined` when it has none. */
  first?: string;
  /** The last seat in the section. */
  last?: string;
}

export interface NavigationOptions {
  /** The canvas is mirrored for a right-to-left locale, so left and right swap with it. */
  rtl?: boolean;
  /**
   * Restrict traversal to seats passing this test — e.g. to skip unselectable
   * seats. Default: every seat is reachable, since a screen-reader user needs
   * to hear that a seat is booked, not have it hidden.
   */
  includes?: (seatId: string) => boolean;
}

/**
 * Builds the navigation graph for one section. Sections are navigated
 * independently: Tab moves between them, arrows move within. Seats in
 * different sections are never neighbours (§4.3.5).
 */
export function buildNavigationGraph(
  section: RenderSection,
  options: NavigationOptions = {},
): NavigationGraph {
  const included = options.includes;
  const bands = section.rows
    .flatMap(rowBands)
    .map((band) => ({
      seats: band.filter((s) => !included || included(s.id)),
      ascending: runsRight(band) !== !!options.rtl,
    }))
    .filter((band) => band.seats.length > 0);

  const downIsNext = runsDown(bands.map((b) => b.seats));
  const neighbours = new Map<string, SeatNeighbours>();
  const order: string[] = [];

  bands.forEach(({ seats, ascending }, bandIndex) => {
    const above = bands[downIsNext ? bandIndex - 1 : bandIndex + 1]?.seats;
    const below = bands[downIsNext ? bandIndex + 1 : bandIndex - 1]?.seats;

    seats.forEach((seat, i) => {
      order.push(seat.id);

      const prev = seats[i - 1]?.id;
      const next = seats[i + 1]?.id;
      neighbours.set(seat.id, {
        left: ascending ? prev : next,
        right: ascending ? next : prev,
        up: nearest(above, seat),
        down: nearest(below, seat),
        rowStart: seats[0]?.id,
        rowEnd: seats[seats.length - 1]?.id,
      });
    });
  });

  return {
    order,
    neighbours,
    first: order[0],
    last: order[order.length - 1],
  };
}

/**
 * The bands one row contributes. A named row is one band, in the `col`-then-`x`
 * order the render model already gave it. An empty row (§4.2.2) contributes
 * nothing, so an arrow press never lands between two rows of seats.
 *
 * The seats with no `row` are not a row at all, so they are banded by `y`:
 * sorted top to bottom and split wherever the vertical step is far larger than
 * a typical one, which separates distinct arcs without assuming they are
 * level. This is a heuristic; a document that wants exact reading order gives
 * its seats `row` and `col`.
 */
function rowBands(row: RenderRow): RenderSeat[][] {
  if (row.seats.length === 0) {
    return [];
  }
  if (row.id !== '') {
    return [[...row.seats]];
  }

  const sorted = [...row.seats].sort((a, b) => a.y - b.y);

  // "Typical" is the 25th percentile rather than the median: the between-band
  // jumps are themselves steps, and with few bands they drag the median up
  // until no jump looks unusual any more. The floor keeps seats a fraction of
  // a seat apart in one band.
  const steps = sorted.slice(1).map((seat, i) => seat.y - sorted[i].y);
  const threshold = Math.max(percentile(steps, 0.25) * 4, sorted[0].size / 4);

  const bands: RenderSeat[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y > threshold) {
      bands.push([]);
    }
    bands[bands.length - 1].push(sorted[i]);
  }

  return bands.map((band) => band.sort((a, b) => a.x - b.x));
}

/**
 * Whether a band's order runs left to right on the canvas, judged from its two
 * ends. A band whose ends are level, such as a round table's, counts as left
 * to right.
 */
function runsRight(band: readonly RenderSeat[]): boolean {
  const dx = band[band.length - 1].x - band[0].x;
  return dx >= -tolerance(band[0]);
}

/**
 * Whether the row order runs down the screen, judged from the first and last
 * bands' mean `y`. Applied to the whole section, so up and down stay each
 * other's inverse.
 */
function runsDown(bands: readonly (readonly RenderSeat[])[]): boolean {
  if (bands.length < 2) {
    return true;
  }
  const meanY = (band: readonly RenderSeat[]) =>
    band.reduce((sum, s) => sum + s.y, 0) / band.length;
  return meanY(bands[bands.length - 1]) - meanY(bands[0]) >= -tolerance(bands[0][0]);
}

/** Below this, two positions count as level: a small fraction of a seat. */
function tolerance(seat: RenderSeat): number {
  return seat.size * 1e-6;
}

/** The seat in `band` nearest `from` on the canvas — vertical movement. */
function nearest(band: readonly RenderSeat[] | undefined, from: RenderSeat): string | undefined {
  if (!band || band.length === 0) {
    return undefined;
  }
  let best = band[0];
  let bestDistance = Math.hypot(best.x - from.x, best.y - from.y);
  for (const candidate of band.slice(1)) {
    const distance = Math.hypot(candidate.x - from.x, candidate.y - from.y);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best.id;
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(Math.floor(sorted.length * fraction), sorted.length - 1)];
}
