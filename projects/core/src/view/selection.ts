import { Money } from '../kerusi/kerusi-map.model.js';
import { priceSelection, WholeCharge } from '../kerusi/kerusi-booking.js';
import { RenderBookingUnit, RenderGroup, RenderMap, RenderSeat } from '../render/render-model.js';

/**
 * Seat selection, as a pure reducer over a set of seat ids.
 *
 * The pre-1.0 component mutated `SeatNode.selected` in place, which forced
 * every caller to re-set its rows signal after each click just to make change
 * detection notice. Here the selection is a plain `readonly string[]` the
 * component owns as a `model()`, and this module never touches a `RenderSeat`.
 * It stays a list of seat ids when whole tables and rooms are booked (D20).
 */

/** Why a seat, or a whole unit, could not be picked. */
export type DisallowedReason =
  /** The seat is sold. */
  | 'booked'
  /** Someone else has it mid-checkout. */
  | 'held'
  /** The venue withheld it. */
  | 'blocked'
  /** Selectable statuses or the caller's predicate excluded it. */
  | 'not-selectable'
  /** Taking it would exceed `maxSelection`. */
  | 'max-selection'
  /** A seat it must be booked with is unavailable (§4.12.3). */
  | 'unit-unavailable'
  /** Its booking unit alone holds more seats than `maxSelection` allows (D21). */
  | 'unit-too-large';

/**
 * What `onWholeUnitDisallowed` / `wholeUnitDisallowed` reports (D25): a whole
 * unit's control was pressed, by a click, Enter or Space, and refused.
 */
export interface WholeUnitDisallowed {
  /** The group as one booking. */
  unit: RenderBookingUnit;
  /** The group whose shape is the control. */
  group: RenderGroup;
  /** `unit-unavailable`, `unit-too-large` or `max-selection`. */
  reason: DisallowedReason;
}

export type SelectionOutcomeKind = 'select' | 'deselect' | 'disallowed';

export interface SelectionOutcome {
  kind: SelectionOutcomeKind;
  /** The selection after the attempt — unchanged when disallowed. */
  selection: readonly string[];
  /** Set when `kind` is `"disallowed"`. */
  reason?: DisallowedReason;
  /**
   * Every seat whose membership changed, including the rest of a booking unit
   * pulled in or dropped alongside the seat that was clicked.
   */
  changed: readonly string[];
}

export interface SelectionContext {
  seatsById: ReadonlyMap<string, RenderSeat>;
  /** Cap on how many seats may be selected at once. A whole table counts its seats (D21). */
  maxSelection?: number;
}

/**
 * Toggles a seat, returning the resulting selection.
 *
 * The unit of selection is the seat's **booking unit** (§4.12.2), `seat.unit`:
 * a love seat booked `whole` is picked and dropped as a pair, `maxSelection`
 * counts both seats, and a pair whose other half is sold cannot be picked at
 * all. Under `unitMode: 'seats'` the render model makes every seat its own unit,
 * so this toggles the seat alone.
 *
 * A selection that splits a unit (a controlled `selection` the app set) is
 * mended on the next tap: tapping a selected seat drops every selected seat of
 * its unit, and tapping an unselected one adds the rest of its unit.
 */
export function toggleSeatSelection(
  selection: readonly string[],
  seatId: string,
  ctx: SelectionContext,
): SelectionOutcome {
  const seat = ctx.seatsById.get(seatId);
  const unchanged: SelectionOutcome = { kind: 'disallowed', selection, changed: [] };

  if (!seat) {
    return { ...unchanged, reason: 'not-selectable' };
  }

  const current = new Set(selection);
  const unit = seat.unit?.seatIds ?? [seat.id];

  // Deselecting never needs permission — drop the whole unit.
  if (current.has(seat.id)) {
    return deselect(selection, unit, current);
  }

  if (!seat.selectable) {
    return { ...unchanged, reason: reasonFor(seat) };
  }

  // Every seat in the unit must be takeable, or none of them is.
  const blocked = unit.some(
    (id) => id !== seat.id && !current.has(id) && !pickable(id, ctx, seat.unit?.selectable),
  );
  if (blocked) {
    return { ...unchanged, reason: 'unit-unavailable' };
  }

  return select(selection, unit, current, ctx);
}

/**
 * Toggles a whole unit (§4.12.2): an `either` table booked whole from its
 * tabletop, or a room the app offers with its own button (D19).
 *
 * When every seat of the unit is selected it deselects them all; otherwise it
 * adds the ones missing. Refused, with `unit-unavailable`, while any seat it
 * would add cannot be picked (§4.12.3), and with `unit-too-large` or
 * `max-selection` when it would pass `maxSelection` (D21).
 */
export function toggleWholeUnit(
  selection: readonly string[],
  unit: Pick<RenderBookingUnit, 'seatIds'> & Partial<Pick<RenderBookingUnit, 'selectable'>>,
  ctx: SelectionContext,
): SelectionOutcome {
  const current = new Set(selection);
  if (unit.seatIds.length > 0 && unit.seatIds.every((id) => current.has(id))) {
    return deselect(selection, unit.seatIds, current);
  }
  if (unit.seatIds.some((id) => !current.has(id) && !pickable(id, ctx, unit.selectable))) {
    return { kind: 'disallowed', selection, changed: [], reason: 'unit-unavailable' };
  }
  return select(selection, unit.seatIds, current, ctx);
}

function deselect(
  selection: readonly string[],
  unit: readonly string[],
  current: ReadonlySet<string>,
): SelectionOutcome {
  const dropped = new Set(unit);
  return {
    kind: 'deselect',
    selection: selection.filter((id) => !dropped.has(id)),
    changed: unit.filter((id) => current.has(id)),
  };
}

function select(
  selection: readonly string[],
  unit: readonly string[],
  current: ReadonlySet<string>,
  ctx: SelectionContext,
): SelectionOutcome {
  const unchanged: SelectionOutcome = { kind: 'disallowed', selection, changed: [] };
  const additions = unit.filter((id) => !current.has(id));
  if (ctx.maxSelection !== undefined) {
    // A table of eight under a limit of six can never be had, whatever else is
    // selected: say so, rather than suggest dropping a seat would help (D21).
    if (unit.length > 1 && unit.length > ctx.maxSelection) {
      return { ...unchanged, reason: 'unit-too-large' };
    }
    if (current.size + additions.length > ctx.maxSelection) {
      return { ...unchanged, reason: 'max-selection' };
    }
  }
  return {
    kind: 'select',
    selection: [...selection, ...additions],
    changed: additions,
  };
}

/**
 * Whether a seat may be picked by its own rules. A seat in a section not drawn
 * has no `RenderSeat` to ask, so it is taken as its unit says: the render model
 * read the state for it.
 */
function pickable(id: string, ctx: SelectionContext, unitSelectable = false): boolean {
  return ctx.seatsById.get(id)?.selectable ?? unitSelectable;
}

/**
 * Whether a seat can be picked now: by its own rules, and with every other seat
 * of its booking unit (§4.12.3). A renderer shows a seat that cannot as
 * unavailable (`aria-disabled`, `kerusi-seat--unselectable`), so the other half
 * of a sold love seat does not look free.
 */
export function canPickSeat(seat: Pick<RenderSeat, 'selectable' | 'unitBlocked'>): boolean {
  return seat.selectable && !seat.unitBlocked;
}

/** The reason an unselectable seat gives, preferring its availability status. */
function reasonFor(seat: RenderSeat): DisallowedReason {
  switch (seat.status) {
    case 'booked':
    case 'held':
    case 'blocked':
      return seat.status;
    default:
      return 'not-selectable';
  }
}

/**
 * The whole units fully selected (D20): every seat of each is in the selection.
 * What a change event reports, so an app can say "Table 3 (whole table)".
 */
export function selectedWholeUnits(
  map: Pick<RenderMap, 'wholeUnits'>,
  selection: readonly string[],
): readonly RenderBookingUnit[] {
  if (selection.length === 0) {
    return [];
  }
  const selected = new Set(selection);
  return map.wholeUnits.filter(
    (unit) => unit.seatIds.length > 0 && unit.seatIds.every((id) => selected.has(id)),
  );
}

/** What a binding's selection change reports beside the seat ids (D20). */
export interface KerusiSelectionChange {
  /** The selection after the change. */
  selection: readonly string[];
  /** The whole units fully selected, in document order. */
  wholeUnits: readonly RenderBookingUnit[];
}

export interface SelectionSummary {
  /** The selected seats, in the map's render order. */
  seats: readonly RenderSeat[];
  /**
   * The total by §4.9.1: each whole price that applies, then every other seat's
   * own price. Absent when nothing in the selection is priced.
   */
  total?: Money;
  /** How many selected seats no whole price covers and that carry no price — a valid state (§4.9). */
  unpriced: number;
  /** The levels charged their whole price, outermost first (§4.9.1). */
  wholes: readonly WholeCharge[];
  /** The whole units fully selected (D20). */
  wholeUnits: readonly RenderBookingUnit[];
}

/**
 * Summarizes a selection: the seats, their total, and how many were unpriced.
 *
 * The total follows §4.9.1: a table, room or venue whose seats are all
 * selected is charged its whole price instead of its seats', however the seats
 * were picked. Exported instead of shipping a cart component — a cart carries
 * far too many product opinions for a rendering library. The total is returned
 * as `Money`, in minor units, so no precision is lost on the way out.
 */
export function summarizeSelection(map: RenderMap, selection: readonly string[]): SelectionSummary {
  const selected = new Set(selection);
  const seats = [...map.seatsById.values()].filter((seat) => selected.has(seat.id));
  const price = priceSelection(map.source, map.session, selection);

  return {
    seats,
    total: price.total,
    unpriced: price.seats.filter((seat) => !seat.price).length,
    wholes: price.wholes,
    wholeUnits: selectedWholeUnits(map, selection),
  };
}
