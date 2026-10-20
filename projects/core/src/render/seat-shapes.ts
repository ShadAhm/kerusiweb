/**
 * The seat glyph: the marks drawn inside a placed seat's box.
 *
 * A seat's box is always a rounded square, so the box alone cannot say which
 * way the seat faces. These shapes do. Every coordinate is relative to the
 * placed box, and **front is the top edge** when `rotation` is 0 — the seat
 * `<g>` carries the rotation, so a glyph drawn to that convention turns with it
 * for free.
 *
 * Kept here, next to `element-shapes`, rather than inlined in the template: the
 * ratios below are the whole design, and they are worth testing.
 */

/**
 * Rounds a coordinate for the `d` attribute.
 *
 * The ratios below are decimals, so 100 * 0.28 lands on 28.000000000000004.
 * Three places is far finer than a viewBox unit ever renders and keeps the
 * emitted path readable.
 */
function r(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** How far the back edge tapers in, per side, as a fraction of the front width. */
const BACK_TAPER = 0.12;
/** Corner radius at the front (square-ish), as a fraction of the short edge. */
const FRONT_RADIUS = 0.08;
/** Corner radius at the back (soft, so the taper reads as a back), same units. */
const BACK_RADIUS = 0.34;

/** The selected seat's frame, as a fraction of the seat's short edge. */
const SELECTED_FRAME = 0.1;
/** The held figure's outline stroke, same units. */
const OCCUPANT_STROKE = 0.05;

type Point = readonly [number, number];

/**
 * A closed path through `points`, each corner rounded to its own radius.
 *
 * For each vertex: step back along the incoming edge by `radius`, then arc to
 * a point the same distance along the outgoing edge. A radius is clamped to
 * half the shorter of its two adjacent edges, so a tiny seat cannot fold a
 * corner back on itself. `points` must run clockwise in screen coordinates
 * (y down). A convex corner then turns clockwise, a concave one (a notch)
 * counter-clockwise, and the `sweep-flag` follows the turn.
 */
function roundedPolygon(points: readonly Point[], radii: readonly number[]): string {
  const n = points.length;
  const dist = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const along = (from: Point, to: Point, d: number): Point => {
    const len = dist(from, to);
    if (len === 0) return from;
    const t = d / len;
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
  };

  let d = '';
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const radius = Math.min(radii[i], dist(prev, curr) / 2, dist(curr, next) / 2);
    const a = along(curr, prev, radius);
    const b = along(curr, next, radius);
    const turn =
      (curr[0] - prev[0]) * (next[1] - curr[1]) - (curr[1] - prev[1]) * (next[0] - curr[0]);
    d += i === 0 ? `M ${r(a[0])} ${r(a[1])} ` : `L ${r(a[0])} ${r(a[1])} `;
    d += `A ${r(radius)} ${r(radius)} 0 0 ${turn < 0 ? 0 : 1} ${r(b[0])} ${r(b[1])} `;
  }
  return `${d.trim()} Z`;
}

/**
 * The seat outline: a rounded trapezoid, square-ish at the front and tapered
 * at the back, so which way a seat faces is legible from the outline alone —
 * no separate frame mark is drawn on top of it.
 *
 * `inset` shrinks the whole shape uniformly (used to derive the selected
 * seat's core, which must stay just inside this outline). It shrinks the
 * bounding box rather than offsetting each edge along its own normal, so the
 * tapered sides move in slightly less than the front and back do — at a 0.12
 * taper that is a ~0.7% (cos 7°) difference, well under a viewBox unit and not
 * worth a true polygon offset for.
 *
 * Because a seat is square, an inset here is exactly a scaled copy about the
 * centre: `seatBodyPath(x, y, s, s, k)` and `seatBodyPath(x + k, y + k, s - 2k,
 * s - 2k)` emit the same `d`. {@link seatSelectedFrame} leans on that.
 */
export function seatBodyPath(
  x: number,
  y: number,
  width: number,
  height: number,
  inset = 0,
): string {
  const ix = x + inset;
  const iy = y + inset;
  const iw = width - inset * 2;
  const ih = height - inset * 2;
  const edge = Math.min(iw, ih);
  const taper = iw * BACK_TAPER;

  const points: Point[] = [
    [ix, iy], // front-left
    [ix + iw, iy], // front-right
    [ix + iw - taper, iy + ih], // back-right
    [ix + taper, iy + ih], // back-left
  ];
  const radii = [edge * FRONT_RADIUS, edge * FRONT_RADIUS, edge * BACK_RADIUS, edge * BACK_RADIUS];
  return roundedPolygon(points, radii);
}

/**
 * The width of the frame around a selected seat's core — feed it straight to
 * {@link seatBodyPath}'s `inset` to get the core.
 *
 * A seat is always square: `map-layout` places every one of them as
 * `size × size`, every seat in a section the same size. That makes the inset
 * shape an *exact* scaled copy of the body about its centre, not merely a
 * similar-looking one, so any mark that clears the body also clears the core
 * when it is drawn to the core's own box. That is what lets the frame width
 * stay a free tuning knob: nothing downstream has to be re-checked when it
 * changes.
 */
export function seatSelectedFrame(width: number, height: number): number {
  return Math.min(width, height) * SELECTED_FRAME;
}

/**
 * @deprecated Renamed to {@link seatSelectedFrame}. The selected mark is a
 * frame around a filled core now, not a stroked ring, so "stroke" no longer
 * describes what the number is for.
 */
export const seatRingStroke = seatSelectedFrame;

/**
 * A person seated in the seat, head toward the front: the non-colour cue for
 * "you have this one", "someone is holding this one" or "someone has this
 * one" — see {@link seatFill}'s note on why colour no longer carries status.
 *
 * Head and torso are two subpaths of one path, so the silhouette is a single
 * node taking a single fill (or, for the held/"in progress" variant, a single
 * stroke). It is drawn *without* the label's counter-rotation, so the
 * occupant leans with the seat and reinforces which way it faces.
 *
 * It clears the tapered body on both axes: the torso spans 0.28–0.72 of the
 * width, well inside the back edge, which even at its narrowest (a 0.12
 * taper) is still 0.12–0.88. The margin is slim at the two hip corners,
 * though, so pass the box the figure is meant to sit *on*: a selected seat
 * draws it to the core's box, not the seat's, or the hips cross the frame.
 *
 * The ratios assume a square box, which is what `map-layout` always
 * places. On a wide box the head, sized from the width, would outgrow the
 * height.
 */
export function seatOccupantPath(x: number, y: number, width: number, height: number): string {
  const cx = r(x + width * 0.5);
  const headY = r(y + height * 0.3);
  const radius = r(width * 0.155);

  // Two 180° arcs, because an SVG circle cannot be a subpath.
  const head =
    `M ${r(cx - radius)} ${headY} ` +
    `a ${radius} ${radius} 0 1 1 ${r(radius * 2)} 0 ` +
    `a ${radius} ${radius} 0 1 1 ${r(-radius * 2)} 0 Z`;

  const shoulderY = r(y + height * 0.5);
  const hipY = r(y + height * 0.86);
  const leftX = r(x + width * 0.28);
  const rightX = r(x + width * 0.72);
  const easeY = r(y + height * 0.58);
  const shoulderIn = width * 0.08;

  const torso =
    `M ${leftX} ${hipY} ` +
    `C ${leftX} ${easeY} ${r(leftX + shoulderIn)} ${shoulderY} ${cx} ${shoulderY} ` +
    `C ${r(rightX - shoulderIn)} ${shoulderY} ${rightX} ${easeY} ${rightX} ${hipY} Z`;

  return `${head} ${torso}`;
}

/** The stroke width for the held variant of {@link seatOccupantPath} — drawn hollow. */
export function seatOccupantStroke(width: number, height: number): number {
  return Math.min(width, height) * OCCUPANT_STROKE;
}

// --- shapes -----------------------------------------------------------------

/** An axis-aligned box in viewBox units. */
export interface SeatBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The outline a seat is drawn with.
 *
 * - `'seat'`: the default tapered outline, {@link seatBodyPath}. The only one
 *   that shows which way a seat faces.
 * - `'square'`: a square with the same slight corners as the seat's front.
 * - `'rounded'`: a square with soft corners.
 * - `'circle'`: a circle filling the box.
 * - `'armchair'`, `'stool'`, `'recliner'`, `'beanbag'`, `'cushion'`,
 *   `'wheelchair-space'`, `'sofa'`, `'bench'`: the outlines the document's
 *   `SeatType.form` of the same name draws (§4.7.1, D17). Like `'seat'`, each
 *   is drawn facing up at `rotation` 0.
 * - A function: given a box, return a closed path `d` inside it. It is called
 *   for the seat's box and again for the selected core's smaller box, so it
 *   must draw relative to the box it is given, not to fixed coordinates.
 */
export type KerusiSeatShape =
  'seat' | 'square' | 'rounded' | 'circle' | KerusiSeatFormShape | ((box: SeatBox) => string);

/** The presets that draw a registered `SeatType.form` (§4.7.1), minus `chair`, which is `'seat'`. */
export type KerusiSeatFormShape =
  'armchair' | 'stool' | 'recliner' | 'beanbag' | 'cushion' | 'wheelchair-space' | 'sofa' | 'bench';

/**
 * The preset a document's `SeatType.form` draws by default (D17). `chair`, an
 * absent form and a form this library does not know all draw today's `'seat'`
 * outline, as §4.7.1 requires of a consumer that does not recognise a form.
 */
export function seatFormShape(form: string | undefined): KerusiSeatShape {
  return form !== undefined && Object.prototype.hasOwnProperty.call(FORM_OUTLINES, form)
    ? (form as KerusiSeatFormShape)
    : 'seat';
}

/** The `'rounded'` preset's corner radius, as a fraction of the short edge. */
const ROUNDED_RADIUS = 0.25;

/** A seat's outline in the given shape; `undefined` means the default `'seat'`. */
export function seatShapePath(
  shape: KerusiSeatShape | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  if (typeof shape === 'function') {
    return shape({ x, y, width, height });
  }
  const edge = Math.min(width, height);
  switch (shape) {
    case 'square':
      return roundedRect(x, y, width, height, edge * FRONT_RADIUS);
    case 'rounded':
      return roundedRect(x, y, width, height, edge * ROUNDED_RADIUS);
    case 'circle':
      return ellipse(x, y, width, height);
    case undefined:
    case 'seat':
      return seatBodyPath(x, y, width, height);
    default:
      return (FORM_OUTLINES[shape] ?? FORM_OUTLINES.armchair)(x, y, width, height);
  }
}

/**
 * Where the wheelchair marker's centre sits, as fractions of the box it is
 * drawn on. The stock corner, (0.82, 0.18), overhangs a circle, so the circle
 * pulls it in along the diagonal; every other preset keeps the stock corner. A
 * function shape gets the stock corner too, so it should leave that corner
 * filled.
 */
export function seatMarkerAnchor(shape: KerusiSeatShape | undefined): { x: number; y: number } {
  return (typeof shape === 'string' && MARKER_ANCHORS[shape]) || STOCK_ANCHOR;
}

const STOCK_ANCHOR = { x: 0.82, y: 0.18 };

/**
 * The presets whose outline overhangs, or leaves empty, the stock corner. Each
 * anchor keeps the marker's dot (radius 0.13 of the box) wholly on the outline.
 */
const MARKER_ANCHORS: Partial<Record<string, { x: number; y: number }>> = {
  circle: { x: 0.75, y: 0.25 },
  armchair: { x: 0.84, y: 0.21 },
  stool: { x: 0.71, y: 0.29 },
  // Below the footrest's shoulder, so the dot does not hang over the notch.
  recliner: { x: 0.82, y: 0.43 },
  beanbag: { x: 0.7, y: 0.26 },
  cushion: { x: 0.8, y: 0.22 },
  // The open space has only a thin rim, so the dot rides the top-right corner.
  'wheelchair-space': { x: 0.84, y: 0.16 },
  sofa: { x: 0.8, y: 0.19 },
  bench: { x: 0.82, y: 0.24 },
};

function roundedRect(x: number, y: number, width: number, height: number, radius: number): string {
  const points: Point[] = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
  return roundedPolygon(points, [radius, radius, radius, radius]);
}

/** An ellipse filling the box: two half arcs, since a circle cannot be a subpath. */
function ellipse(x: number, y: number, width: number, height: number): string {
  const rx = r(width / 2);
  const ry = r(height / 2);
  const cy = r(y + height / 2);
  return (
    `M ${r(x)} ${cy} ` +
    `A ${rx} ${ry} 0 1 1 ${r(x + width)} ${cy} ` +
    `A ${rx} ${ry} 0 1 1 ${r(x)} ${cy} Z`
  );
}

// --- seat forms (§4.7.1, D17, D24) -------------------------------------------
//
// Every form is one closed path inside the seat's square, **facing up** when
// `rotation` is 0, so the seat `<g>`'s own rotation turns it. It is a single
// silhouette on purpose: the held and booked wash, the selected frame and the
// selected core all reuse the outline, scaled about the centre, so one path
// gives every status cue for free. The silhouettes differ by outline alone,
// because at 8 CSS px a seat has no room for detail; status still reads from
// the shape drawn over it, not from colour.

type FormOutline = (x: number, y: number, width: number, height: number) => string;

/**
 * A polygon given in the unit square, scaled to the box. `radius` is a fraction
 * of the short edge, one per corner.
 */
function unitPolygon(
  x: number,
  y: number,
  width: number,
  height: number,
  unit: readonly Point[],
  radius: number | readonly number[],
): string {
  const edge = Math.min(width, height);
  const points = unit.map(([u, v]): Point => [x + u * width, y + v * height]);
  const radii = unit.map((_, i) => (typeof radius === 'number' ? radius : radius[i]) * edge);
  return roundedPolygon(points, radii);
}

const FORM_OUTLINES: Record<KerusiSeatFormShape, FormOutline> = {
  // Arms stand forward on either side of a dipped front: a tub chair from above.
  armchair: (x, y, w, h) =>
    unitPolygon(
      x,
      y,
      w,
      h,
      [
        [0, 0],
        [0.24, 0],
        [0.24, 0.12],
        [0.76, 0.12],
        [0.76, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      [0.12, 0.08, 0.05, 0.05, 0.08, 0.12, 0.18, 0.18],
    ),

  // No back, so no taper: a round top, a little smaller than the seat's box.
  stool: (x, y, w, h) => ellipse(x + w * 0.06, y + h * 0.06, w * 0.88, h * 0.88),

  // A footrest narrower than the body at the front, a tapered back behind it.
  recliner: (x, y, w, h) =>
    unitPolygon(
      x,
      y,
      w,
      h,
      [
        [0.24, 0],
        [0.76, 0],
        [0.76, 0.28],
        [1, 0.28],
        [0.9, 1],
        [0.1, 1],
        [0, 0.28],
        [0.24, 0.28],
      ],
      [0.08, 0.08, 0.05, 0.14, 0.3, 0.3, 0.14, 0.05],
    ),

  // A slumped pear: narrow at the front, heavy and round at the back.
  beanbag: (x, y, w, h) =>
    unitPolygon(
      x,
      y,
      w,
      h,
      [
        [0.22, 0.02],
        [0.78, 0.02],
        [1, 1],
        [0, 1],
      ],
      0.5,
    ),

  // A flat pillow: four pinched corners and edges that bulge between them.
  cushion: (x, y, w, h) => {
    const at = (u: number, v: number) => `${r(x + u * w)} ${r(y + v * h)}`;
    return (
      `M ${at(0.1, 0.1)} Q ${at(0.5, -0.04)} ${at(0.9, 0.1)} ` +
      `Q ${at(1.04, 0.5)} ${at(0.9, 0.9)} ` +
      `Q ${at(0.5, 1.04)} ${at(0.1, 0.9)} ` +
      `Q ${at(-0.04, 0.5)} ${at(0.1, 0.1)} Z`
    );
  },

  // An open space with no chair in it: a rim, and a hole through it. The inner
  // subpath runs the other way round, so the default fill rule leaves it empty.
  'wheelchair-space': (x, y, w, h) => {
    const rim = Math.min(w, h) * 0.2;
    const outer = unitPolygon(
      x,
      y,
      w,
      h,
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      0.14,
    );
    const inner = roundedPolygon(
      [
        [x + rim, y + rim],
        [x + rim, y + h - rim],
        [x + w - rim, y + h - rim],
        [x + w - rim, y + rim],
      ],
      [rim * 0.4, rim * 0.4, rim * 0.4, rim * 0.4],
    );
    return `${outer} ${inner}`;
  },

  // One place on a sofa: a seat cushion between shoulders that stand proud at the back.
  sofa: (x, y, w, h) =>
    unitPolygon(
      x,
      y,
      w,
      h,
      [
        [0.06, 0.02],
        [0.94, 0.02],
        [0.94, 0.62],
        [1, 0.62],
        [1, 1],
        [0, 1],
        [0, 0.62],
        [0.06, 0.62],
      ],
      [0.08, 0.08, 0.04, 0.06, 0.1, 0.1, 0.06, 0.04],
    ),

  // One place on a pew: a low, square-cornered slab, wider than it is deep.
  bench: (x, y, w, h) =>
    unitPolygon(
      x,
      y,
      w,
      h,
      [
        [0, 0.1],
        [1, 0.1],
        [1, 0.9],
        [0, 0.9],
      ],
      0.05,
    ),
};
