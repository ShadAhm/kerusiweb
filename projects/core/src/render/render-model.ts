import {
  Accessibility,
  Bounds,
  Canvas,
  Element,
  Money,
  PriceTier,
  Seat,
  SeatType,
  Section,
} from '../kerusi/kerusi-map.model.js';
import { SeatStatus } from '../kerusi/kerusi-state.model.js';

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
  /** ids of seats that must be booked together (§4.6). Symmetric. */
  companions: readonly string[];

  // --- availability ---------------------------------------------------------
  /** From the merged state; `"available"` when the seat is absent (§5.1). */
  status: SeatRenderStatus;
  /** RFC 3339 (§5.1.1); meaningful when `status === "held"`. */
  holdExpires?: string;
  /** Whether this seat may currently be picked, per the caller's rules. */
  selectable: boolean;

  /** The originating document object, for callers that need `metadata`. */
  source: Seat;
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
}

/** A legend row: a seat type with its label and default price resolved. */
export interface RenderLegendEntry {
  id: string;
  label: string;
  color?: string;
  /** The type's default tier, resolved (§4.7 → §4.8). */
  defaultTier?: PriceTier;
  /** That tier's price, for a legend that shows prices. */
  price?: Money;
  /** How many seats in the map carry this type. */
  seatCount: number;
}
