/**
 * Kerusi Seat Map document types, transcribed from the Kerusi Seat Map and
 * Availability Format v1.0.0-draft rev 17, §4. Field-level comments preserve
 * the normative REQUIRED/OPTIONAL constraints and defaults from the standard.
 *
 * A `KerusiMap` describes a physical venue/vehicle configuration (layout,
 * pricing, seat types). It is static and cacheable; live availability lives
 * in a separate {@link KerusiState} (see kerusi-state.model.ts).
 *
 * Every seat, element and section sits on the map's one {@link Canvas} (§4.5).
 * A renderer draws each seat as a `seatSize` square centred on its `x`/`y` and
 * does no layout arithmetic of its own.
 */

/**
 * A label that may be a plain string or a BCP-47 locale map, e.g.
 * `{ "en": "Orchestra", "ms": "Orkestra" }`. Resolve with
 * `resolveLocalizedText` (§4.1, §4.7).
 */
export type LocalizedText = string | Record<string, string>;

/** [x, y] in canvas units. */
export type Point = [number, number];

/**
 * The map's one drawing surface (§4.5). Unitless, with the same scale on both
 * axes; the origin is the top-left corner, x grows to the right and y grows
 * downwards.
 */
export interface Canvas {
  /** REQUIRED. Positive. */
  width: number;
  /** REQUIRED. Positive. */
  height: number;
}

/** A rectangle on the canvas: top-left corner and size, in canvas units. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Structured accessibility properties for a seat (§4.3.4). All members are
 * OPTIONAL, per the progressive-enhancement principle (§2): a map with no
 * accessibility needs to express simply omits `accessibility` on every seat.
 *
 * These are first-class fields, not `attributes` — an attribute tag like
 * "wheelchair" is free text a consumer cannot rely on.
 */
export interface Accessibility {
  /** Seat or space usable by a wheelchair user. */
  wheelchairAccessible?: boolean;
  /** Which armrest lifts, for transfer from a mobility device. */
  transferArmrest?: 'left' | 'right' | 'both' | 'fixed' | 'none';
  /** Reachable via aisle-chair transfer. */
  aisleChairCompatible?: boolean;
  /**
   * The occupant is expected to need an adjacent companion. Pair the seat with
   * its companion seat in a group with `booking: "whole"` (§4.11, §4.12.4).
   */
  companionRequired?: boolean;
}

/** A monetary amount, in minor units to avoid floating-point error (§4.8). */
export interface Money {
  /** REQUIRED. Minor units (e.g. cents), to avoid floating-point error. */
  amount: number;
  /** REQUIRED. ISO 4217 currency code, e.g. "MYR", "USD". */
  currency: string;
}

/** A named price tier, referenced by seats via `Seat.priceTier` (§4.8). */
export interface PriceTier {
  /** REQUIRED. */
  id: string;
  label?: string;
  /** REQUIRED. */
  price: Money;
}

/** A legend entry: the vocabulary of seat types used in a map (§4.7). */
export interface SeatType {
  /** REQUIRED. e.g. "standard" | "recliner" | "wheelchair" | "business". */
  id: string;
  label?: LocalizedText;
  /** Suggested render color, hex. Non-normative hint. */
  color?: string;
  /**
   * What one place of this type looks like (§4.7.1); `"chair"` when absent. A
   * drawing hint: it never affects price, adjacency or the footprint. Any other
   * non-empty string is implementation-defined and drawn as a chair by a
   * consumer that does not know it.
   */
  form?: SeatForm | (string & {});
  defaultPriceTier?: string;
}

/** The registered values of {@link SeatType.form} (§4.7.1). */
export type SeatForm =
  | 'chair'
  | 'armchair'
  | 'stool'
  | 'recliner'
  | 'beanbag'
  | 'cushion'
  | 'wheelchair-space'
  | 'sofa'
  | 'bench';

/**
 * The form a row was laid out in, for editors (§4.2.3): exactly one of `line`,
 * `arc` or `circle`. Angles are degrees on the canvas axes (0 points right, 90
 * points down), and `cols` is `[first, last]` with first not exceeding last.
 *
 * A guide only. It MUST NOT move any seat, a renderer ignores it, and it never
 * decides which row a seat is in. See `guidePoint` and `isOnGuide`.
 */
export type RowShape =
  | { line: { from: Point; to: Point; cols: [number, number] } }
  | {
      arc: {
        center: Point;
        /** Positive. */
        radius: number;
        start: number;
        /** REQUIRED. Positive turns clockwise on screen. */
        sweep: number;
        cols: [number, number];
      };
    }
  | { circle: { center: Point; radius: number; start: number; cols: [number, number] } };

/**
 * A row's declaration: label, ordering key, row-level metadata. NOT a container
 * — seats reference a row by id via `Seat.row` rather than nesting inside it
 * (§4.2).
 *
 * `Section.rows` as a whole is OPTIONAL, but where it is present it is the
 * section's **complete, ordered row registry** rather than an annotation on the
 * rows the seats happen to mention: §4.6 requires every `Seat.row` to resolve
 * against it, so no seat can occupy a row it does not declare. A `RowMeta` that
 * no seat references is an *empty row*: valid, and it reserves no space
 * (§4.2.2).
 */
export interface RowMeta {
  /** REQUIRED. Unique within its section; another section MAY reuse it. */
  id: string;
  label?: string;
  /**
   * Ordering key among the section's rows (§4.2.1) — a key, not a position.
   * Rows at 0 and 11 with nothing between them are adjacent, two rows and not
   * twelve. Rows give order and adjacency, never space.
   */
  index?: number;
  /** The guide the row was laid out along, for editors (§4.2.3). Renderers ignore it. */
  shape?: RowShape;
  metadata?: Record<string, unknown>;
}

/**
 * A human-facing label for one of a section's four addressing axes (§4.10) —
 * "front of train" / "back of train" for a carriage, compass points for
 * open-air seating whose orientation decides where the sun falls.
 *
 * Non-normative and purely informational: a validator MUST NOT reject a
 * document over it, and a renderer MUST NOT read it to decide layout or screen
 * placement. It says what an axis *means* in the physical world, not which edge
 * of the screen it is drawn on — that stays a rendering decision (§2).
 */
export interface Direction {
  /** REQUIRED. Which addressing axis (§4.3) this label pair describes. */
  axis: 'row' | 'col' | 'x' | 'y';
  /**
   * REQUIRED. The low end: ascending row order (§4.2.1) or `col` from the
   * section's first, or `x`/`y` = 0.
   */
  low: LocalizedText;
  /**
   * REQUIRED. The high end: descending row/col order, or `x` = `canvas.width`
   * / `y` = `canvas.height`.
   */
  high: LocalizedText;
}

/**
 * A single seat within a section (§4.3). Its footprint is a `seatSize` square
 * centred on `x`/`y` in canvas units and turned by `rotation` (§4.5). `row` and
 * `col` say only which seats are next to it (§4.3.5).
 */
export interface Seat {
  /** REQUIRED. Globally unique within the KerusiMap. */
  id: string;
  /** Display label, e.g. "12" or "12A". Defaults to `id`. */
  label?: string;
  /**
   * References `RowMeta.id` when the section declares `rows`; free text
   * otherwise. The only way a seat joins a row (§4.2.3).
   */
  row?: string;
  /**
   * Positive integer adjacency ordinal within `row`, which it requires. Seats
   * in the same section and row whose cols differ by 1 are neighbours; a
   * skipped col is an aisle (§4.3.5). No two seats in a section share a row and
   * col. Never affects where the seat is drawn.
   */
  col?: number;
  /** REQUIRED. Centre of the footprint, in canvas units, 0 to `canvas.width` (§4.3.1). */
  x: number;
  /** REQUIRED. Centre of the footprint, in canvas units, 0 to `canvas.height`. */
  y: number;
  /** Degrees, clockwise on screen, about the seat's centre. */
  rotation?: number;
  /** REQUIRED. References a `SeatType.id` in the map's `legend`. */
  type: string;
  /** References a `PriceTier.id`. */
  priceTier?: string;
  /** Literal override; takes precedence over `priceTier` (§4.9). */
  price?: Money;
  /**
   * Retired in rev 17 (§4.12.4). A set of seats booked together is a group with
   * `booking: "whole"`. The member is reserved: a validator rejects a seat that
   * carries it (`companions-retired`), because ignored, a pair sold together
   * would quietly become two seats sold apart.
   */
  companions?: never;
  /**
   * Free, non-exclusive tags: "aisle" | "window" | "extra-legroom" | ...
   * Descriptive only; attributes MUST NOT independently affect price (§4.3.3).
   */
  attributes?: string[];
  /** Structured accessibility properties (§4.3.4). */
  accessibility?: Accessibility;
  metadata?: Record<string, unknown>;
}

/**
 * A non-bookable feature that still requires rendering: screens, stages,
 * exits, lavatories, staircases, or a labelled gap (§4.4). Placed on the canvas
 * exactly as a seat is (§4.4.1): a `width` × `height` rectangle centred on
 * `x`/`y`.
 */
export interface Element {
  /** REQUIRED. Unique across the whole KerusiMap (§4.6). */
  id: string;
  /** REQUIRED. "screen" | "stage" | "exit" | "lavatory" | "gap" | "aisle" | ... */
  kind: string;
  label?: string;
  /** REQUIRED. Centre, in canvas units, 0 to `canvas.width`. */
  x: number;
  /** REQUIRED. Centre, in canvas units, 0 to `canvas.height`. */
  y: number;
  /** Canvas units, positive. Default: the applicable seat size. */
  width?: number;
  /** Canvas units, positive. Default: the applicable seat size. */
  height?: number;
  /** Degrees, clockwise on screen, about the element's centre. */
  rotation?: number;
  metadata?: Record<string, unknown>;
}

/**
 * A named zone on the map's canvas (§4.1), not a canvas of its own. It holds a
 * FLAT list of seats, not a grid of rows containing seats; a seat's position
 * is a property of the seat, which is what makes curves, offsets, and
 * irregular gaps representable.
 */
export interface Section {
  /** REQUIRED. */
  id: string;
  /** String, or locale map: `{ "en": "Orchestra", "ms": "Orkestra" }`. */
  label?: LocalizedText;
  /** Ordering key among sections (§4.1.1) — a key, not a position. */
  index?: number;
  /** Overrides `KerusiMap.seatSize` for this section's seats and elements. Positive. */
  seatSize?: number;
  /**
   * The section's extent on the canvas, for zooming to a section, thumbnails
   * and legends. Does not affect drawing; the section's seats SHOULD lie
   * inside it (§4.1).
   */
  bounds?: Bounds;
  /**
   * The section's row registry, when present: a complete, ordered list of its
   * rows, not merely an annotation on the ones its seats mention (§4.2).
   * Omitted, a seat's `row` is opaque free text and the section's rows are
   * exactly those its seats reference.
   *
   * Rows are ordered by §4.2.1 — those declaring `index` first, ascending, then
   * the rest in declaration order. A row no seat references is an **empty row**
   * (§4.2.2): valid, and it reserves no space. Rows give order and adjacency;
   * where a seat is drawn comes only from its own `x`/`y`.
   */
  rows?: RowMeta[];
  /** Human-facing labels for this section's addressing axes (§4.10). */
  directions?: Direction[];
  /** REQUIRED. Flat list; order is not significant. */
  seats: Seat[];
  /** Non-bookable features: screens, stages, aisles, stairs. */
  elements?: Element[];
  /**
   * Furniture, and sets of seats that belong together (§4.11): a table, a sofa,
   * a pew. A seat is in at most one group, and a group does not span sections.
   */
  groups?: Group[];
  /** How the section, a room or zone, may be booked (§4.12). Default `"seats"`. */
  booking?: BookingMode;
  /** Room hire: a literal whole price, over `wholePriceTier` (§4.9.1). */
  wholePrice?: Money;
  /** References a `PriceTier.id` for the whole price (§4.9.1). */
  wholePriceTier?: string;
  metadata?: Record<string, unknown>;
}

/**
 * A piece of furniture, or a set of seats that belong together (§4.11): the
 * places on a sofa or pew, the chairs round a table, a booth. It MAY give the
 * piece a footprint of its own, which the canonical view draws under the
 * group's seats, and says how the set may be booked (§4.12).
 */
export interface Group {
  /** REQUIRED. Unique within the KerusiMap (§4.6). */
  id: string;
  /**
   * REQUIRED. What the group is: one of {@link GroupKind}, or an
   * implementation-defined value. Informational: it chooses how a renderer draws
   * the piece and how a consumer names its seats ("Table 3, seat 4"), and never
   * affects price, validation or booking.
   */
  kind: GroupKind | (string & {});
  /** e.g. "Table 3", "Pew 12". */
  label?: LocalizedText;
  /** REQUIRED. `Seat.id` values in this group's own section, each once. At least one. */
  seats: string[];
  /** The piece's own footprint, drawn under its seats. Canvas units (§4.5). */
  shape?: GroupShape;
  /** How the group may be booked (§4.12). Default `"seats"`. */
  booking?: BookingMode;
  /** A table or sofa price: a literal whole price, over `wholePriceTier` (§4.9.1). */
  wholePrice?: Money;
  /** References a `PriceTier.id` for the whole price (§4.9.1). */
  wholePriceTier?: string;
  metadata?: Record<string, unknown>;
}

/** The registered values of {@link Group.kind} (§4.11). */
export type GroupKind =
  'table' | 'sofa' | 'loveseat' | 'pew' | 'bench' | 'booth' | 'box' | 'companion';

/**
 * A group's footprint (§4.11): exactly one of a `rect`, centred on its `x`/`y`
 * and turned by `rotation` degrees clockwise exactly as an element is (§4.4.1),
 * or a `circle` of positive `radius` round `center`. Its centre MUST lie on the
 * canvas.
 */
export type GroupShape =
  | { rect: { x: number; y: number; width: number; height: number; rotation?: number } }
  | { circle: { center: Point; radius: number } };

/**
 * How a level, the map, a section or a group, may be booked (§4.12):
 *
 * - `seats`, the default: the level adds nothing, and its seats are booked as
 *   the levels inside it say.
 * - `whole`: the level's seats can be booked only all together.
 * - `either`: as `seats`, and the whole level is also offered as one booking.
 *
 * A `KerusiSession` may override it for one event (§5.3).
 */
export type BookingMode = 'seats' | 'whole' | 'either';

/** The top-level static seat-map document (§4). */
export interface KerusiMap {
  /** REQUIRED. Spec version this document conforms to. */
  kerusi: '1.0';
  /** REQUIRED. Unique id for this map (e.g. "cinema3-hallA"). */
  id: string;
  /** Human label, e.g. "Hall A". */
  name?: string;
  /**
   * Free-text hint: "cinema" | "flight" | "theatre" | "stadium" | "bus" |
   * "train" | "custom". Non-normative; informational only.
   */
  domain?: string;
  /** BCP-47 language tag. Default: "en". */
  locale?: string;
  /**
   * REQUIRED. The one drawing surface every seat, element and section is
   * placed on (§4.5).
   */
  canvas: Canvas;
  /**
   * REQUIRED. A seat's footprint: a square of this side, in canvas units,
   * centred on the seat's `x`/`y` and turned by its rotation (§4.5). Positive.
   * A section MAY override it.
   */
  seatSize: number;
  /** REQUIRED. Vocabulary of seat types used in this map. */
  legend: SeatType[];
  /** Named price tiers, referenced by id. */
  priceTiers?: PriceTier[];
  /** REQUIRED. */
  sections: Section[];
  /** How the whole venue may be booked (§4.12). Default `"seats"`. */
  booking?: BookingMode;
  /** Venue hire: a literal whole price, over `wholePriceTier` (§4.9.1). */
  wholePrice?: Money;
  /** References a `PriceTier.id` for the whole price (§4.9.1). */
  wholePriceTier?: string;
  metadata?: Record<string, unknown>;
}
