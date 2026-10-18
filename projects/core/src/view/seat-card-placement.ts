import type { SeatCardPlacement, SeatCardSide } from './seat-card.js';

/**
 * Where a seat card goes: the arithmetic only.
 *
 * A binding measures three boxes in CSS pixels, all in the same coordinate
 * space (the map root's, in practice), and hands them in. Because the seat's box
 * is its on-screen one, zoom, pan and rotation are already in it: a rotated
 * seat is its bounding box, a zoomed one is as large as it is drawn.
 */

export interface CardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CardSize {
  width: number;
  height: number;
}

export interface SeatCardPlacementInput {
  /** The seat's on-screen box. */
  seat: CardRect;
  /** The card's own size, borders included. */
  card: CardSize;
  /** The box the card must stay inside: the map's root. */
  container: CardRect;
  /** The side to try first. Default `top`. */
  placement?: SeatCardPlacement;
  /** Space left between the seat and the card, for the arrow. Default `8`. */
  offset?: number;
  /**
   * How far in from a card's corner the arrow keeps, so it never sits on the
   * rounded part. Default `12`.
   */
  arrowInset?: number;
}

export interface SeatCardPosition {
  /** The side of the seat the card ended up on, after any flip. */
  side: SeatCardSide;
  /** The card's top-left corner, in the same space as the inputs. */
  x: number;
  y: number;
  /**
   * Where the arrow sits along the card's edge that faces the seat: measured
   * from the card's left edge for `top` and `bottom`, from its top edge for
   * `left` and `right`. Points at the seat's centre, kept off the corners.
   */
  arrowOffset: number;
}

const OPPOSITE: Record<SeatCardSide, SeatCardSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

/** What `auto` tries, in order, when sides tie. */
const AUTO_ORDER: readonly SeatCardSide[] = ['top', 'bottom', 'right', 'left'];

/**
 * Places a card against a seat.
 *
 * The card sits on the preferred side. If it would not fit there but would fit
 * on the opposite side, it flips. `auto` takes the side with the most room.
 * Either way the card is then clamped inside the container along the other
 * axis, and, when no side fits at all, along both. A card larger than the
 * container is pinned to its top-left.
 */
export function placeSeatCard(input: SeatCardPlacementInput): SeatCardPosition {
  const { seat, card, container } = input;
  const offset = input.offset ?? 8;
  const inset = input.arrowInset ?? 12;
  const preferred = input.placement ?? 'top';

  const side = chooseSide(preferred, input, offset);
  const cx = seat.x + seat.width / 2;
  const cy = seat.y + seat.height / 2;

  let x: number;
  let y: number;
  switch (side) {
    case 'top':
      x = cx - card.width / 2;
      y = seat.y - offset - card.height;
      break;
    case 'bottom':
      x = cx - card.width / 2;
      y = seat.y + seat.height + offset;
      break;
    case 'left':
      x = seat.x - offset - card.width;
      y = cy - card.height / 2;
      break;
    case 'right':
      x = seat.x + seat.width + offset;
      y = cy - card.height / 2;
      break;
  }

  x = clamp(x, container.x, container.x + container.width - card.width);
  y = clamp(y, container.y, container.y + container.height - card.height);

  const vertical = side === 'top' || side === 'bottom';
  const along = vertical ? cx - x : cy - y;
  const extent = vertical ? card.width : card.height;

  return { side, x, y, arrowOffset: clamp(along, Math.min(inset, extent / 2), extent - inset) };
}

/** Room on one side of the seat, inside the container. */
function room(side: SeatCardSide, input: SeatCardPlacementInput): number {
  const { seat, container } = input;
  switch (side) {
    case 'top':
      return seat.y - container.y;
    case 'bottom':
      return container.y + container.height - (seat.y + seat.height);
    case 'left':
      return seat.x - container.x;
    case 'right':
      return container.x + container.width - (seat.x + seat.width);
  }
}

function fits(side: SeatCardSide, input: SeatCardPlacementInput, offset: number): boolean {
  const needed =
    side === 'top' || side === 'bottom' ? input.card.height + offset : input.card.width + offset;
  return room(side, input) >= needed;
}

function chooseSide(
  preferred: SeatCardPlacement,
  input: SeatCardPlacementInput,
  offset: number,
): SeatCardSide {
  if (preferred === 'auto') {
    const fitting = AUTO_ORDER.find((side) => fits(side, input, offset));
    if (fitting) {
      return fitting;
    }
    // Nothing fits whole: take the side with the most room.
    return AUTO_ORDER.reduce((best, side) => (room(side, input) > room(best, input) ? side : best));
  }
  if (fits(preferred, input, offset)) {
    return preferred;
  }
  const opposite = OPPOSITE[preferred];
  if (fits(opposite, input, offset)) {
    return opposite;
  }
  // Neither side fits: stay with whichever has more room, preferring the asked-for one.
  return room(opposite, input) > room(preferred, input) ? opposite : preferred;
}

/** `min` wins when the range is inverted, which pins an oversized card to the top-left. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
