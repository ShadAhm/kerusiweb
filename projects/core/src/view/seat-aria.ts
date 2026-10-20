import { formatMoney } from '../kerusi/kerusi-locale.js';
import { RenderSeat } from '../render/render-model.js';
import { DisallowedReason } from './selection.js';

/**
 * What a screen reader says about a seat.
 *
 * The pre-1.0 renderer drew seats as bare clickable `<g>` elements with no
 * accessible name at all, so everything the document knew about a seat — its
 * type, its price, whether it was even bookable, and every §4.3.4 accessibility
 * property — was invisible to anyone not looking at the picture.
 *
 * Selection state is deliberately absent from the label: it rides on
 * `aria-pressed`, and repeating it here would make every toggle announce twice.
 */

/** Strings a caller may translate. Defaults are English. */
export interface SeatAriaStrings {
  rowSeat: (row: string, seat: string) => string;
  seatOnly: (seat: string) => string;
  /**
   * A seat in a group that has a label (§4.11): "Table 3, seat 4". Says where the
   * seat is in place of its row. Omitted, the English default is used.
   */
  groupSeat?: (group: string, seat: string) => string;
  /** Said when an aisle runs beside the seat (§4.3.5: a skipped `col`). */
  besideAisle: string;
  noPrice: string;
  available: string;
  booked: string;
  held: string;
  heldUntil: (time: string) => string;
  blocked: string;
  wheelchairAccessible: string;
  transferArmrest: (side: string) => string;
  aisleChairCompatible: string;
  companionRequired: string;
  /** How a selection total is announced. */
  selectionSummary: (count: number, total: string) => string;
  selectionEmpty: string;
  disallowed: Record<DisallowedReason, string>;
}

export const DEFAULT_SEAT_ARIA_STRINGS: SeatAriaStrings = {
  rowSeat: (row, seat) => `Row ${row}, seat ${seat}`,
  seatOnly: (seat) => `Seat ${seat}`,
  groupSeat: (group, seat) => `${group}, seat ${seat}`,
  besideAisle: 'next to an aisle',
  noPrice: 'no price',
  available: 'available',
  booked: 'booked, unavailable',
  held: 'on hold, unavailable',
  heldUntil: (time) => `on hold until ${time}, unavailable`,
  blocked: 'blocked by the venue, unavailable',
  wheelchairAccessible: 'wheelchair accessible',
  transferArmrest: (side) => `transfer armrest ${side}`,
  aisleChairCompatible: 'aisle chair compatible',
  companionRequired: 'companion seat required',
  selectionSummary: (count, total) =>
    `${count} ${count === 1 ? 'seat' : 'seats'} selected${total ? `, ${total} total` : ''}`,
  selectionEmpty: 'No seats selected',
  disallowed: {
    booked: 'is already booked',
    held: 'is held by another customer',
    blocked: 'is blocked by the venue',
    'not-selectable': 'cannot be selected',
    'max-selection': 'would exceed the seat limit',
    'companion-unavailable': 'must be booked with a seat that is unavailable',
  },
};

/**
 * Builds a seat's accessible name, in the order a listener needs it: where the
 * seat is, what kind it is, what it costs, whether it can be had, what
 * accessibility it offers, and finally its descriptive tags.
 *
 * "Where" comes from the document's row and adjacency, never from `x`/`y`: an
 * aisle is mentioned when the next seat along the row skips a `col` (§4.3.5),
 * which is also where the arrow keys jump across it.
 */
export function seatAriaLabel(
  seat: RenderSeat,
  locale: string,
  strings: SeatAriaStrings = DEFAULT_SEAT_ARIA_STRINGS,
): string {
  const parts: string[] = [];

  parts.push(seatWhere(seat, strings));
  if (seat.besideAisle) {
    parts.push(strings.besideAisle);
  }

  if (seat.typeLabel && seat.typeLabel !== seat.type.id) {
    parts.push(seat.typeLabel);
  } else if (seat.type.id) {
    parts.push(seat.type.id);
  }

  parts.push(seat.price ? formatMoney(seat.price, locale) : strings.noPrice);
  parts.push(statusPhrase(seat, locale, strings));
  parts.push(...accessibilityPhrases(seat, strings));

  if (seat.attributes.length > 0) {
    parts.push(seat.attributes.join(', '));
  }

  return parts.filter(Boolean).join(', ') + '.';
}

/**
 * Where a seat is: at its group when the group has a label ("Table 3, seat 4"),
 * else in its row, else by its own number. A group names the piece the seat is
 * on, which is a better place to say than a row that may be a ring round a table.
 */
function seatWhere(seat: RenderSeat, strings: SeatAriaStrings): string {
  if (seat.group?.label) {
    const groupSeat = strings.groupSeat ?? DEFAULT_SEAT_ARIA_STRINGS.groupSeat!;
    return groupSeat(seat.group.label, seat.label);
  }
  return seat.rowLabel ? strings.rowSeat(seat.rowLabel, seat.label) : strings.seatOnly(seat.label);
}

function statusPhrase(seat: RenderSeat, locale: string, strings: SeatAriaStrings): string {
  switch (seat.status) {
    case 'booked':
      return strings.booked;
    case 'blocked':
      return strings.blocked;
    case 'held':
      return seat.holdExpires
        ? strings.heldUntil(formatTime(seat.holdExpires, locale))
        : strings.held;
    default:
      return strings.available;
  }
}

/** Every §4.3.4 property the seat declares, as phrases. */
function accessibilityPhrases(seat: RenderSeat, strings: SeatAriaStrings): string[] {
  const a11y = seat.accessibility;
  if (!a11y) {
    return [];
  }

  const phrases: string[] = [];
  if (a11y.wheelchairAccessible) {
    phrases.push(strings.wheelchairAccessible);
  }
  if (a11y.transferArmrest) {
    phrases.push(strings.transferArmrest(a11y.transferArmrest));
  }
  if (a11y.aisleChairCompatible) {
    phrases.push(strings.aisleChairCompatible);
  }
  if (a11y.companionRequired) {
    phrases.push(strings.companionRequired);
  }
  return phrases;
}

/** A hold expiry as a local clock time; falls back to the raw value. */
export function formatTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  try {
    return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(date);
  } catch {
    return date.toISOString();
  }
}

/** The live-region announcement when a seat cannot be selected. */
export function disallowedAnnouncement(
  seat: RenderSeat,
  reason: DisallowedReason,
  strings: SeatAriaStrings = DEFAULT_SEAT_ARIA_STRINGS,
): string {
  return `${seatWhere(seat, strings)} ${strings.disallowed[reason]}.`;
}
