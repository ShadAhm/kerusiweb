import {
  canPickSeat,
  DEFAULT_KERUSI_COLORS,
  elementFill,
  elementStyle,
  elementTextFill,
  isWholeUnitControl,
  resolveGroupGlyph,
  resolveSeatGlyph,
  resolveSeatStyle,
  screenPath,
} from '@kerusiweb/core';
import type {
  KerusiSeatmapColors,
  PlacedElement,
  PlacedGroup,
  PlacedSeat,
  PlacedSection,
  SeatGlyph,
  SeatStyleFn,
  SeatTypeStyles,
} from '@kerusiweb/core';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import type { SeatRenderContext } from './types.js';

export interface KerusiSectionProps {
  /** The section with its seats and elements placed on the map's canvas. */
  layout: PlacedSection;
  /** The section's name: its accessible name, and its drawn label when one is shown. */
  label?: string;
  /**
   * Draw `label` inside the SVG, at the top-left of the section's bounds. Only
   * a section that declares `bounds` gets one (D5); otherwise the label is the
   * group's accessible name alone.
   */
  showLabel?: boolean;
  /** Currently selected seat ids. */
  selection?: ReadonlySet<string>;
  /** The seat holding the section's single tab stop, if any. */
  focusedSeatId?: string | null;
  /** Per-seat accessible names, keyed by seat id. */
  ariaLabels?: ReadonlyMap<string, string>;
  /**
   * The name of each whole unit's control, keyed by group id, and the reason it
   * cannot be booked while it cannot (D19).
   */
  wholeUnitLabels?: ReadonlyMap<string, { label: string; reason?: string }>;
  colors?: Required<KerusiSeatmapColors>;
  /** Whether an available seat may take its `SeatType.color` (§4.7). */
  typeColors?: boolean;
  /** Styles for every seat of a type, keyed by `SeatType.id`. */
  seatTypeStyles?: SeatTypeStyles;
  /** A style for one seat, laid over its type's. */
  seatStyle?: SeatStyleFn;
  /** Draws the inside of each seat in place of the stock glyph. */
  renderSeat?: (ctx: SeatRenderContext) => ReactNode;
  /**
   * When false, selection is off: seats render read-only, with no `aria-pressed`
   * once a click behaviour is set. Whether they still respond is `reachable`'s.
   */
  interactive?: boolean;
  /**
   * A click behaviour is configured (`onSeatClick` or a click card). On a
   * read-only map this keeps the seats clickable without turning selection on
   * (D14), so `aria-pressed` is left off.
   */
  clickable?: boolean;
  /**
   * Whether seats take pointer and keyboard interaction at all: they respond,
   * and the section's tab stop is reachable. Defaults to `interactive`.
   */
  reachable?: boolean;
  /** The seat that shows a hover card, and the card's `id`, for `aria-describedby`. */
  describedBy?: { seatId: string; id: string } | null;
  onSeatActivate?: (seatId: string, source: 'pointer') => void;
  onSeatFocused?: (seatId: string) => void;
  /** Present only when a hover card follows keyboard focus (D12). */
  onSeatBlurred?: (seatId: string) => void;
  onSeatKeyDown?: (event: ReactKeyboardEvent<SVGGElement>) => void;
  /** Present only when something listens for hover: `onSeatHover` or a hover card. */
  onSeatPointer?: (type: 'enter' | 'leave' | 'move', seatId: string, pointerType: string) => void;
  /** Called with each seat's `<g>` as it mounts and unmounts, for focus moves. */
  registerSeat?: (seatId: string, node: SVGGElement | null) => void;
  /** The control that shows a hover card, and the card's `id`, for `aria-describedby` (D25). */
  unitDescribedBy?: { groupId: string; id: string } | null;
  /** A whole unit's control was pressed: book or release the group whole (D19). */
  onWholeUnitActivate?: (groupId: string, source: 'pointer') => void;
  onWholeUnitKeyDown?: (groupId: string, event: ReactKeyboardEvent<SVGGElement>) => void;
  /** Present only when a whole-unit hover card is set (D25). */
  onWholeUnitPointer?: (
    type: 'enter' | 'leave' | 'move',
    groupId: string,
    pointerType: string,
  ) => void;
  /** Present only when a whole-unit hover card follows keyboard focus (D12, D25). */
  onWholeUnitFocused?: (groupId: string) => void;
  onWholeUnitBlurred?: (groupId: string) => void;
}

const EMPTY_SELECTION: ReadonlySet<string> = new Set();
const EMPTY_LABELS: ReadonlyMap<string, string> = new Map();
const EMPTY_UNIT_LABELS: ReadonlyMap<string, { label: string; reason?: string }> = new Map();

/**
 * Draws one Kerusi `Section` as a `<g>` on the map's shared canvas (D1).
 *
 * Sections are zones on one canvas in rev 15 (§4.1), and two may sit side by
 * side, so a section is a group inside the map's single `<svg>` rather than an
 * SVG of its own. Render it inside an `<svg>` whose `viewBox` is the canvas.
 *
 * This component holds no state. It takes a placed layout and reports intent.
 */
export function KerusiSection({
  layout,
  label,
  showLabel = true,
  selection = EMPTY_SELECTION,
  focusedSeatId = null,
  ariaLabels = EMPTY_LABELS,
  wholeUnitLabels = EMPTY_UNIT_LABELS,
  colors = DEFAULT_KERUSI_COLORS,
  typeColors = true,
  seatTypeStyles,
  seatStyle,
  renderSeat,
  interactive = true,
  clickable = false,
  reachable = interactive,
  describedBy = null,
  onSeatActivate,
  onSeatFocused,
  onSeatBlurred,
  onSeatKeyDown,
  onSeatPointer,
  registerSeat,
  unitDescribedBy = null,
  onWholeUnitActivate,
  onWholeUnitKeyDown,
  onWholeUnitPointer,
  onWholeUnitFocused,
  onWholeUnitBlurred,
}: KerusiSectionProps) {
  const section = layout.section;
  const anchor = layout.labelAnchor;
  const control = (placed: PlacedGroup) => isWholeUnitControl(placed, interactive);

  const seatNode = (placed: PlacedSeat) => (
    <SectionSeat
      key={placed.seat.id}
      placed={placed}
      selected={selection.has(placed.seat.id)}
      tabStop={placed.seat.id === focusedSeatId}
      ariaLabel={ariaLabels.get(placed.seat.id) ?? placed.seat.label}
      colors={colors}
      typeColors={typeColors}
      seatTypeStyles={seatTypeStyles}
      seatStyle={seatStyle}
      renderSeat={renderSeat}
      interactive={interactive}
      clickable={clickable}
      reachable={reachable}
      describedById={describedBy?.seatId === placed.seat.id ? describedBy.id : undefined}
      onSeatActivate={onSeatActivate}
      onSeatFocused={onSeatFocused}
      onSeatBlurred={onSeatBlurred}
      onSeatKeyDown={onSeatKeyDown}
      onSeatPointer={onSeatPointer}
      registerSeat={registerSeat}
    />
  );

  return (
    <g
      className="kerusi-section"
      role="group"
      aria-label={label ?? section.id}
      data-section-id={section.id}
    >
      {showLabel && label && section.boundsDeclared && (
        /* Hidden from assistive technology: the group already carries the
           same text as its accessible name. */
        <text
          className="kerusi-section-label"
          aria-hidden="true"
          textAnchor="start"
          dominantBaseline="hanging"
          x={anchor.x}
          y={anchor.y}
          fontSize={anchor.fontSize}
          style={{ fill: elementTextFill(elementStyle('label').tone, colors) }}
        >
          {label}
        </text>
      )}

      {/* Elements first, so a screen or stage sits behind the seats it faces. */}
      {layout.elements.map((placed) => (
        <SectionElement key={placed.element.id} placed={placed} colors={colors} />
      ))}

      {/* Group footprints next, still under every seat. They are decoration
          for the eye: hidden from assistive technology, and no pointer target,
          so a press on a tabletop selects nothing (D18). A footprint that books
          its group whole is drawn in the group's wrapper instead. */}
      {layout.groups
        .filter((placed) => !control(placed))
        .map((placed) => (
          <SectionGroup key={placed.group.id} placed={placed} colors={colors} />
        ))}

      {/* A group's seats sit in a role="group" named by its label, so a screen
          reader says which table it is in. An `either` table's shape goes first
          in it, as the control that books the table whole, so it comes before
          its seats in keyboard order (D19). A group with neither has no name to
          give, so its seats are drawn loose, like a seat in no group. */}
      {layout.groups
        .filter((placed) => placed.wrapped)
        .map((placed) => (
          <g
            key={placed.group.id}
            className="kerusi-group-seats"
            role={placed.group.label ? 'group' : undefined}
            aria-label={placed.group.label}
            data-group-id={placed.group.id}
          >
            {control(placed) && (
              <WholeUnitControl
                placed={placed}
                colors={colors}
                selection={selection}
                names={wholeUnitLabels.get(placed.group.id)}
                describedById={
                  unitDescribedBy?.groupId === placed.group.id ? unitDescribedBy.id : undefined
                }
                onActivate={onWholeUnitActivate}
                onKeyDown={onWholeUnitKeyDown}
                onPointer={onWholeUnitPointer}
                onFocused={onWholeUnitFocused}
                onBlurred={onWholeUnitBlurred}
              />
            )}
            {placed.seats.map(seatNode)}
          </g>
        ))}

      {layout.loose.map(seatNode)}
    </g>
  );
}

// --- groups -----------------------------------------------------------------

/** One group's footprint: its outline, then the marks on it. Nothing for a group with no shape. */
function SectionGroup({
  placed,
  colors,
}: {
  placed: PlacedGroup;
  colors: Required<KerusiSeatmapColors>;
}) {
  const glyph = resolveGroupGlyph(placed, colors);
  if (!glyph) return null;
  return (
    <g
      className={glyph.className}
      aria-hidden="true"
      data-group-id={glyph.id}
      data-group-kind={glyph.kind}
      transform={glyph.transform ?? undefined}
    >
      <path
        className="kerusi-group__body"
        d={glyph.body.d}
        style={{ fill: glyph.body.fill, stroke: glyph.body.stroke }}
      />
      {glyph.details.map((detail, i) => (
        <path key={i} className="kerusi-group__detail" d={detail.d} style={{ fill: detail.fill }} />
      ))}
    </g>
  );
}

/**
 * A group's footprint as the control that books it whole (D19): a focusable
 * button, pressed while every seat of the group is selected, and disabled while
 * any of them is taken. Drawn under the group's seats, first in their wrapper.
 * While its hover card shows, it points at the card with `aria-describedby`,
 * as a seat does (D25).
 */
function WholeUnitControl({
  placed,
  colors,
  selection,
  names,
  describedById,
  onActivate,
  onKeyDown,
  onPointer,
  onFocused,
  onBlurred,
}: {
  placed: PlacedGroup;
  colors: Required<KerusiSeatmapColors>;
  selection: ReadonlySet<string>;
  names?: { label: string; reason?: string };
  describedById?: string;
  onActivate?: (groupId: string, source: 'pointer') => void;
  onKeyDown?: (groupId: string, event: ReactKeyboardEvent<SVGGElement>) => void;
  onPointer?: (type: 'enter' | 'leave' | 'move', groupId: string, pointerType: string) => void;
  onFocused?: (groupId: string) => void;
  onBlurred?: (groupId: string) => void;
}) {
  const glyph = resolveGroupGlyph(placed, colors, { selection });
  if (!glyph?.whole) return null;
  return (
    <g
      className={glyph.className}
      role="button"
      tabIndex={0}
      aria-label={names?.label ?? placed.group.label ?? placed.group.id}
      aria-pressed={glyph.whole.selected}
      aria-disabled={!glyph.whole.available}
      aria-description={names?.reason}
      aria-describedby={describedById}
      data-group-id={glyph.id}
      data-group-kind={glyph.kind}
      transform={glyph.transform ?? undefined}
      onClick={() => onActivate?.(glyph.id, 'pointer')}
      onKeyDown={(event) => onKeyDown?.(glyph.id, event)}
      onFocus={onFocused ? () => onFocused(glyph.id) : undefined}
      onBlur={onBlurred ? () => onBlurred(glyph.id) : undefined}
      onPointerEnter={
        onPointer ? (event) => onPointer('enter', glyph.id, event.pointerType) : undefined
      }
      onPointerMove={
        onPointer ? (event) => onPointer('move', glyph.id, event.pointerType) : undefined
      }
      onPointerLeave={
        onPointer ? (event) => onPointer('leave', glyph.id, event.pointerType) : undefined
      }
    >
      <path
        className="kerusi-group__body"
        d={glyph.body.d}
        style={{ fill: glyph.body.fill, stroke: glyph.body.stroke }}
      />
      {glyph.details.map((detail, i) => (
        <path key={i} className="kerusi-group__detail" d={detail.d} style={{ fill: detail.fill }} />
      ))}
      {/* Only visible on :focus-visible: the body's own stroke is bound inline,
          so the ring needs a path of its own for the stylesheet to paint. */}
      <path className="kerusi-group__focus" d={glyph.body.d} />
    </g>
  );
}

// --- seats ------------------------------------------------------------------

interface SeatProps {
  placed: PlacedSeat;
  selected: boolean;
  tabStop: boolean;
  ariaLabel: string;
  colors: Required<KerusiSeatmapColors>;
  typeColors: boolean;
  seatTypeStyles?: SeatTypeStyles;
  seatStyle?: SeatStyleFn;
  renderSeat?: (ctx: SeatRenderContext) => ReactNode;
  interactive: boolean;
  clickable: boolean;
  reachable: boolean;
  describedById?: string;
  onSeatActivate?: (seatId: string, source: 'pointer') => void;
  onSeatFocused?: (seatId: string) => void;
  onSeatBlurred?: (seatId: string) => void;
  onSeatKeyDown?: (event: ReactKeyboardEvent<SVGGElement>) => void;
  onSeatPointer?: (type: 'enter' | 'leave' | 'move', seatId: string, pointerType: string) => void;
  registerSeat?: (seatId: string, node: SVGGElement | null) => void;
}

function SectionSeat({
  placed,
  selected,
  tabStop,
  ariaLabel,
  colors,
  typeColors,
  seatTypeStyles,
  seatStyle,
  renderSeat,
  interactive,
  clickable,
  reachable,
  describedById,
  onSeatActivate,
  onSeatFocused,
  onSeatBlurred,
  onSeatKeyDown,
  onSeatPointer,
  registerSeat,
}: SeatProps) {
  const seat = placed.seat;
  const style = resolveSeatStyle(seat, selected, seatTypeStyles, seatStyle);
  const glyph = resolveSeatGlyph(placed, selected, colors, typeColors, style);
  const stock = <SeatGlyphMarks glyph={glyph} />;

  return (
    <g
      ref={(node: SVGGElement | null) => {
        registerSeat?.(seat.id, node);
      }}
      className={glyph.className}
      role="button"
      tabIndex={reachable && tabStop ? 0 : -1}
      aria-label={ariaLabel}
      /* A read-only map that still takes clicks does not toggle, so it does not
         claim to be a toggle button (D14). */
      aria-pressed={!interactive && clickable ? undefined : selected}
      /* Disabled too when another seat of its booking unit is taken (§4.12.3). */
      aria-disabled={!canPickSeat(seat)}
      aria-describedby={describedById}
      data-seat-id={seat.id}
      data-seat-type={glyph.data.type}
      data-seat-status={glyph.data.status}
      data-section-id={glyph.data.section}
      data-seat-row={glyph.data.row}
      data-seat-attributes={glyph.data.attributes}
      transform={transform(placed) ?? undefined}
      onClick={reachable ? () => onSeatActivate?.(seat.id, 'pointer') : undefined}
      onFocus={reachable ? () => onSeatFocused?.(seat.id) : undefined}
      onBlur={reachable && onSeatBlurred ? () => onSeatBlurred(seat.id) : undefined}
      onKeyDown={reachable ? onSeatKeyDown : undefined}
      onPointerEnter={
        onSeatPointer ? (e) => onSeatPointer('enter', seat.id, e.pointerType) : undefined
      }
      onPointerLeave={
        onSeatPointer ? (e) => onSeatPointer('leave', seat.id, e.pointerType) : undefined
      }
      onPointerMove={
        onSeatPointer ? (e) => onSeatPointer('move', seat.id, e.pointerType) : undefined
      }
    >
      {renderSeat ? (
        <>
          {renderSeat({ placed, seat, selected, glyph, defaultContent: stock })}
          {/* Drawn over the custom content, because that content may have no
              `.kerusi-seat__box` for the stock focus ring to stroke. Only
              visible on :focus-visible. */}
          <path className="kerusi-seat__focus" d={glyph.body.d} />
        </>
      ) : (
        stock
      )}
    </g>
  );
}

/**
 * The stock seat drawing, from a glyph core has already resolved. A fragment,
 * so it adds no node of its own inside the seat's `<g>`.
 */
function SeatGlyphMarks({ glyph }: { glyph: SeatGlyph }) {
  const { body, wash, core, occupant, label, wheelchair } = glyph;
  return (
    <>
      {/* Tapered toward the back, square at the front, so which way the seat
          faces is legible from the outline alone. */}
      <path className="kerusi-seat__box" d={body.d} style={{ fill: body.fill }} />
      {wash && (
        /* Colour stays the seat type's; a taken seat recedes under a wash
           instead, so the type colour still reads on a busy map. */
        <path className="kerusi-seat__wash" d={wash.d} style={{ fill: wash.fill }} />
      )}
      {core && (
        /* Selection is the one state drawn from two tones: the body above is
           the frame, this is the bright core inside it. Whichever way the host
           page is themed, one of the two separates from it — which is why
           nothing here has to know about the page. */
        <path className="kerusi-seat__core" d={core.d} style={{ fill: core.fill }} />
      )}
      {occupant && (
        /* Deliberately not counter-rotated: the occupant leans with the seat.
           Solid = settled (yours, or sold); hollow = a hold still in progress. */
        <path
          className={`kerusi-seat__occupant kerusi-seat__occupant--${occupant.variant}`}
          d={occupant.d}
          strokeWidth={occupant.strokeWidth}
          style={{ fill: occupant.fill, stroke: occupant.stroke }}
        />
      )}
      <text
        className="kerusi-seat__label"
        textAnchor="middle"
        dominantBaseline="central"
        x={label.x}
        y={label.y}
        fontSize={label.fontSize}
        /* The halo is painted under the glyphs via `paint-order`. Bound here
           rather than in the stylesheet on purpose: a CSS
           `var(--kerusi-selected-fg, …)` rule would carry the library default
           as its fallback and silently skip the `colors` prop tier, which only
           this side can resolve. */
        style={{ fill: label.fill, stroke: label.halo }}
        strokeWidth={label.haloWidth}
        transform={label.transform ?? undefined}
      >
        {label.text}
      </text>
      {wheelchair && (
        /* A corner marker, not a different fill: availability owns the fill. */
        <circle
          className="kerusi-seat__wheelchair"
          cx={wheelchair.cx}
          cy={wheelchair.cy}
          r={wheelchair.r}
          style={{ fill: wheelchair.fill }}
        />
      )}
    </>
  );
}

// --- elements ---------------------------------------------------------------

function SectionElement({
  placed,
  colors,
}: {
  placed: PlacedElement;
  colors: Required<KerusiSeatmapColors>;
}) {
  const style = elementStyle(placed.element.kind);
  const fill = elementFill(style.tone, colors);
  const textFill = elementTextFill(style.tone, colors);

  if (style.shape === 'text') {
    // Only the label: no box. The <g> rotation turns the text itself, so unlike
    // a label on a shape it is not counter-rotated. With no label there is
    // nothing to draw, rather than an empty box.
    if (!placed.element.label || !style.showLabel) return null;
    return (
      <g
        className={`kerusi-element kerusi-element--${placed.element.kind}`}
        transform={transform(placed) ?? undefined}
      >
        <text
          className="kerusi-element__label"
          textAnchor="middle"
          dominantBaseline="central"
          x={placed.centerX}
          y={placed.centerY}
          fontSize={placed.fontSize}
          style={{ fill: textFill }}
        >
          {placed.element.label}
        </text>
      </g>
    );
  }

  return (
    <g
      className={`kerusi-element kerusi-element--${placed.element.kind}`}
      transform={transform(placed) ?? undefined}
    >
      {style.shape === 'screen' ? (
        <path d={screenPath(placed.x, placed.y, placed.width, placed.height)} style={{ fill }} />
      ) : style.shape === 'void' ? (
        <rect
          className="kerusi-element__void"
          x={placed.x}
          y={placed.y}
          width={placed.width}
          height={placed.height}
          style={{ stroke: textFill }}
          fill="none"
        />
      ) : (
        <rect
          x={placed.x}
          y={placed.y}
          width={placed.width}
          height={placed.height}
          /* A stage reads as squarer than an ordinary element. */
          rx={style.shape === 'stage' ? 2 : Math.min(placed.height * 0.25, 6)}
          style={{ fill }}
        />
      )}
      {placed.element.label && style.showLabel && (
        <text
          className="kerusi-element__label"
          textAnchor="middle"
          dominantBaseline="central"
          x={placed.centerX}
          y={placed.centerY}
          fontSize={placed.fontSize}
          style={{ fill: textFill }}
          transform={counterRotate(placed) ?? undefined}
        >
          {placed.element.label}
        </text>
      )}
    </g>
  );
}

/** SVG rotate() about the item's center; null when it does not rotate. */
function transform(item: PlacedSeat | PlacedElement): string | null {
  return item.rotation ? `rotate(${item.rotation} ${item.centerX} ${item.centerY})` : null;
}

/** Cancels the parent <g>'s rotation so the label stays upright and stays put. */
function counterRotate(item: PlacedSeat | PlacedElement): string | null {
  return item.rotation ? `rotate(${-item.rotation} ${item.centerX} ${item.centerY})` : null;
}
