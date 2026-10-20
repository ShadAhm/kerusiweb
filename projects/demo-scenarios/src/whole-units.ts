import { bookingUnits, formatMoney, resolveLocalizedText } from '@kerusiweb/core';
import type { RenderBookingUnit } from '@kerusiweb/core';
import type { Scenario } from './scenarios.js';

/**
 * The demos' own "hire the whole venue" buttons, in one place for both apps.
 *
 * A whole unit with a shape, an `either` table, is offered on the map itself. A
 * room or the venue has nothing to press, so the app offers it (D19): it reads
 * the whole units with their availability from `bookingUnits`, and books one by
 * setting `selection`. This is the README's "Book the whole room" pattern.
 */
export interface WholeUnitButton {
  /** Unique among the buttons: the unit's level and id. */
  key: string;
  label: string;
  seats: readonly string[];
  /** Every seat in it is available (§4.12.3); a disabled button otherwise. */
  bookable: boolean;
  /** Every seat in it is selected: a pressed button. */
  selected: boolean;
}

export function wholeUnitButtons(
  scenario: Scenario,
  locale: string,
  selection: readonly string[],
): WholeUnitButton[] {
  if (!scenario.wholeUnitButtons) {
    return [];
  }
  const shaped = new Set(
    scenario.map.sections.flatMap((s) => (s.groups ?? []).filter((g) => g.shape).map((g) => g.id)),
  );
  const picked = new Set(selection);
  return bookingUnits(scenario.map, scenario.session, scenario.state)
    .wholeUnits.filter((unit) => !(unit.level === 'group' && shaped.has(unit.id)))
    .map((unit) => {
      const name = resolveLocalizedText(unit.label, locale) ?? unit.id;
      const price = unit.wholePrice ? ` — ${formatMoney(unit.wholePrice, locale)}` : '';
      return {
        key: `${unit.level}:${unit.id}`,
        label: `Hire the whole ${unit.level === 'map' ? 'venue' : 'room'}: ${name}${price}`,
        seats: unit.seats,
        bookable: unit.bookable !== false,
        selected: unit.seats.every((id) => picked.has(id)),
      };
    });
}

/** The selection after pressing a whole unit's button: book it, or release it. */
export function toggleWholeUnitButton(
  selection: readonly string[],
  button: Pick<WholeUnitButton, 'seats' | 'selected'>,
): readonly string[] {
  const unit = new Set(button.seats);
  const rest = selection.filter((id) => !unit.has(id));
  return button.selected ? rest : [...rest, ...button.seats];
}

/** "Table 1 (whole table)", "The Rooftop (whole venue)": a whole unit in the selection. */
export function wholeUnitName(unit: RenderBookingUnit): string {
  const what =
    unit.level === 'map' ? 'venue' : unit.level === 'section' ? 'room' : (unit.kind ?? 'group');
  return `${unit.label ?? unit.id} (whole ${what})`;
}

/**
 * The whole units of a selection a cart lists: those no other selected whole
 * unit contains. With the venue booked, Table 1 is part of it, and §4.9.1
 * charges the venue's price alone.
 */
export function outermostWholeUnits(
  units: readonly RenderBookingUnit[],
): readonly RenderBookingUnit[] {
  return units.filter(
    (unit) =>
      !units.some(
        (other) =>
          other !== unit &&
          other.seatIds.length > unit.seatIds.length &&
          unit.seatIds.every((id) => other.seatIds.includes(id)),
      ),
  );
}
