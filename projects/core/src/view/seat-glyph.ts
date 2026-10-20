import { RenderSeat } from '../render/render-model.js';
import {
  SeatBox,
  seatMarkerAnchor,
  seatOccupantPath,
  seatOccupantStroke,
  seatFormShape,
  seatSelectedFrame,
  seatShapePath,
} from '../render/seat-shapes.js';
import { PlacedSeat } from '../render/map-layout.js';
import { classList, KerusiSeatStyle } from './kerusi-seat-style.js';
import { canPickSeat } from './selection.js';
import {
  KerusiSeatmapColors,
  occupantFillFor,
  occupantStrokeFor,
  SeatOccupantVariant,
  seatCoreFill,
  seatFill,
  seatOccupantVariant,
  seatTextFill,
  seatWashFill,
} from './kerusi-seatmap-colors.js';

/**
 * The seat glyph, resolved: every path, paint and position a binding draws
 * inside one seat's `<g>`.
 *
 * Both bindings used to call the paint and shape functions one by one, and each
 * kept its own copy of the "mark box" rule below. That is exactly the code the
 * architecture says belongs in core, so it lives here now and a binding only
 * binds the result. It is also what a custom seat template receives, so a
 * consumer drawing their own seat can reuse the library's paths and colours
 * rather than re-derive them.
 */

/** A filled path. */
export interface SeatGlyphShape {
  /** The path's `d` attribute. */
  d: string;
  /** A CSS paint, usually a `var(--kerusi-*, …)` with the resolved fallback. */
  fill: string;
}

export interface SeatGlyph {
  /** `null` for an available or blocked seat: nothing to mark. */
  variant: SeatOccupantVariant | null;
  /** The classes for the seat's `<g>`: `kerusi-seat`, its status, and the modifiers. */
  className: string;
  /**
   * The `data-*` attributes for the seat's `<g>`, so CSS can pick seats out by
   * what the document says about them. An absent field is not rendered.
   */
  data: SeatDataAttributes;
  /** The seat's own placed box. */
  box: SeatBox;
  /**
   * The box the decorative marks sit on: the seat's own, or the selected core's
   * when it is selected. See {@link resolveSeatGlyph}.
   */
  markBox: SeatBox;
  /**
   * The outline: by default square-ish at the front and tapered at the back, so
   * facing reads from the shape; otherwise the seat style's `shape`.
   */
  body: SeatGlyphShape;
  /** The dimming wash over a held or booked seat; absent otherwise. */
  wash?: SeatGlyphShape;
  /** The bright plate inside a selected seat's frame; absent otherwise. */
  core?: SeatGlyphShape;
  /** The occupant figure for a selected, held or booked seat; absent otherwise. */
  occupant?: SeatGlyphShape & {
    variant: SeatOccupantVariant;
    /** `none` except for the hollow held figure. */
    stroke: string;
    strokeWidth: number;
  };
  /** The seat number, centred on the seat and kept upright. */
  label: {
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fill: string;
    /** A core-coloured halo behind a selected seat's number; `none` otherwise. */
    halo: string;
    haloWidth: number;
    /** Cancels the seat's rotation; `null` when the seat does not rotate. */
    transform: string | null;
  };
  /** The corner marker for `accessibility.wheelchairAccessible`; absent otherwise. */
  wheelchair?: { cx: number; cy: number; r: number; fill: string };
}

/** See {@link SeatGlyph.data}. Each field is bound as the attribute named beside it. */
export interface SeatDataAttributes {
  /** `data-seat-type`: `Seat.type`. */
  type: string;
  /** `data-seat-status`: the merged availability, same as the status class. */
  status: string;
  /** `data-section-id`: the section the seat belongs to. */
  section: string;
  /** `data-seat-row`: `Seat.row`, when the seat names one. */
  row?: string;
  /**
   * `data-seat-attributes`: `Seat.attributes`, space-separated, when there are
   * any, so `[data-seat-attributes~="aisle"]` matches one tag among several.
   */
  attributes?: string;
}

/**
 * What a custom seat template is handed: the seat, whether it is selected, and
 * the stock glyph already resolved for it. Each binding extends this with a
 * framework-native way to draw the stock glyph (`defaultContent`).
 */
export interface KerusiSeatContext {
  /** The seat as placed in its section, in viewBox units. */
  placed: PlacedSeat;
  /** The resolved seat: status, type, price, accessibility, `source.metadata`. */
  seat: RenderSeat;
  /** Whether the seat is in the current selection. */
  selected: boolean;
  /** The stock glyph's paths and paints, for reuse. */
  glyph: SeatGlyph;
}

/**
 * Resolves the stock glyph for one placed seat.
 *
 * Everything over a selected seat sits on its core, so every mark is measured
 * from the core's box rather than the seat's. Drawing to the seat's box leaves
 * the occupant's hips crossing the frame, where a figure tinted `selectedBg`
 * lands on a frame filled `selectedBg` and reads as a hard nub. Because the core
 * is an exact scaled copy of the body (see `seatSelectedFrame`), measuring from
 * it keeps every clearance a mark had against the body, so the frame width stays
 * free to change. *
 * `style` is the seat's resolved `seatStyle` / `seatTypeStyles` entry (see
 * `resolveSeatStyle`). It changes the seat's own colour, label colour and
 * classes; it never changes a selected or blocked seat's fill.
 */
export function resolveSeatGlyph(
  placed: PlacedSeat,
  selected: boolean,
  colors: Required<KerusiSeatmapColors>,
  typeColors: boolean,
  style?: KerusiSeatStyle,
): SeatGlyph {
  const seat = placed.seat;
  const variant = seatOccupantVariant(seat, selected);
  const box: SeatBox = {
    x: placed.x,
    y: placed.y,
    width: placed.width,
    height: placed.height,
  };
  const markBox = selected ? coreBox(box) : box;
  // The app has the last word: its shape beats the document's form (D17).
  const shape = style?.shape ?? seatFormShape(seat.type.form);
  const bodyD = seatShapePath(shape, box.x, box.y, box.width, box.height);
  const anchor = seatMarkerAnchor(shape);
  const textFill = seatTextFill(seat, selected, colors, typeColors, style);

  return {
    variant,
    className: seatClassName(seat, selected, style?.className),
    data: seatDataAttributes(seat),
    box,
    markBox,
    body: { d: bodyD, fill: seatFill(seat, selected, colors, typeColors, style) },
    wash:
      variant === 'held' || variant === 'booked'
        ? { d: bodyD, fill: seatWashFill(variant, colors) }
        : undefined,
    core: selected
      ? {
          d: seatShapePath(shape, markBox.x, markBox.y, markBox.width, markBox.height),
          fill: seatCoreFill(colors),
        }
      : undefined,
    occupant: variant
      ? {
          variant,
          d: seatOccupantPath(markBox.x, markBox.y, markBox.width, markBox.height),
          fill: occupantFillFor(variant, colors),
          stroke: occupantStrokeFor(variant, colors),
          strokeWidth: seatOccupantStroke(markBox.width, markBox.height),
        }
      : undefined,
    label: {
      text: seat.label,
      x: placed.centerX,
      y: placed.centerY,
      fontSize: placed.fontSize,
      fill: textFill,
      // The label is centred on the occupant's shoulder line, so without the
      // halo a selected seat's number is `selectedBg` over a `selectedBg`
      // silhouette. It also rescues a label too long for the core.
      halo: selected ? seatCoreFill(colors) : 'none',
      haloWidth: selected ? placed.fontSize * 0.22 : 0,
      transform: placed.rotation
        ? `rotate(${-placed.rotation} ${placed.centerX} ${placed.centerY})`
        : null,
    },
    // The marker keeps the same relative corner on whichever box it sits on, so
    // a selected seat's dot stays whole instead of being bitten off by the frame.
    wheelchair: seat.accessibility?.wheelchairAccessible
      ? {
          cx: markBox.x + markBox.width * anchor.x,
          cy: markBox.y + markBox.height * anchor.y,
          r: markBox.width * 0.13,
          fill: textFill,
        }
      : undefined,
  };
}

/**
 * The outline for a legend type swatch drawn in its type's `shape`, or in the
 * outline its document `form` gives (D17), on a `size`-square box. `undefined`
 * keeps the flat square swatch: a type with no shape, or the default `'seat'`,
 * has nothing a square does not already say.
 *
 * Pass the legend entry's `form` so the legend shows what the map shows: a
 * customer who reads "Armchair" in the legend should find an armchair on the map.
 */
export function legendSwatchPath(
  typeStyle: KerusiSeatStyle | undefined,
  size: number,
  form?: string,
): string | undefined {
  const shape = typeStyle?.shape ?? seatFormShape(form);
  return shape && shape !== 'seat' ? seatShapePath(shape, 0, 0, size, size) : undefined;
}

/** The selected core's box: the seat's, inset by the frame width on every side. */
function coreBox(box: SeatBox): SeatBox {
  const frame = seatSelectedFrame(box.width, box.height);
  return {
    x: box.x + frame,
    y: box.y + frame,
    width: box.width - frame * 2,
    height: box.height - frame * 2,
  };
}

/** The `data-*` attributes for a seat's `<g>`; see {@link SeatDataAttributes}. */
export function seatDataAttributes(seat: RenderSeat): SeatDataAttributes {
  return {
    type: seat.type.id,
    status: seat.status,
    section: seat.sectionId,
    row: seat.row || undefined,
    attributes: seat.attributes.length ? seat.attributes.join(' ') : undefined,
  };
}

/**
 * The class list for a seat's `<g>`: the hooks the READMEs document, then any
 * `extra` classes from the seat's style.
 */
export function seatClassName(
  seat: RenderSeat,
  selected: boolean,
  extra?: string | readonly string[],
): string {
  return [
    'kerusi-seat',
    `kerusi-seat--${seat.status}`,
    selected ? 'kerusi-seat--selected' : '',
    canPickSeat(seat) ? '' : 'kerusi-seat--unselectable',
    // Available, but another seat of its booking unit is taken (§4.12.3).
    seat.selectable && seat.unitBlocked ? 'kerusi-seat--unit-blocked' : '',
    seat.accessibility?.wheelchairAccessible ? 'kerusi-seat--wheelchair' : '',
    seat.unit.seatIds.length > 1 ? 'kerusi-seat--unit' : '',
    ...classList(extra),
  ]
    .filter(Boolean)
    .join(' ');
}
