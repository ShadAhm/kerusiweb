import { Bounds } from '../kerusi/kerusi-map.model.js';
import {
  computeMapLayout,
  MapLayout,
  MapLayoutOptions,
  PlacedRowLabel,
  PlacedSeat,
  PlacedSection,
} from './map-layout.js';
import {
  GLYPH_WIDTH,
  labelAnchorOf,
  looseSeats,
  mirrorBounds,
  placeGroups,
  placeSeat,
} from './placement.js';
import { RenderMap, RenderRow, RenderSection } from './render-model.js';

/**
 * The rows view (§4.5.1): an optional layout built from `row` and `col` alone,
 * for a narrow screen or a large venue, offered beside the canonical view and
 * never instead of it (D27).
 *
 * Every row is drawn as a straight line, in the §4.2.1 row order, with its seats
 * in `col` order. A skipped `col` stays a gap, so an aisle reads as one. Seats
 * off their row's guide go back in line, and no seat is turned. Seats with no
 * `row` follow the rows as a last, unlabelled line. Empty rows (§4.2.2) reserve
 * nothing here either.
 *
 * Sections are stacked top to bottom in render-model order, each under its
 * label. Elements and group footprints are not drawn: they have no `row` or
 * `col` to place them by. A group's seats are still wrapped and named as in the
 * canonical view, but a whole unit booked on its shape has no control here,
 * as for any whole unit with no shape (D19, D28).
 *
 * The result has the `MapLayout` shape, so a binding draws it with the same code
 * as the canonical layout. Its canvas is its own, sized to what it draws.
 */

/**
 * Which view a binding draws: `canonical`, every seat at its document `x`/`y`
 * (§4.5), or `rows`, the reflowed rows view (§4.5.1).
 */
export type KerusiSeatmapView = 'canonical' | 'rows';

/** The layout for `view`: `computeMapLayout` or `computeRowsLayout`. */
export function computeViewLayout(
  map: RenderMap,
  view: KerusiSeatmapView,
  options: MapLayoutOptions = {},
): MapLayout {
  return view === 'rows' ? computeRowsLayout(map, options) : computeMapLayout(map, options);
}

/** Seat centre to seat centre, along a row and between rows, as a multiple of the seat size. */
const PITCH_RATIO = 1.25;
/** The row label's size, as a fraction of the seat size: a seat label's. */
const ROW_LABEL_FONT_RATIO = 0.4;
/** The narrowest row-label gutter, as a multiple of the seat size. */
const MIN_GUTTER_RATIO = 1.5;
/** The space above a section's rows that holds its label: the label and its inset. */
const HEADER_RATIO = 0.75;

interface DraftSection {
  section: RenderSection;
  bounds: Bounds;
  seats: Map<string, { x: number; y: number }>;
  rowLabels: PlacedRowLabel[];
}

export function computeRowsLayout(map: RenderMap, options: MapLayoutOptions = {}): MapLayout {
  const margin = map.seatSize / 2;
  let top = margin;
  const drafts = map.sections.map((section) => {
    const draft = draftSection(section, margin, top);
    top = draft.bounds.y + draft.bounds.height + section.seatSize;
    return draft;
  });

  const width = Math.max(map.seatSize, ...drafts.map((d) => d.bounds.x + d.bounds.width + margin));
  const height = Math.max(map.seatSize, top - (drafts.at(-1)?.section.seatSize ?? 0) + margin);
  const mirror = options.rtl ? (x: number) => width - x : (x: number) => x;

  const sections = drafts.map((draft): PlacedSection => {
    const { section } = draft;
    const bounds = mirrorBounds(draft.bounds, options.rtl ? width : undefined);
    const seats = section.seats
      .filter((seat) => draft.seats.has(seat.id))
      .map((seat): PlacedSeat => {
        const at = draft.seats.get(seat.id)!;
        return placeSeat(seat, mirror(at.x), at.y, 0);
      });
    const groups = placeGroups(section, seats, () => undefined);
    return {
      section,
      seats,
      groups,
      loose: looseSeats(seats, groups),
      elements: [],
      bounds,
      labelAnchor: labelAnchorOf(bounds, section.seatSize, !!options.rtl),
      drawsLabel: true,
      rowLabels: draft.rowLabels.map((label) => ({ ...label, x: mirror(label.x) })),
    };
  });

  return { width, height, sections };
}

/** Lays out one section left to right, its rows starting at `left`, below its label from `top`. */
function draftSection(section: RenderSection, left: number, top: number): DraftSection {
  const size = section.seatSize;
  const pitch = size * PITCH_RATIO;
  const fontSize = size * ROW_LABEL_FONT_RATIO;

  // Rows with seats, the seats with no row last (§4.5.1).
  const rows = section.rows.filter((row) => !row.empty);
  const lines = [...rows.filter((row) => row.id !== ''), ...rows.filter((row) => row.id === '')];

  const labelled = lines.filter((row) => row.id !== '' && row.label);
  const longest = Math.max(0, ...labelled.map((row) => row.label!.length));
  // Rounded up to a quarter seat, so the seats after it land on round numbers.
  const quarter = size / 4;
  const gutter = labelled.length
    ? Math.max(
        size * MIN_GUTTER_RATIO,
        Math.ceil((longest * GLYPH_WIDTH * fontSize + size / 2) / quarter) * quarter,
      )
    : 0;

  const y0 = top + (section.label ? size * HEADER_RATIO : 0);
  const seats = new Map<string, { x: number; y: number }>();
  const rowLabels: PlacedRowLabel[] = [];
  let maxSlot = -1;

  lines.forEach((row, line) => {
    const centerY = y0 + line * pitch + size / 2;
    slotsOf(row).forEach((slot, i) => {
      seats.set(row.seats[i].id, { x: left + gutter + slot * pitch + size / 2, y: centerY });
      maxSlot = Math.max(maxSlot, slot);
    });
    if (row.id !== '' && row.label) {
      rowLabels.push({
        rowId: row.id,
        label: row.label,
        x: left + gutter / 2,
        y: centerY,
        fontSize,
      });
    }
  });

  const bounds: Bounds = {
    x: left,
    y: y0,
    width: gutter + (maxSlot >= 0 ? maxSlot * pitch + size : 0),
    height: lines.length ? (lines.length - 1) * pitch + size : 0,
  };
  return { section, bounds, seats, rowLabels };
}

/**
 * Each seat's slot along its straightened row, in the row's (`col`, then `x`)
 * order. A seat takes its `col`'s slot, counted from the row's first `col`, so a
 * skipped `col` leaves its slot empty (§4.3.5); a seat with no `col`, or one
 * repeating the last, takes the next slot rather than overlap.
 */
function slotsOf(row: RenderRow): number[] {
  const first = row.seats.find((seat) => seat.col !== undefined)?.col;
  let previous = -1;
  return row.seats.map((seat) => {
    const slot =
      seat.col !== undefined && first !== undefined
        ? Math.max(previous + 1, seat.col - first)
        : previous + 1;
    previous = slot;
    return slot;
  });
}
