import { Bounds } from '../kerusi/kerusi-map.model.js';
import type {
  PlacedGroup,
  PlacedGroupShape,
  PlacedSeat,
  SectionLabelAnchor,
} from './map-layout.js';
import { RenderGroup, RenderSeat, RenderSection } from './render-model.js';

/**
 * Placement helpers shared by the canonical layout (`computeMapLayout`) and the
 * rows view (`computeRowsLayout`). Internal: not exported from the package.
 */

/** Average glyph advance as a fraction of the font size, for fitting text to a width. */
export const GLYPH_WIDTH = 0.6;

export function placeSeat(
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

/**
 * Places a section's groups over its placed seats, each with the footprint
 * `shapeOf` gives it. Shared with the rows view, which draws no footprints.
 */
export function placeGroups(
  section: RenderSection,
  seats: readonly PlacedSeat[],
  shapeOf: (group: RenderGroup) => PlacedGroupShape | undefined,
): PlacedGroup[] {
  const placedById = new Map(seats.map((placed) => [placed.seat.id, placed]));
  return section.groups.map((group): PlacedGroup => {
    const shape = shapeOf(group);
    const seats = group.seatIds
      .map((id) => placedById.get(id))
      .filter((placed): placed is PlacedSeat => placed !== undefined);
    return {
      group,
      shape,
      seats,
      // A role="group" with no name says nothing, so a group with no label is
      // wrapped only to put its whole-unit control before its seats (D19).
      wrapped: seats.length > 0 && (!!group.label || (!!group.wholeUnit && !!shape)),
    };
  });
}

/** The seats drawn outside any group wrapper, in `seats` order. */
export function looseSeats(
  seats: readonly PlacedSeat[],
  groups: readonly PlacedGroup[],
): PlacedSeat[] {
  const wrapped = new Set(groups.filter((g) => g.wrapped).flatMap((g) => g.seats));
  return seats.filter((placed) => !wrapped.has(placed));
}

/** The label's inset from the bounds' corner and its size, as fractions of the seat size. */
const LABEL_INSET_RATIO = 0.25;
const LABEL_FONT_RATIO = 0.5;

export function labelAnchorOf(bounds: Bounds, seatSize: number, rtl: boolean): SectionLabelAnchor {
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
export function mirrorBounds(bounds: Bounds, canvasWidth: number | undefined): Bounds {
  if (canvasWidth === undefined) {
    return { ...bounds };
  }
  return { ...bounds, x: canvasWidth - bounds.x - bounds.width };
}
