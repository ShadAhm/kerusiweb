import { BookingLevelKind } from '../kerusi/kerusi-booking.js';
import { formatMoney } from '../kerusi/kerusi-locale.js';
import { RenderBookingUnit, RenderSeat } from '../render/render-model.js';
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
  /**
   * A seat booked only with others (§4.12.2): "booked with 7 other seats at
   * Table 3". `unit` is the level's label, when it has one. Omitted, the English
   * default is used.
   */
  bookedWith?: (others: number, unit: string | undefined, level: BookingLevelKind) => string;
  /**
   * The price of a seat's booking unit when the level has a whole price
   * (§4.9.1), said in place of the seat's own: "MYR 180.00 for all 8 seats".
   */
  unitPrice?: (price: string, seats: number) => string;
  /** An available seat whose booking unit cannot be booked, because another seat in it is taken. */
  unitUnavailable?: string;
  /**
   * The accessible name of a whole unit's control, an `either` table's shape
   * (D19): "Table 3, book the whole table, 8 seats, MYR 180.00". `kind` is
   * `Group.kind`; `price` is the app's `wholeUnitPrice`, else the whole price
   * (§4.9.1), when there is one (D25).
   */
  wholeUnit?: (
    label: string | undefined,
    kind: string | undefined,
    seats: number,
    price?: string,
  ) => string;
  /**
   * Why a whole unit cannot be booked, after its name: "Table 3 cannot be booked
   * whole: a seat at it is unavailable." Also the disabled control's description.
   */
  wholeUnitDisallowed?: Partial<Record<DisallowedReason, string>>;
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
  bookedWith: (others, unit, level) =>
    `booked with ${others} other ${others === 1 ? 'seat' : 'seats'}` +
    (unit ? `${level === 'group' ? ' at' : ' in'} ${unit}` : ''),
  unitPrice: (price, seats) => `${price} for ${seats === 2 ? 'both' : `all ${seats}`} seats`,
  unitUnavailable: 'unavailable, booked together with a seat that is taken',
  wholeUnit: (label, kind, seats, price) =>
    [label, `book the whole ${unitNoun(kind)}`, `${seats} ${seats === 1 ? 'seat' : 'seats'}`, price]
      .filter(Boolean)
      .join(', '),
  wholeUnitDisallowed: {
    'unit-unavailable': 'cannot be booked whole: a seat in it is unavailable',
    'unit-too-large': 'has more seats than the seat limit allows',
    'max-selection': 'would exceed the seat limit',
  },
  selectionSummary: (count, total) =>
    `${count} ${count === 1 ? 'seat' : 'seats'} selected${total ? `, ${total} total` : ''}`,
  selectionEmpty: 'No seats selected',
  disallowed: {
    booked: 'is already booked',
    held: 'is held by another customer',
    blocked: 'is blocked by the venue',
    'not-selectable': 'cannot be selected',
    'max-selection': 'would exceed the seat limit',
    'unit-unavailable': 'must be booked with a seat that is unavailable',
    'unit-too-large': 'is booked with more seats than the seat limit allows',
  },
};

/** What to call a group's piece in "book the whole …": the registered kinds, else "group". */
function unitNoun(kind: string | undefined): string {
  switch (kind) {
    case 'table':
    case 'sofa':
    case 'pew':
    case 'bench':
    case 'booth':
    case 'box':
      return kind;
    case 'loveseat':
      return 'love seat';
    default:
      return 'group';
  }
}

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

  parts.push(pricePhrase(seat, locale, strings));
  parts.push(statusPhrase(seat, locale, strings));
  parts.push(...unitPhrases(seat, strings));
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

/**
 * A seat's price, or its booking unit's whole price when the level has one: a
 * seat that can only be had with its table costs the table's price, and
 * announcing its own would mislead (§4.9.1).
 */
function pricePhrase(seat: RenderSeat, locale: string, strings: SeatAriaStrings): string {
  const unit = seat.unit;
  if (unit.seatIds.length > 1 && unit.wholePrice) {
    const unitPrice = strings.unitPrice ?? DEFAULT_SEAT_ARIA_STRINGS.unitPrice!;
    return unitPrice(formatMoney(unit.wholePrice, locale), unit.seatIds.length);
  }
  return seat.price ? formatMoney(seat.price, locale) : strings.noPrice;
}

/** "booked with 7 other seats at Table 3", for a seat in a booking unit of more than one. */
function unitPhrases(seat: RenderSeat, strings: SeatAriaStrings): string[] {
  const unit = seat.unit;
  if (unit.seatIds.length < 2 || unit.level === 'seat') {
    return [];
  }
  const bookedWith = strings.bookedWith ?? DEFAULT_SEAT_ARIA_STRINGS.bookedWith!;
  return [bookedWith(unit.seatIds.length - 1, unit.label, unit.level)];
}

function statusPhrase(seat: RenderSeat, locale: string, strings: SeatAriaStrings): string {
  if (seat.status === 'available' && seat.unitBlocked) {
    return strings.unitUnavailable ?? DEFAULT_SEAT_ARIA_STRINGS.unitUnavailable!;
  }
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

/**
 * The accessible name of a whole unit's control (D19): "Table 3, book the whole
 * table, 8 seats, MYR 180.00". Its availability rides on `aria-disabled`, and
 * whether it is booked on `aria-pressed`. The price is `wholeUnitPrice`'s when it
 * gives one, else the map's `wholePrice` (D25).
 */
export function wholeUnitAriaLabel(
  unit: RenderBookingUnit,
  locale: string,
  strings: SeatAriaStrings = DEFAULT_SEAT_ARIA_STRINGS,
  wholeUnitPrice?: WholeUnitPriceFn,
): string {
  const label = strings.wholeUnit ?? DEFAULT_SEAT_ARIA_STRINGS.wholeUnit!;
  const price =
    wholeUnitPrice?.(unit) ?? (unit.wholePrice ? formatMoney(unit.wholePrice, locale) : undefined);
  return label(unit.label, unit.kind, unit.seatIds.length, price);
}

/**
 * The price an app works out for a whole unit, already formatted: "EUR 800.00".
 * It is said in the control's name in place of the map's `wholePrice`, so an app
 * that prices per event on its own server need not write prices into the map it
 * renders (D25). `undefined` falls back to the map's `wholePrice`.
 */
export type WholeUnitPriceFn = (unit: RenderBookingUnit) => string | undefined;

/**
 * Why a whole unit cannot be booked, as a sentence: "Table 3 cannot be booked
 * whole: a seat in it is unavailable." The live-region announcement when its
 * control is refused, and the disabled control's description.
 */
export function wholeUnitDisallowedAnnouncement(
  unit: RenderBookingUnit,
  reason: DisallowedReason,
  strings: SeatAriaStrings = DEFAULT_SEAT_ARIA_STRINGS,
): string {
  const phrase =
    strings.wholeUnitDisallowed?.[reason] ??
    DEFAULT_SEAT_ARIA_STRINGS.wholeUnitDisallowed?.[reason] ??
    strings.disallowed[reason];
  const name = unit.label ?? `The whole ${unitNoun(unit.kind)}`;
  return `${name} ${phrase}.`;
}

/** The live-region announcement when a seat cannot be selected. */
export function disallowedAnnouncement(
  seat: RenderSeat,
  reason: DisallowedReason,
  strings: SeatAriaStrings = DEFAULT_SEAT_ARIA_STRINGS,
): string {
  return `${seatWhere(seat, strings)} ${strings.disallowed[reason]}.`;
}
