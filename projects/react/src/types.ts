import type {
  DisallowedReason,
  KerusiControlStrings,
  KerusiMap,
  KerusiSeatContext,
  KerusiSeatmapColors,
  KerusiSession,
  KerusiState,
  KerusiViewport,
  KerusiViolation,
  RenderSeat,
  SeatAriaStrings,
  SeatRenderStatus,
  SeatStyleFn,
  SeatTypeStyles,
  SelectionSummary,
} from '@kerusiweb/core';
import type { CSSProperties, ReactNode } from 'react';

/** How a document with validation errors is handled. */
export type ValidationMode =
  /** Report through `onValidationIssues` and render anyway. The default. */
  | 'collect'
  /** Throw a `KerusiValidationError` during render, for an error boundary. */
  | 'throw'
  /** Skip validation entirely, for a document validated upstream. */
  | 'off';

/** Per-section rendering overrides, keyed by `Section.id`. */
export interface SectionRenderOptions {
  /** Leaves the section out. Its space on the canvas stays empty (D4). */
  hidden?: boolean;
  /** Overrides the localized `Section.label`. */
  label?: string;
}

/** What a seat event carries. Everything the document knows, already resolved. */
export interface SeatInteraction {
  seat: RenderSeat;
  /** The selection after this event. */
  selection: readonly string[];
  /** Seats whose membership changed, including companions (§4.6). */
  changed: readonly string[];
}

export interface SeatDisallowed {
  seat: RenderSeat;
  reason: DisallowedReason;
}

/**
 * What `renderSeat` is handed for each seat: the seat, whether it is selected,
 * the stock glyph core resolved for it, and the stock drawing itself.
 */
export interface SeatRenderContext extends KerusiSeatContext {
  /**
   * The library's own drawing of this seat, as a fragment. Return it to keep
   * the stock seat, or place it alongside your own marks to add to it.
   */
  defaultContent: ReactNode;
}

/** What a `ref` on `<KerusiSeatmap>` exposes. */
export interface KerusiSeatmapHandle {
  /** The selection's seats and total, resolved against the current documents. */
  readonly summary: SelectionSummary;
  /** Moves DOM focus to a seat, if it is rendered. */
  focusSeat(seatId: string): void;
  /** The current zoom and pan. Fit (`{ zoom: 1, x: 0, y: 0 }`) unless `zoomable`. */
  readonly viewport: KerusiViewport;
  /** Zooms in one step about the centre. No-op unless `zoomable`. */
  zoomIn(): void;
  /** Zooms out one step about the centre. No-op unless `zoomable`. */
  zoomOut(): void;
  /** Back to fit-to-container: the whole canvas. No-op unless `zoomable`. */
  resetZoom(): void;
  /**
   * Zooms to one section: its declared `bounds`, or the box around its seats
   * and elements when it declares none. No-op unless `zoomable`, or for a
   * section that is not rendered.
   */
  zoomToSection(sectionId: string): void;
  /** Whether the map is currently maximized. */
  readonly maximized: boolean;
  /** Maximizes or restores the map. Maximizing needs `maximizable`. */
  toggleMaximized(): void;
}

export interface KerusiSeatmapProps {
  // --- documents ------------------------------------------------------------

  map: KerusiMap;
  state?: KerusiState;
  /** The optional map↔event join (§5.3). Validated against the map and state. */
  session?: KerusiSession;

  // --- selection ------------------------------------------------------------

  /**
   * Selected seat ids. Supply this with `onSelectionChange` to control the
   * selection; omit both — or supply only `defaultSelection` — to let the
   * component own it.
   */
  selection?: readonly string[];
  /** The initial selection when the component owns it. Ignored if `selection` is set. */
  defaultSelection?: readonly string[];
  onSelectionChange?: (selection: readonly string[]) => void;

  // --- localization ---------------------------------------------------------

  /** Overrides `KerusiMap.locale` (BCP-47). */
  locale?: string;
  /** Right-to-left rendering. `auto` derives it from the resolved locale. */
  rtl?: boolean | 'auto';
  /** Overrides the built-in English announcement strings. */
  ariaStrings?: SeatAriaStrings;

  // --- appearance -----------------------------------------------------------

  colors?: KerusiSeatmapColors;
  /** Let an available seat take its `SeatType.color` (§4.7). */
  typeColors?: boolean;
  /**
   * Styles for every seat of a type, keyed by `SeatType.id`: fill, label colour
   * and classes. Never changes a selected or blocked seat's fill. Also shown in
   * the legend.
   */
  seatTypeStyles?: SeatTypeStyles;
  /**
   * A style for one seat, laid over its `seatTypeStyles` entry; return nothing
   * to leave a seat be. Never changes a selected or blocked seat's fill.
   */
  seatStyle?: SeatStyleFn;
  /**
   * Draws the inside of every seat yourself. The library keeps the seat's
   * `<g>`, with its role, ARIA state, tab stop, rotation and event handlers, and
   * renders whatever this returns inside it, in canvas units. Return
   * `ctx.defaultContent` for the stock seat, or add to it. While this is set the
   * library also draws a focus outline over your content, so keyboard focus
   * stays visible whatever you draw.
   */
  renderSeat?: (ctx: SeatRenderContext) => ReactNode;
  /**
   * CSS pixels per canvas unit, at most: the map never draws wider than
   * `canvas.width × unitScale`, and scales down to a narrower container. The
   * document fixes every seat's size and position (§4.5); this is the only
   * sizing control. Default `1`.
   */
  unitScale?: number;
  /**
   * Draws each section's label inside the map, at the top-left of its `bounds`.
   * Only sections that declare `bounds` get one; every section's label is its
   * group's accessible name either way. Default `true`.
   */
  showSectionLabels?: boolean;
  showLegend?: boolean;
  showLegendPrices?: boolean;

  // --- section control ------------------------------------------------------

  /** Render only these sections, in this order. Default: all, by `Section.index`. */
  sectionIds?: readonly string[];
  sectionOverrides?: Readonly<Record<string, SectionRenderOptions>>;

  // --- interaction ----------------------------------------------------------

  /** Statuses in which a seat may be picked. Default: `['available']`. */
  selectableStatuses?: readonly SeatRenderStatus[];
  /** `auto` selects a seat's companion closure together (§4.6). */
  companionMode?: 'auto' | 'independent';
  maxSelection?: number;
  /**
   * A final say on selectability, applied after the status test.
   *
   * Memoize it — an inline arrow rebuilds the whole render model every render.
   */
  seatSelectable?: (seat: RenderSeat) => boolean;
  /** When false the map renders read-only: no pointer or keyboard interaction. */
  interactive?: boolean;
  /**
   * Revert a lapsed `holdExpires` to available on a ticker (§5.1). Off by
   * default — a renderer should stay passive unless asked.
   */
  expireHolds?: boolean;
  expiryIntervalMs?: number;

  // --- zoom, pan and maximize (both opt in) ---------------------------------

  /**
   * Pinch, Ctrl/Cmd + wheel and drag to zoom and pan, `+` `-` `0` on the keyboard,
   * and on-screen buttons. A tap still selects at every zoom level. Default `false`.
   */
  zoomable?: boolean;
  /** The zoom ceiling, relative to fit-to-container. The floor is always fit. Default `4`. */
  maxZoom?: number;
  /**
   * The built-in zoom buttons. Turn this off to supply your own, anywhere on the
   * page, and call `zoomIn()`, `zoomOut()` and `resetZoom()` on a `ref`.
   */
  showZoomControls?: boolean;
  /** A button that maximizes the map to fill the screen. Default `false`. */
  maximizable?: boolean;
  /**
   * Overrides the built-in English names of the zoom and maximize controls.
   *
   * Memoize it — a new object each render rebuilds the controls' strings.
   */
  controlStrings?: Partial<KerusiControlStrings>;

  // --- validation -----------------------------------------------------------

  validate?: ValidationMode;

  // --- events ---------------------------------------------------------------

  onSeatSelect?: (event: SeatInteraction) => void;
  onSeatDeselect?: (event: SeatInteraction) => void;
  onSeatDisallowed?: (event: SeatDisallowed) => void;
  onSeatFocus?: (seat: RenderSeat) => void;
  /** Called whenever the documents change, unless `validate` is `off`. */
  onValidationIssues?: (issues: readonly KerusiViolation[]) => void;
  /** The zoom and pan, whenever they change. For a host that persists or shows them. */
  onViewportChange?: (viewport: KerusiViewport) => void;
  onMaximizedChange?: (maximized: boolean) => void;

  // --- host element ---------------------------------------------------------

  className?: string;
  style?: CSSProperties;
  /** Rendered inside the map's root element, after the map and legend. */
  children?: ReactNode;
}
