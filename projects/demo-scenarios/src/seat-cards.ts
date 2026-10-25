import { formatMoney, RenderSeat, SeatRenderStatus } from '@kerusiweb/core';
import type { KerusiWholeUnitCardContext, WholeUnitDisallowed } from '@kerusiweb/core';

/**
 * What the demos' hover and click cards say about a seat. The library never
 * decides this (D10): a real app would put a booking, a name or a button here.
 * Kept out of either demo so both say the same thing.
 */
export interface SeatCardText {
  /** `Row A, seat 3`, or `Seat S1` when the seat has no row. */
  title: string;
  type: string;
  /** Empty when the seat carries no price. */
  price: string;
  status: string;
}

const STATUS: Record<SeatRenderStatus, string> = {
  available: 'Available',
  booked: 'Booked',
  held: 'On hold',
  blocked: 'Blocked by the venue',
};

export function seatCardText(seat: RenderSeat, locale: string): SeatCardText {
  return {
    title: seat.rowLabel ? `Row ${seat.rowLabel}, seat ${seat.label}` : `Seat ${seat.label}`,
    type: seat.typeLabel,
    price: seat.price ? formatMoney(seat.price, locale) : '',
    status: STATUS[seat.status],
  };
}

/**
 * What the demos' whole-unit card says (D25): the card on an `either` table's
 * top, which books the table whole. The app's own words, as a seat card's are.
 */
export function wholeUnitCardText(
  { unit, group, selected }: Pick<KerusiWholeUnitCardContext, 'unit' | 'group' | 'selected'>,
  locale: string,
): SeatCardText {
  const seats = unit.seatIds.length;
  return {
    title: `${group.label ?? group.id}: the whole ${group.kind}`,
    type: `${seats} ${seats === 1 ? 'seat' : 'seats'}`,
    price: unit.wholePrice ? formatMoney(unit.wholePrice, locale) : '',
    status: selected
      ? 'Booked whole in your selection'
      : unit.selectable
        ? 'Press to book it whole'
        : 'Cannot be booked whole: a seat at it is taken',
  };
}

/** The demos' visible message for a refused whole-unit control (D25). */
export function wholeUnitDisallowedText({ unit, group, reason }: WholeUnitDisallowed): string {
  const name = group.label ?? unit.label ?? group.id;
  switch (reason) {
    case 'unit-unavailable':
      return `${name} — cannot be booked whole: a seat at it is taken`;
    case 'unit-too-large':
    case 'max-selection':
      return `${name} — booking it whole would pass the seat limit`;
    default:
      return `${name} — cannot be booked whole`;
  }
}
