import {
  BookingMode,
  Group,
  KerusiMap,
  LocalizedText,
  Money,
  Section,
} from './kerusi-map.model.js';
import { KerusiSession, KerusiState } from './kerusi-state.model.js';
import { resolveSeatPrice } from './kerusi-price.js';

/**
 * Booking units and selection prices: Kerusi §4.12 and §4.9.1.
 *
 * Two conformant consumers MUST derive the same booking units and whole units
 * from the same map and session (§4.12.2), so this follows `schema/booking.mjs`,
 * the standard's reference implementation, step for step, and is tested against
 * the standard's `examples/booking-units/` corpus rather than against itself.
 *
 * Like the reference, it assumes a map that has passed the validator: a group
 * seat that does not resolve is skipped, and a seat listed by two groups belongs
 * to the first.
 */

/** A level a booking mode is set on (§4.12): the venue, a room or zone, a piece of furniture. */
export type BookingLevelKind = 'map' | 'section' | 'group';

/** One level of a map with its effective booking mode resolved (§4.12.1). */
export interface BookingLevel {
  level: BookingLevelKind;
  /** `KerusiMap.id`, `Section.id` or `Group.id`. */
  id: string;
  /** `Group.label`, `Section.label` or `KerusiMap.name`, as the document gives it. */
  label?: LocalizedText;
  /** The session's override, else the document's own `booking`, else `"seats"`. */
  mode: BookingMode;
  /** The level's seat ids, in document order. */
  seats: readonly string[];
  /** The level's whole price (§4.9.1), whether or not its mode lets it apply. */
  wholePrice?: Money;
  /** The level containing this one; `null` for the map. */
  parent: BookingLevel | null;
}

/** Every level of a map, outermost first, and for each seat the levels that contain it. */
export interface BookingLevels {
  map: BookingLevel;
  /** In declaration order. */
  sections: readonly BookingLevel[];
  /** In declaration order, section by section. */
  groups: readonly BookingLevel[];
  /** For each seat, the levels that contain it, outermost first: map, section, then group. */
  seatLevels: ReadonlyMap<string, readonly BookingLevel[]>;
}

/**
 * A booking unit or a whole unit (§4.12.2): seats booked as one.
 *
 * A seat that is a booking unit on its own has `level: "seat"` and its own id.
 */
export interface BookingUnit {
  level: BookingLevelKind | 'seat';
  /** The id of the map, section, group or seat. */
  id: string;
  /** The level's label as the document gives it; absent for a seat. */
  label?: LocalizedText;
  /** The unit's seat ids. */
  seats: readonly string[];
  /** The level's whole price (§4.9.1); absent for a seat, or a level with none. */
  wholePrice?: Money;
  /**
   * Given a state: whether every seat in the unit is `available` (§4.12.3), so
   * the unit can be booked. Absent when no state was given.
   */
  bookable?: boolean;
}

/** {@link bookingUnits}' result. */
export interface BookingUnits {
  /** Every booking unit, in document order. Together they partition the map's seats. */
  units: readonly BookingUnit[];
  /** Every whole unit, in document order: the map, then the sections, then the groups. */
  wholeUnits: readonly BookingUnit[];
  /** Each seat's booking unit, by seat id. */
  unitOf: ReadonlyMap<string, BookingUnit>;
}

const MODES: readonly BookingMode[] = ['seats', 'whole', 'either'];

function modeOr(value: unknown, fallback: BookingMode): BookingMode {
  return MODES.includes(value as BookingMode) ? (value as BookingMode) : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function arr<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * A level's whole price (§4.9.1): its `wholePrice`, else the price of the tier
 * its `wholePriceTier` names, else none. Whether it applies is the level's
 * effective mode's question.
 */
export function resolveWholePrice(
  level: Pick<KerusiMap | Section | Group, 'wholePrice' | 'wholePriceTier'>,
  map: Pick<KerusiMap, 'priceTiers'>,
): Money | undefined {
  if (isObject(level.wholePrice)) {
    return level.wholePrice;
  }
  if (level.wholePriceTier !== undefined) {
    return arr(map.priceTiers).find((tier) => tier?.id === level.wholePriceTier)?.price;
  }
  return undefined;
}

/**
 * The effective booking mode of every level of a map (§4.12.1): the session's
 * override, else the document's own `booking`, else `"seats"`.
 */
export function bookingLevels(map: KerusiMap, session?: KerusiSession | null): BookingLevels {
  const overrides = isObject(session?.bookingModes) ? session.bookingModes : {};
  const sectionOverrides: Record<string, unknown> = isObject(overrides.sections)
    ? overrides.sections
    : {};
  const groupOverrides: Record<string, unknown> = isObject(overrides.groups)
    ? overrides.groups
    : {};

  const mapSeats: string[] = [];
  const mapLevel: BookingLevel = {
    level: 'map',
    id: map.id,
    label: map.name,
    mode: modeOr(overrides.map, modeOr(map.booking, 'seats')),
    seats: mapSeats,
    wholePrice: resolveWholePrice(map, map),
    parent: null,
  };
  const sections: BookingLevel[] = [];
  const groups: BookingLevel[] = [];
  const seatLevels = new Map<string, BookingLevel[]>();

  for (const section of arr(map.sections)) {
    if (!isObject(section)) continue;
    const sectionSeats = arr(section.seats)
      .filter(isObject)
      .map((seat) => seat.id);
    const sectionLevel: BookingLevel = {
      level: 'section',
      id: section.id,
      label: section.label,
      mode: modeOr(sectionOverrides[section.id], modeOr(section.booking, 'seats')),
      seats: sectionSeats,
      wholePrice: resolveWholePrice(section, map),
      parent: mapLevel,
    };
    sections.push(sectionLevel);
    mapSeats.push(...sectionSeats);
    for (const id of sectionSeats) seatLevels.set(id, [mapLevel, sectionLevel]);

    for (const group of arr(section.groups)) {
      if (!isObject(group)) continue;
      const groupSeats: string[] = [];
      const groupLevel: BookingLevel = {
        level: 'group',
        id: group.id,
        label: group.label,
        mode: modeOr(groupOverrides[group.id], modeOr(group.booking, 'seats')),
        seats: groupSeats,
        wholePrice: resolveWholePrice(group, map),
        parent: sectionLevel,
      };
      for (const id of arr(group.seats)) {
        const chain = seatLevels.get(id);
        // Unresolved, or already in a group: the validator reports both.
        if (!chain || chain.length > 2 || chain[1] !== sectionLevel) continue;
        chain.push(groupLevel);
        groupSeats.push(id);
      }
      groups.push(groupLevel);
    }
  }
  return { map: mapLevel, sections, groups, seatLevels };
}

/** A seat's status in a state, `available` when the state does not list it (§5.1). */
function statusOf(state: KerusiState, id: string): string {
  const entry = isObject(state.seats) ? state.seats[id] : undefined;
  return isObject(entry) && typeof entry.status === 'string' ? entry.status : 'available';
}

function unitOfLevel(level: BookingLevel): BookingUnit {
  return {
    level: level.level,
    id: level.id,
    label: level.label,
    seats: [...level.seats],
    wholePrice: level.wholePrice,
  };
}

/** Whether a level with effective mode `whole` contains this one. */
function insideWhole(level: BookingLevel): boolean {
  for (let p = level.parent; p; p = p.parent) {
    if (p.mode === 'whole') return true;
  }
  return false;
}

/**
 * Every booking unit and whole unit of a map (§4.12.2).
 *
 * A seat's **booking unit** is every seat of the outermost level containing it
 * whose effective mode is `whole` (the map, then its section, then its group),
 * or the seat alone when none of them is. The booking units partition the map's
 * seats. A **whole unit** is a level whose effective mode is `either`, that has
 * seats, and that no `whole` level contains: one booking of all its seats.
 *
 * Given a state, each unit also says whether it can be booked: only while every
 * seat in it is `available` (§4.12.3).
 */
export function bookingUnits(
  map: KerusiMap,
  session?: KerusiSession | null,
  state?: KerusiState | null,
): BookingUnits {
  const levels = bookingLevels(map, session);

  const units: BookingUnit[] = [];
  const unitOf = new Map<string, BookingUnit>();
  const byLevel = new Map<BookingLevel, BookingUnit>();
  for (const [seatId, chain] of levels.seatLevels) {
    const outer = chain.find((level) => level.mode === 'whole');
    let unit = outer ? byLevel.get(outer) : undefined;
    if (!unit) {
      unit = outer ? unitOfLevel(outer) : { level: 'seat', id: seatId, seats: [seatId] };
      if (outer) byLevel.set(outer, unit);
      units.push(unit);
    }
    unitOf.set(seatId, unit);
  }

  const wholeUnits = [levels.map, ...levels.sections, ...levels.groups]
    .filter((level) => level.mode === 'either' && level.seats.length > 0 && !insideWhole(level))
    .map(unitOfLevel);

  if (state) {
    for (const unit of [...units, ...wholeUnits]) {
      unit.bookable = unit.seats.every((id) => statusOf(state, id) === 'available');
    }
  }
  return { units, wholeUnits, unitOf };
}

/** {@link checkSelection}'s result. */
export interface SelectionCheck {
  valid: boolean;
  /** One sentence per problem, in English. Empty when `valid`. */
  problems: readonly string[];
}

/**
 * Whether a selection is a **valid selection** (§4.12.3): not empty, every seat
 * in it a seat of the map, and holding every seat of every booking unit it
 * touches. A consumer MUST NOT submit any other.
 */
export function checkSelection(
  map: KerusiMap,
  session: KerusiSession | null | undefined,
  seatIds: readonly string[],
): SelectionCheck {
  const selected = new Set(seatIds);
  const problems: string[] = [];
  if (selected.size === 0) problems.push('the selection is empty');
  const { unitOf } = bookingUnits(map, session);
  const reported = new Set<BookingUnit>();
  for (const id of selected) {
    const unit = unitOf.get(id);
    if (!unit) {
      problems.push(`"${id}" is not a seat of map "${map.id}"`);
      continue;
    }
    if (reported.has(unit)) continue;
    const missing = unit.seats.filter((other) => !selected.has(other));
    if (missing.length === 0) continue;
    reported.add(unit);
    problems.push(
      `seat "${id}" is booked only with the rest of ${unit.level} "${unit.id}", ` +
        `and the selection leaves out ${missing.map((m) => `"${m}"`).join(', ')}`,
    );
  }
  return { valid: problems.length === 0, problems };
}

/** A level charged its whole price in a {@link SelectionPrice}. */
export interface WholeCharge {
  level: BookingLevelKind;
  id: string;
  price: Money;
  /** The seats the whole price covers. */
  seats: readonly string[];
}

/** {@link priceSelection}'s result. */
export interface SelectionPrice {
  /** The sum, or `undefined` when nothing in the selection is priced. */
  total?: Money;
  /** The levels charged a whole price, outermost first: map, sections, groups. */
  wholes: readonly WholeCharge[];
  /** Every seat no whole price covers, with its §4.9 price; `undefined` for an unpriced seat. */
  seats: readonly { id: string; price?: Money }[];
}

/**
 * The price of a selection (§4.9.1).
 *
 * From the outermost level inwards (the map, then each section, then each
 * group), a level is charged its whole price when it has one, its effective mode
 * is `whole` or `either`, and every one of its seats is in the selection and not
 * already charged. Its seats are then taken out. Each seat left is priced by
 * §4.9. So a selection's price never depends on how it was picked: four seats of
 * an `either` table tapped one by one cost the table price.
 *
 * Whether the selection is a valid one is {@link checkSelection}'s question; this
 * prices any set of seats, and ignores ids that are not seats of the map.
 */
export function priceSelection(
  map: KerusiMap,
  session: KerusiSession | null | undefined,
  seatIds: readonly string[],
): SelectionPrice {
  const levels = bookingLevels(map, session);
  const remaining = new Set(seatIds.filter((id) => levels.seatLevels.has(id)));

  const wholes: WholeCharge[] = [];
  for (const level of [levels.map, ...levels.sections, ...levels.groups]) {
    if (level.mode === 'seats' || level.seats.length === 0 || !level.wholePrice) continue;
    if (!level.seats.every((id) => remaining.has(id))) continue;
    for (const id of level.seats) remaining.delete(id);
    wholes.push({ level: level.level, id: level.id, price: level.wholePrice, seats: level.seats });
  }

  const seatsById = new Map(
    arr(map.sections).flatMap((section) =>
      arr(section?.seats).map((seat) => [seat?.id, seat] as const),
    ),
  );
  const seats = [...remaining].map((id) => ({
    id,
    price: resolveSeatPrice(seatsById.get(id)!, map),
  }));

  const monies = [
    ...wholes.map((w) => w.price),
    ...seats.flatMap((s) => (s.price ? [s.price] : [])),
  ];
  const total =
    monies.length === 0
      ? undefined
      : { amount: monies.reduce((sum, m) => sum + m.amount, 0), currency: monies[0].currency };
  return { total, wholes, seats };
}
