import { KerusiMap, Point, RowShape, Seat, Section } from './kerusi-map.model.js';

/**
 * Canvas geometry the standard defines over a map (§4.2.3, §4.3.1, §4.3.5,
 * §4.5), with the same semantics as the reference validator's
 * `schema/semantic-rules.mjs`. Reimplemented rather than imported so core keeps
 * no runtime dependencies.
 */

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isInteger = (v: unknown): v is number => Number.isInteger(v);

const rad = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * The seat size that applies within a section (§4.5): the section's own
 * `seatSize` when it declares one, the map's otherwise. `undefined` only for a
 * document missing both, which the validator rejects.
 */
export function seatSizeOf(
  map: Pick<KerusiMap, 'seatSize'>,
  section?: Pick<Section, 'seatSize'>,
): number | undefined {
  if (isNum(section?.seatSize)) {
    return section.seatSize;
  }
  return isNum(map?.seatSize) ? map.seatSize : undefined;
}

/**
 * Whether two seats of the SAME section are neighbours (§4.3.5): same row, and
 * cols that differ by exactly 1. Nothing else implies adjacency — not distance,
 * not labels, not array order. Seats in different sections never are, so the
 * caller must only pass seats from one section.
 */
export function areNeighbours(a: Pick<Seat, 'row' | 'col'>, b: Pick<Seat, 'row' | 'col'>): boolean {
  if (a.row === undefined || b.row === undefined || a.row !== b.row) {
    return false;
  }
  if (!Number.isInteger(a.col) || !Number.isInteger(b.col)) {
    return false;
  }
  return Math.abs(a.col! - b.col!) === 1;
}

/**
 * The guide point of column `col` on a row shape (§4.2.3). `null` when the
 * column lies outside the shape's `cols` range, or the shape is not one the
 * standard defines.
 *
 * Only editors need this. A renderer draws each seat at its own `x`/`y` and
 * never consults a row shape.
 */
export function guidePoint(shape: RowShape, col: number): Point | null {
  const g =
    'line' in shape
      ? shape.line
      : 'arc' in shape
        ? shape.arc
        : 'circle' in shape
          ? shape.circle
          : undefined;
  if (!g) {
    return null;
  }
  const [a, b]: readonly unknown[] = Array.isArray(g.cols) ? g.cols : [];
  if (!isInteger(col) || !isInteger(a) || !isInteger(b) || col < a || col > b) {
    return null;
  }
  const t = a === b ? 0 : (col - a) / (b - a);
  const onCircle = (center: Point, radius: number, degrees: number): Point => [
    center[0] + radius * Math.cos(rad(degrees)),
    center[1] + radius * Math.sin(rad(degrees)),
  ];

  if ('line' in shape) {
    const { from, to } = shape.line;
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
  }
  if ('arc' in shape) {
    const { center, radius, start, sweep } = shape.arc;
    return onCircle(center, radius, start + sweep * t);
  }
  const { center, radius, start } = shape.circle;
  return onCircle(center, radius, start + (360 * (col - a)) / (b - a + 1));
}

/**
 * Whether a seat lies on its guide (§4.2.3): within `seatSize / 4` of its guide
 * point. Editors use this to decide which seats to move when a guide changes;
 * renderers never do.
 */
export function isOnGuide(
  seat: Pick<Seat, 'col' | 'x' | 'y'>,
  shape: RowShape,
  seatSize: number,
): boolean {
  if (seat.col === undefined) {
    return false;
  }
  const point = guidePoint(shape, seat.col);
  if (!point || !isNum(seat.x) || !isNum(seat.y)) {
    return false;
  }
  return Math.hypot(seat.x - point[0], seat.y - point[1]) <= seatSize / 4;
}

/**
 * A seat's footprint (§4.5): a square of side `size` centred on `x`/`y`, turned
 * by `theta` radians.
 */
export interface Footprint {
  x: number;
  y: number;
  size: number;
  theta: number;
}

export function footprintOf(seat: Pick<Seat, 'x' | 'y' | 'rotation'>, size: number): Footprint {
  return { x: seat.x, y: seat.y, size, theta: rad(isNum(seat.rotation) ? seat.rotation : 0) };
}

/**
 * Whether two footprints overlap (§4.3.1), by the separating axis theorem over
 * the edge normals of both squares. Footprints that only touch, as neighbouring
 * seats placed exactly one seat size apart do, don't overlap.
 */
export function footprintsOverlap(p: Footprint, q: Footprint): boolean {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const tolerance = 1e-9 * Math.max(p.size, q.size);
  const reach = (f: Footprint, axis: number) =>
    (f.size / 2) * (Math.abs(Math.cos(f.theta - axis)) + Math.abs(Math.sin(f.theta - axis)));

  for (const axis of [p.theta, p.theta + Math.PI / 2, q.theta, q.theta + Math.PI / 2]) {
    const gap = Math.abs(dx * Math.cos(axis) + dy * Math.sin(axis));
    if (gap >= reach(p, axis) + reach(q, axis) - tolerance) {
      return false;
    }
  }
  return true;
}

/**
 * A rectangle centred on `x`/`y`, turned by `theta` radians: a group's `rect`
 * shape (§4.11). `hw` and `hh` are its half sides.
 */
export interface TurnedRect {
  x: number;
  y: number;
  hw: number;
  hh: number;
  theta: number;
}

/** A group's `circle` shape (§4.11). */
export interface Disc {
  x: number;
  y: number;
  radius: number;
}

const footprintRect = (f: Footprint): TurnedRect => ({
  x: f.x,
  y: f.y,
  hw: f.size / 2,
  hh: f.size / 2,
  theta: f.theta,
});

/**
 * Whether a group's `rect` shape overlaps a seat footprint, by the separating
 * axis theorem over the edge normals of both. Shapes that only touch do not
 * overlap (§4.11).
 */
export function rectOverlapsFootprint(r: TurnedRect, f: Footprint): boolean {
  const q = footprintRect(f);
  const dx = q.x - r.x;
  const dy = q.y - r.y;
  const tolerance = 1e-9 * Math.max(r.hw, r.hh, q.hw, q.hh);
  const reach = (t: TurnedRect, axis: number) =>
    t.hw * Math.abs(Math.cos(t.theta - axis)) + t.hh * Math.abs(Math.sin(t.theta - axis));
  for (const axis of [r.theta, r.theta + Math.PI / 2, q.theta, q.theta + Math.PI / 2]) {
    const gap = Math.abs(dx * Math.cos(axis) + dy * Math.sin(axis));
    if (gap >= reach(r, axis) + reach(q, axis) - tolerance) {
      return false;
    }
  }
  return true;
}

/**
 * Whether a group's `circle` shape overlaps a seat footprint: the footprint's
 * nearest point to the circle's centre lies strictly inside the circle.
 * Touching is not overlapping (§4.11).
 */
export function discOverlapsFootprint(c: Disc, f: Footprint): boolean {
  const { hw, hh } = footprintRect(f);
  const dx = c.x - f.x;
  const dy = c.y - f.y;
  const lx = dx * Math.cos(-f.theta) - dy * Math.sin(-f.theta);
  const ly = dx * Math.sin(-f.theta) + dy * Math.cos(-f.theta);
  const nx = Math.max(-hw, Math.min(hw, lx));
  const ny = Math.max(-hh, Math.min(hh, ly));
  return Math.hypot(lx - nx, ly - ny) < c.radius - 1e-9 * Math.max(c.radius, hw, hh);
}

/** A turned rectangle for a group's `rect` shape, `rotation` in degrees; `undefined` when malformed. */
export function turnedRectOf(rect: {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  rotation?: unknown;
}): TurnedRect | undefined {
  if (![rect.x, rect.y, rect.width, rect.height].every(isNum)) {
    return undefined;
  }
  return {
    x: rect.x as number,
    y: rect.y as number,
    hw: (rect.width as number) / 2,
    hh: (rect.height as number) / 2,
    theta: rad(isNum(rect.rotation) ? rect.rotation : 0),
  };
}
