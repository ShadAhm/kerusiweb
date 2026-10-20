import { Bounds } from '../kerusi/kerusi-map.model.js';
import { elementStyle } from './element-shapes.js';
import {
  RenderElement,
  RenderGroup,
  RenderMap,
  RenderSeat,
  RenderSection,
} from './render-model.js';

/**
 * Map geometry: turning a `RenderMap` into placed rectangles on its canvas.
 *
 * Kerusi rev 15 puts every section on one canvas (§4.5) and fixes every seat's
 * centre, size and rotation in canvas units, so placing is copying: a seat's
 * top-left corner is its `x`/`y` less half its size. There are no cells, no row
 * pitch and no percentages here, and nothing reads `row`, `col`, a row's index
 * or a row shape to decide where to draw.
 *
 * The one transform allowed is the whole-canvas mirror for right-to-left
 * locales (§2, §4.5): `x' = canvas.width − x`, with every rotation negated.
 * Mirroring each section or row on its own would move things relative to each
 * other, which §4.5 forbids.
 *
 * The result is in canvas units; a binding hands `width`/`height` to the SVG as
 * its `viewBox` and lets CSS pick the scale.
 */

export interface PlacedSeat {
  seat: RenderSeat;
  /** Top-left corner, in canvas units, before rotation. */
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  fontSize: number;
  /** Degrees about the seat centre, clockwise on screen; negated when mirrored. */
  rotation: number;
}

export interface PlacedElement {
  element: RenderElement;
  /** Top-left corner, in canvas units, before rotation. */
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  fontSize: number;
  /** Degrees about the element centre, clockwise on screen; negated when mirrored. */
  rotation: number;
}

/**
 * A group's footprint as drawn (§4.11), mirrored with the canvas in RTL. A
 * `rect` is placed as an element is: `x`/`y` its top-left before rotation,
 * turned about its centre. A `circle` is its centre and radius.
 */
export type PlacedGroupShape =
  | {
      kind: 'rect';
      x: number;
      y: number;
      width: number;
      height: number;
      centerX: number;
      centerY: number;
      /** Degrees about the centre, clockwise on screen; negated when mirrored. */
      rotation: number;
    }
  | { kind: 'circle'; centerX: number; centerY: number; radius: number };

/** A group with its footprint and the seats placed on it. */
export interface PlacedGroup {
  group: RenderGroup;
  /** Absent when the document gives the group no (well-formed) shape. */
  shape?: PlacedGroupShape;
  /**
   * The group's seats in the order its `Group.seats` lists them: the order a
   * screen reader meets them in, so a table's seat 1 comes before its seat 2.
   */
  seats: readonly PlacedSeat[];
}

/** One section's placed seats, elements and groups. */
export interface PlacedSection {
  section: RenderSection;
  /** Every seat in the section, in row-then-position order (the order of the render model). */
  seats: readonly PlacedSeat[];
  elements: readonly PlacedElement[];
  /** Every group, in document order. A group's footprint is drawn under all the seats. */
  groups: readonly PlacedGroup[];
  /**
   * The seats a binding draws outside any group wrapper, in `seats` order: those
   * in no group, and those in a group with no label (a `role="group"` with no
   * name says nothing). The rest are drawn inside their group's wrapper.
   */
  loose: readonly PlacedSeat[];
  /**
   * `RenderSection.bounds` as drawn: mirrored with everything else in RTL, so
   * a binding can zoom to it or put a label at its top-left as is.
   */
  bounds: Bounds;
  /**
   * Where a section label goes when one is drawn (D5), sized from the section's
   * seat size: just above the leading top corner of `bounds`, clear of the
   * seats that sit inside them, or inset inside that corner when the canvas
   * has no room above. `y` is the top of the text. Draw it with
   * `text-anchor="start"` and `dominant-baseline="hanging"`; in RTL the anchor
   * is at the top-right, and the inherited `direction` runs the text leftward
   * from it, so it stays readable.
   */
  labelAnchor: SectionLabelAnchor;
}

export interface SectionLabelAnchor {
  x: number;
  y: number;
  fontSize: number;
}

export interface MapLayout {
  /** The canvas width: the `viewBox` width. */
  width: number;
  /** The canvas height: the `viewBox` height. */
  height: number;
  /** Every section in the render model, in its order. */
  sections: readonly PlacedSection[];
}

export interface MapLayoutOptions {
  /** Mirrors the whole canvas horizontally, for right-to-left locales (D3). */
  rtl?: boolean;
}

/**
 * Places every seat and element of a map on its canvas.
 *
 * The canvas never shrinks to fit what is drawn: a section left out of the
 * render model, or hidden by a binding, leaves its space empty, because closing
 * the gap would move the sections around it.
 */
export function computeMapLayout(map: RenderMap, options: MapLayoutOptions = {}): MapLayout {
  const { width, height } = map.canvas;
  const mirror = options.rtl ? (x: number) => width - x : (x: number) => x;
  const turn = (rotation: number | undefined) =>
    (options.rtl ? -(rotation ?? 0) : (rotation ?? 0)) + 0;

  const sections = map.sections.map((section): PlacedSection => {
    const bounds = mirrorBounds(section.bounds, options.rtl ? width : undefined);
    const seats = section.seats.map((seat) =>
      placeSeat(seat, mirror(seat.x), seat.y, turn(seat.rotation)),
    );
    const placedById = new Map(seats.map((placed) => [placed.seat.id, placed]));
    const groups = section.groups.map((group) => ({
      group,
      shape: placeGroupShape(group, mirror, turn),
      seats: group.seatIds
        .map((id) => placedById.get(id))
        .filter((placed): placed is PlacedSeat => placed !== undefined),
    }));
    const wrapped = new Set(groups.filter((g) => g.group.label).flatMap((g) => g.seats));
    return {
      section,
      seats,
      groups,
      loose: seats.filter((placed) => !wrapped.has(placed)),
      elements: section.elements.map((element) =>
        placeElement(
          element,
          mirror(element.x),
          element.y,
          turn(element.rotation),
          section.seatSize,
        ),
      ),
      bounds,
      labelAnchor: labelAnchorOf(bounds, section.seatSize, !!options.rtl),
    };
  });

  return { width, height, sections };
}

function placeGroupShape(
  group: RenderGroup,
  mirror: (x: number) => number,
  turn: (rotation: number | undefined) => number,
): PlacedGroupShape | undefined {
  const shape = group.shape;
  if (!shape) {
    return undefined;
  }
  const centerX = mirror(shape.x);
  if (shape.kind === 'circle') {
    return { kind: 'circle', centerX, centerY: shape.y, radius: shape.radius };
  }
  return {
    kind: 'rect',
    x: centerX - shape.width / 2,
    y: shape.y - shape.height / 2,
    width: shape.width,
    height: shape.height,
    centerX,
    centerY: shape.y,
    rotation: turn(shape.rotation),
  };
}

function placeSeat(
  seat: RenderSeat,
  centerX: number,
  centerY: number,
  rotation: number,
): PlacedSeat {
  const size = seat.size;
  return {
    seat,
    x: centerX - size / 2,
    y: centerY - size / 2,
    width: size,
    height: size,
    centerX,
    centerY,
    fontSize: size * 0.4,
    rotation,
  };
}

function placeElement(
  element: RenderElement,
  centerX: number,
  centerY: number,
  rotation: number,
  seatSize: number,
): PlacedElement {
  const { width, height } = element;
  return {
    element,
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
    centerX,
    centerY,
    fontSize: elementFontSize(element, width, height, seatSize),
    rotation,
  };
}

/** The label's inset from the bounds' corner and its size, as fractions of the seat size. */
const LABEL_INSET_RATIO = 0.25;
const LABEL_FONT_RATIO = 0.5;

function labelAnchorOf(bounds: Bounds, seatSize: number, rtl: boolean): SectionLabelAnchor {
  const inset = seatSize * LABEL_INSET_RATIO;
  const fontSize = seatSize * LABEL_FONT_RATIO;
  const above = bounds.y - inset - fontSize;
  const edge = above >= 0 ? 0 : inset;
  return {
    x: rtl ? bounds.x + bounds.width - edge : bounds.x + edge,
    y: above >= 0 ? above : bounds.y + inset,
    fontSize,
  };
}

/** A box, mirrored about a canvas of width `canvasWidth` when one is given. */
function mirrorBounds(bounds: Bounds, canvasWidth: number | undefined): Bounds {
  if (canvasWidth === undefined) {
    return { ...bounds };
  }
  return { ...bounds, x: canvasWidth - bounds.x - bounds.width };
}

/** Average glyph advance as a fraction of the font size, for fitting text to a width. */
const GLYPH_WIDTH = 0.6;

/**
 * The smallest element font, as a fraction of the section's seat size. Canvas
 * units are abstract, so a floor in units would be huge on one map and
 * invisible on another; the seat size is the one length every map has.
 */
const MIN_FONT_RATIO = 0.2;

function elementFontSize(
  element: RenderElement,
  width: number,
  height: number,
  seatSize: number,
): number {
  const floor = seatSize * MIN_FONT_RATIO;
  if (elementStyle(element.kind).shape !== 'text') {
    return Math.max(Math.min(height * 0.5, width * 0.18), floor);
  }
  // A text element has no box to read from, so the height sets the size and the
  // width only shrinks it, so the whole label fits however long it is.
  const base = Math.max(height * 0.6, floor);
  const length = element.label?.length ?? 0;
  return length ? Math.min(base, width / (length * GLYPH_WIDTH)) : base;
}
