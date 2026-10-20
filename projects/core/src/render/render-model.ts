import {
  Accessibility,
  BookingMode,
  Bounds,
  Canvas,
  Element,
  Group,
  KerusiMap,
  Money,
  PriceTier,
  Seat,
  SeatType,
  Section,
} from '../kerusi/kerusi-map.model.js';
import { KerusiSession, SeatStatus } from '../kerusi/kerusi-state.model.js';
import { BookingLevelKind } from '../kerusi/kerusi-booking.js';

/**
 * The renderer's view of a Kerusi document pair: a `KerusiMap` with its
 * `KerusiState` merged in, every reference resolved, every label localized, and
 * every size the document leaves to a default filled in. Positions stay in the
 * map's canvas units (§4.5), exactly as the document gives them.
 *
 * This is deliberately not the source documents — a renderer should never have
 * to re-resolve a price tier or re-read a locale map while drawing. It is also
 * deliberately framework-agnostic: nothing in this folder imports a framework,
 * so the model can be built in a test, a script, or on a server.
 */

/** A seat's availability, from the merged state (§5.1). */
export type SeatRenderStatus = SeatStatus['status'];

export interface RenderSeat {
  /** `Seat.id` — globally unique within the map, and the selection key. */
  id: string;
  /** The section this seat belongs to. */
  sectionId: string;
  /** `Seat.label`, defaulting to `id`. */
  label: string;

  // --- position -------------------------------------------------------------
  /** `Seat.row` — a `RowMeta.id` or free text. */
  row?: string;
  /** The row's resolved display label, defaulting to `row`. */
  rowLabel?: string;
  /** The row's position among the section's rows, for vertical navigation. */
  rowIndex: number;
  /**
   * `Seat.col` — the adjacency ordinal within the row (§4.3.5). It says which
   * seats are neighbours, never where a seat is drawn.
   */
  col?: number;
  /** `Seat.x`: the centre, in canvas units. */
  x: number;
  /** `Seat.y`: the centre, in canvas units. */
  y: number;
  /** The side of the seat's square footprint, in canvas units: its section's seat size. */
  size: number;
  /** `Seat.rotation` in degrees, clockwise on screen about the centre. */
  rotation?: number;
  /**
   * Whether an aisle runs beside this seat: the next seat along its row skips
   * a `col`, so the two are not neighbours (§4.3.5). Read from adjacency, never
   * from the drawing.
   */
  besideAisle: boolean;

  // --- classification -------------------------------------------------------
  /** The resolved legend entry, not merely its id (§4.7). */
  type: SeatType;
  /** `SeatType.label` localized, defaulting to the type id. */
  typeLabel: string;
  /** `SeatType.color`, the spec's suggested render color. */
  typeColor?: string;
  /** Non-exclusive descriptive tags (§4.3.3). Never affects price. */
  attributes: readonly string[];
  /** Structured accessibility properties (§4.3.4). */
  accessibility?: Accessibility;

  // --- commerce -------------------------------------------------------------
  /** Resolved per the §4.9 precedence order; absent when the seat is unpriced. */
  price?: Money;
  /**
   * The seat's booking unit (§4.12.2): the seats a tap on it selects and
   * deselects together. The seat alone unless a level containing it is booked
   * `whole`, and always the seat alone under `unitMode: 'seats'`.
   */
  unit: RenderBookingUnit;

  // --- availability ---------------------------------------------------------
  /** From the merged state; `"available"` when the seat is absent (§5.1). */
  status: SeatRenderStatus;
  /** RFC 3339 (§5.1.1); meaningful when `status === "held"`. */
  holdExpires?: string;
  /**
   * Whether this seat may currently be picked by its own rules: its status, and
   * the caller's `seatSelectable`. See `unitBlocked` for its booking unit's.
   */
  selectable: boolean;
  /**
   * Whether another seat of its booking unit cannot be picked, so neither can
   * this one (§4.12.3): the other half of a love seat is sold. A renderer shows
   * such a seat as unavailable, as it does one that is not `selectable`.
   */
  unitBlocked: boolean;

  /**
   * The group this seat belongs to (§4.11): the table, sofa or pew it sits at.
   * Absent for a seat in no group.
   */
  group?: RenderGroup;

  /** The originating document object, for callers that need `metadata`. */
  source: Seat;
}

/**
 * How a tap on a seat selects (D22): `auto` takes the seat's whole booking unit
 * (§4.12.2), `seats` takes the seat alone, for an admin view that blocks single
 * seats.
 */
export type UnitMode = 'auto' | 'seats';

/**
 * A booking unit or a whole unit (§4.12.2), resolved: seats booked as one.
 *
 * A whole unit is an `either` level offered as one booking: an `either` table is
 * offered on its shape, and a room or the venue, which has nothing to tap, is
 * left to the app (D19).
 */
export interface RenderBookingUnit {
  /** `"seat"` for a seat that is a booking unit on its own. */
  level: BookingLevelKind | 'seat';
  /** The id of the map, section, group or seat. */
  id: string;
  /** The level's label, localized: a group's or section's label, the map's name. */
  label?: string;
  /** `Group.kind` for a group's unit: what to call it ("book the whole table"). */
  kind?: string;
  /** The unit's seat ids, in document order. Some may be in sections not drawn. */
  seatIds: readonly string[];
  /** The level's whole price (§4.9.1), which applies whenever all its seats are selected. */
  wholePrice?: Money;
  /**
   * Whether every seat in it may be picked now (§4.12.3): its status is
   * selectable and the caller's `seatSelectable` allows it. A renderer MUST NOT
   * offer a whole unit while this is false.
   */
  selectable: boolean;
}

/**
 * A group's footprint (§4.11), in canvas units. A `rect` is centred on `x`/`y`
 * and turned by `rotation` degrees clockwise, exactly as an element is; a
 * `circle` is drawn round its centre.
 */
export type RenderGroupShape =
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rotation?: number }
  | { kind: 'circle'; x: number; y: number; radius: number };

/**
 * A piece of furniture or a set of seats that belong together (§4.11), resolved:
 * its label localized, its seats checked against the section, its shape read
 * into one of two forms.
 */
export interface RenderGroup {
  /** `Group.id`: unique across the map. */
  id: string;
  /** `Group.kind`: "table" | "sofa" | "loveseat" | "pew" | "bench" | "booth" | "box" | "companion" | ... */
  kind: string;
  /** `Group.label` localized: "Table 3", "Pew 12". */
  label?: string;
  /** The section the group's seats are in. */
  sectionId: string;
  /** The ids of the group's seats that exist in its section, in document order. */
  seatIds: readonly string[];
  /** The footprint, when the document gives a well-formed one. */
  shape?: RenderGroupShape;
  /** The group's effective booking mode (§4.12.1): the session's override, else its own. */
  booking: BookingMode;
  /**
   * The group as one booking, when it is offered whole: its mode is `either` and
   * no `whole` level contains it (§4.12.2). With a `shape`, the shape is the
   * control that books it (D19).
   */
  wholeUnit?: RenderBookingUnit;
  source: Group;
}

export interface RenderElement {
  /** `Element.id` — REQUIRED by §4.4, and preserved here unlike in the adapter. */
  id: string;
  /** `Element.kind`: "screen" | "stage" | "exit" | "lavatory" | "gap" | "label" | ... */
  kind: string;
  label?: string;
  /** `Element.x`: the centre, in canvas units. */
  x: number;
  /** `Element.y`: the centre, in canvas units. */
  y: number;
  /** Canvas units; the section's seat size when the document gives none (§4.4.1). */
  width: number;
  /** Canvas units; the section's seat size when the document gives none (§4.4.1). */
  height: number;
  /** Degrees, clockwise on screen about the centre. */
  rotation?: number;
  source: Element;
}

/** A row within a section: metadata plus the seats that reference it. */
export interface RenderRow {
  /** `RowMeta.id`, the seat's `row` value, or `''` for seats with no row. */
  id: string;
  /** The display label, defaulting to `id`. */
  label?: string;
  /** Position among the section's rows, after the §4.2.1 ordering. */
  index: number;
  /** The seats in this row, ordered by `col`, then by `x`. */
  seats: readonly RenderSeat[];
  /**
   * An **empty row** (§4.2.2): declared by `Section.rows` and referenced by no
   * seat. It takes its place in the row order and reserves nothing: rows give
   * order and adjacency, never space. Kept as information only.
   */
  empty: boolean;
}

/** A `Direction` (§4.10) with both ends localized. Informational only. */
export interface RenderDirection {
  axis: 'row' | 'col' | 'x' | 'y';
  low: string;
  high: string;
}

export interface RenderSection {
  id: string;
  /** `Section.label` localized; absent when the section declares none. */
  label?: string;
  /** The seat size that applies in this section (§4.5), resolved. */
  seatSize: number;
  /**
   * The section's extent on the canvas: `Section.bounds` when declared, else
   * the box around its seats' and elements' footprints. For zooming to a
   * section and revealing a focused seat; never for placing anything.
   */
  bounds: Bounds;
  /** Whether `bounds` is the document's own `Section.bounds` rather than computed. */
  boundsDeclared: boolean;
  /** Rows in display order. Grouping only — seats do not live inside rows. */
  rows: readonly RenderRow[];
  /** Every seat in the section, flat, in row-then-position order. */
  seats: readonly RenderSeat[];
  /** Non-bookable features (§4.4). */
  elements: readonly RenderElement[];
  /** Furniture and sets of seats that belong together (§4.11), in document order. */
  groups: readonly RenderGroup[];
  /** The section's effective booking mode (§4.12.1). */
  booking: BookingMode;
  /**
   * `Section.directions` localized (§4.10) — what an axis means in the physical
   * world. Informational only: nothing in this library reads it to decide
   * screen placement, exactly as nothing branches on `RenderMap.domain`.
   */
  directions?: readonly RenderDirection[];
  source: Section;
}

export interface RenderMap {
  id: string;
  /** `KerusiMap.name`, for the map's accessible label. */
  name?: string;
  /** The resolved BCP-47 locale everything above was localized against. */
  locale: string;
  /** `KerusiMap.domain` — informational only; never used to reject or branch. */
  domain?: string;
  /** `KerusiMap.canvas`: the one drawing surface every section shares (§4.5). */
  canvas: Canvas;
  /** `KerusiMap.seatSize`: the map-wide seat size, before any section overrides it. */
  seatSize: number;
  /** Sections in `Section.index` order. */
  sections: readonly RenderSection[];
  /** The legend, with labels localized, for a key or legend component. */
  legend: readonly RenderLegendEntry[];
  /** The map's single currency, when any seat or tier is priced (§4.9). */
  currency?: string;
  /** Every seat across every section, keyed by id — the merge and lookup index. */
  seatsById: ReadonlyMap<string, RenderSeat>;
  /** The map's effective booking mode (§4.12.1). */
  booking: BookingMode;
  /** How a tap selects: the `unitMode` the model was built with (D22). */
  unitMode: UnitMode;
  /**
   * Every booking unit (§4.12.2), in document order, over the whole map rather
   * than only the sections drawn. Under `unitMode: 'seats'`, one per seat.
   */
  units: readonly RenderBookingUnit[];
  /**
   * Every whole unit (§4.12.2), in document order: the map, then its sections,
   * then its groups. An app offers the ones with no shape, a room or the venue,
   * with its own control, by setting `selection` to the unit's `seatIds` (D19).
   */
  wholeUnits: readonly RenderBookingUnit[];
  /** The document the model was built from, for pricing a selection (§4.9.1). */
  source: KerusiMap;
  /** The session whose booking modes apply, when one was given (§5.3). */
  session?: KerusiSession;
}

/** A legend row: a seat type with its label and default price resolved. */
export interface RenderLegendEntry {
  id: string;
  label: string;
  color?: string;
  /** `SeatType.form` as the document gave it (§4.7.1); absent means a chair. */
  form?: string;
  /** The type's default tier, resolved (§4.7 → §4.8). */
  defaultTier?: PriceTier;
  /** That tier's price, for a legend that shows prices. */
  price?: Money;
  /** How many seats in the map carry this type. */
  seatCount: number;
}
