import { PlacedGroupShape } from './map-layout.js';

/**
 * The outline and detail of a group's footprint (§4.11): a tabletop, a sofa, a
 * pew, drawn under the seats that sit at it.
 *
 * The document gives a group only a `rect` or a `circle`; what is drawn inside
 * it (wood, upholstery, a cloth) is a rendering decision, as it is for an
 * element (D18). Every look here is built from the footprint alone, so it fits
 * whatever size the document chose, and it is built facing the way a seat does:
 * **the front is the top edge** when a `rect`'s `rotation` is 0, so a sofa's back
 * is its bottom edge and the footprint's own rotation turns it.
 *
 * Kept next to `seat-shapes` because the ratios below are the whole design.
 */

/** A footprint ready to draw. Paths are in canvas units; a turned `rect` carries its `transform`. */
export interface GroupFootprint {
  /** The footprint itself, as the document gives it, with soft corners. */
  body: string;
  /**
   * Marks drawn on the body in the detail colour: a tablecloth's edge, a sofa's
   * back and arms. Empty for a kind with no look of its own, which is drawn as
   * its plain body.
   */
  details: readonly string[];
  /** `rotate(deg cx cy)` for a turned `rect`; `null` for a `circle` or an unturned `rect`. */
  transform: string | null;
}

/** Rounds a coordinate for the `d` attribute; see `seat-shapes`. */
function r(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** A rectangle with every corner rounded to `radius`, clamped to half the short side. */
function rrect(x: number, y: number, w: number, h: number, radius: number): string {
  const k = Math.max(0, Math.min(radius, w / 2, h / 2));
  const [x1, y1] = [x + w, y + h];
  if (k === 0) {
    return `M ${r(x)} ${r(y)} L ${r(x1)} ${r(y)} L ${r(x1)} ${r(y1)} L ${r(x)} ${r(y1)} Z`;
  }
  const arc = `A ${r(k)} ${r(k)} 0 0 1`;
  return (
    `M ${r(x + k)} ${r(y)} L ${r(x1 - k)} ${r(y)} ${arc} ${r(x1)} ${r(y + k)} ` +
    `L ${r(x1)} ${r(y1 - k)} ${arc} ${r(x1 - k)} ${r(y1)} ` +
    `L ${r(x + k)} ${r(y1)} ${arc} ${r(x)} ${r(y1 - k)} ` +
    `L ${r(x)} ${r(y + k)} ${arc} ${r(x + k)} ${r(y)} Z`
  );
}

/** A circle: two half arcs, since an SVG circle cannot be a subpath. */
function disc(cx: number, cy: number, radius: number): string {
  return (
    `M ${r(cx - radius)} ${r(cy)} ` +
    `A ${r(radius)} ${r(radius)} 0 1 1 ${r(cx + radius)} ${r(cy)} ` +
    `A ${r(radius)} ${r(radius)} 0 1 1 ${r(cx - radius)} ${r(cy)} Z`
  );
}

/** How far a tablecloth's edge is inset, as a fraction of the short side. */
const CLOTH_INSET = 0.12;
/** The soft corner of a rectangular footprint, as a fraction of the short side. */
const CORNER = 0.1;

/**
 * The footprint for a group of `kind` drawn on `shape`.
 *
 * `table`, `sofa`, `loveseat`, `pew`, `bench` and `booth` have a look of their
 * own on a `rect`, and `table` on a `circle`. Any other kind, `box` and
 * `companion` included, and a kind this library does not know, is drawn as its
 * plain body (§4.11: a consumer that does not know a kind draws the shape
 * plainly).
 */
export function groupFootprint(kind: string, shape: PlacedGroupShape): GroupFootprint {
  if (shape.kind === 'circle') {
    const { centerX: cx, centerY: cy, radius } = shape;
    return {
      body: disc(cx, cy, radius),
      details: kind === 'table' ? [disc(cx, cy, radius * (1 - CLOTH_INSET * 1.6))] : [],
      transform: null,
    };
  }

  const { x, y, width: w, height: h } = shape;
  const edge = Math.min(w, h);
  return {
    body: rrect(x, y, w, h, edge * CORNER),
    details: rectDetails(kind, x, y, w, h, edge),
    transform: shape.rotation
      ? `rotate(${r(shape.rotation)} ${r(shape.centerX)} ${r(shape.centerY)})`
      : null,
  };
}

function rectDetails(
  kind: string,
  x: number,
  y: number,
  w: number,
  h: number,
  edge: number,
): string[] {
  const inset = edge * CLOTH_INSET;
  switch (kind) {
    case 'table':
      // A cloth: the tabletop's inner panel.
      return [rrect(x + inset, y + inset, w - inset * 2, h - inset * 2, inset * 0.6)];

    case 'sofa':
    case 'loveseat': {
      // A back along the rear (bottom) edge, and an arm at each end.
      const back = h * 0.26;
      const arm = w * (kind === 'sofa' ? 0.08 : 0.12);
      const parts = [
        rrect(x, y + h - back, w, back, edge * CORNER),
        rrect(x, y, arm, h - back * 0.5, edge * CORNER),
        rrect(x + w - arm, y, arm, h - back * 0.5, edge * CORNER),
      ];
      if (kind === 'loveseat') {
        // The seam between its two places.
        parts.push(rrect(x + w / 2 - w * 0.012, y + arm, w * 0.024, h - back - arm, 0));
      }
      return parts;
    }

    case 'pew': {
      // A back rail, and an end panel at each side.
      const rail = h * 0.2;
      const end = w * 0.045;
      return [
        rrect(x, y + h - rail, w, rail, edge * 0.05),
        rrect(x, y, end, h, edge * 0.05),
        rrect(x + w - end, y, end, h, edge * 0.05),
      ];
    }

    case 'bench': {
      // Slats across the seat.
      const slat = h * 0.16;
      return [0.18, 0.42, 0.66].map((at) =>
        rrect(x + w * 0.05, y + h * at, w * 0.9, slat, slat * 0.3),
      );
    }

    case 'booth': {
      // Seating on three sides round a table, open at the front (top).
      const back = h * 0.24;
      const side = Math.min(w * 0.18, h * 0.3);
      return [
        rrect(x, y + h - back, w, back, edge * CORNER),
        rrect(x, y, side, h - back * 0.5, edge * CORNER),
        rrect(x + w - side, y, side, h - back * 0.5, edge * CORNER),
      ];
    }

    default:
      return [];
  }
}
