import { formatMoney, RenderSeat, SeatRenderStatus } from '@kerusiweb/core';

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
