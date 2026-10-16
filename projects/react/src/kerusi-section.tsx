import {
  cssVar,
  DEFAULT_KERUSI_COLORS,
  elementFill,
  elementStyle,
  elementTextFill,
  resolveSeatGlyph,
  resolveSeatStyle,
  screenPath,
} from '@kerusiweb/core';
import type {
  KerusiSeatmapColors,
  PlacedElement,
  PlacedSeat,
  RenderSection,
  SeatGlyph,
  SeatStyleFn,
  SeatTypeStyles,
  SectionLayout,
} from '@kerusiweb/core';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import type { SeatRenderContext } from './types.js';

export interface KerusiSectionProps {
  section: RenderSection;
  layout: SectionLayout;
  /** Currently selected seat ids. */
  selection?: ReadonlySet<string>;
  /** The seat holding the section's single tab stop, if any. */
  focusedSeatId?: string | null;
  /** Per-seat accessible names, keyed by seat id. */
  ariaLabels?: ReadonlyMap<string, string>;
  colors?: Required<KerusiSeatmapColors>;
  /** Whether an available seat may take its `SeatType.color` (§4.7). */
  typeColors?: boolean;
  /** Styles for every seat of a type, keyed by `SeatType.id`. */
  seatTypeStyles?: SeatTypeStyles;
  /** A style for one seat, laid over its type's. */
  seatStyle?: SeatStyleFn;
  /** Draws the inside of each seat in place of the stock glyph. */
  renderSeat?: (ctx: SeatRenderContext) => ReactNode;
  /** When false, seats render but do not respond to pointer or keyboard. */
  interactive?: boolean;
  /**
   * CSS pixels per viewBox unit, at the section's natural size.
   *
   * Without a cap every section stretches to the full container width, so in a
   * four-tier theatre the narrow box row would draw seats several times the
   * size of the orchestra's. Capping each section at its own intrinsic width
   * keeps a seat the same size everywhere; a section too wide to fit still
   * scales down to the container.
   */
  unitScale?: number;
  onSeatActivate?: (seatId: string) => void;
  onSeatFocused?: (seatId: string) => void;
  onSeatKeyDown?: (event: ReactKeyboardEvent<SVGGElement>) => void;
  /** Called with each seat's `<g>` as it mounts and unmounts, for focus moves. */
  registerSeat?: (seatId: string, node: SVGGElement | null) => void;
}

const EMPTY_SELECTION: ReadonlySet<string> = new Set();
const EMPTY_LABELS: ReadonlyMap<string, string> = new Map();

/**
 * Draws one Kerusi `Section` as a single `<svg>`.
 *
 * One SVG per section — rather than section groups inside a shared canvas — is
 * what makes per-section `aspectRatio` and mixed grid/freeform modes work: each
 * gets its own `viewBox` and its own intrinsic proportions, and CSS is free to
 * stack, wrap or column them. It also puts the section heading in real DOM,
 * where a screen reader can use it as a landmark.
 *
 * This component holds no state. It takes a placed layout and reports intent.
 */
export function KerusiSection({
  layout,
  selection = EMPTY_SELECTION,
  focusedSeatId = null,
  ariaLabels = EMPTY_LABELS,
  colors = DEFAULT_KERUSI_COLORS,
  typeColors = true,
  seatTypeStyles,
  seatStyle,
  renderSeat,
  interactive = true,
  unitScale = 1,
  onSeatActivate,
  onSeatFocused,
  onSeatKeyDown,
  registerSeat,
}: KerusiSectionProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="kerusi-section-svg"
      role="presentation"
      focusable="false"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMid meet"
      style={
        {
          // The focus ring's middle tier: the stylesheet reads this property,
          // so the `colors` prop can reach a rule it cannot otherwise see.
          '--kerusi-focus-ring-input': colors.focusRing,
          // The section's natural width in CSS pixels; it never draws wider.
          maxWidth: layout.width * unitScale,
        } as CSSProperties
      }
    >
      <rect
        x={0}
        y={0}
        width={layout.width}
        height={layout.height}
        style={{ fill: cssVar('backdrop', colors.backdrop) }}
      />

      {/* Elements first, so a screen or stage sits behind the seats it faces. */}
      {layout.elements.map((placed) => (
        <SectionElement key={placed.element.id} placed={placed} colors={colors} />
      ))}

      {layout.seats.map((placed) => (
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
          onSeatActivate={onSeatActivate}
          onSeatFocused={onSeatFocused}
          onSeatKeyDown={onSeatKeyDown}
          registerSeat={registerSeat}
        />
      ))}
    </svg>
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
  onSeatActivate?: (seatId: string) => void;
  onSeatFocused?: (seatId: string) => void;
  onSeatKeyDown?: (event: ReactKeyboardEvent<SVGGElement>) => void;
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
  onSeatActivate,
  onSeatFocused,
  onSeatKeyDown,
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
      tabIndex={interactive && tabStop ? 0 : -1}
      aria-label={ariaLabel}
      aria-pressed={selected}
      aria-disabled={!seat.selectable}
      data-seat-id={seat.id}
      data-seat-type={glyph.data.type}
      data-seat-status={glyph.data.status}
      data-section-id={glyph.data.section}
      data-seat-row={glyph.data.row}
      data-seat-attributes={glyph.data.attributes}
      transform={transform(placed) ?? undefined}
      onClick={interactive ? () => onSeatActivate?.(seat.id) : undefined}
      onFocus={interactive ? () => onSeatFocused?.(seat.id) : undefined}
      onKeyDown={interactive ? onSeatKeyDown : undefined}
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
