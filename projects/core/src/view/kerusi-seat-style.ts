import { RenderSeat } from '../render/render-model.js';

/**
 * Per-seat styling from code: the TypeScript counterpart of the
 * `--kerusi-seat-fill` / `--kerusi-seat-label` tokens, for when the decision
 * lives in the application (a recommendation, a search result, the document's
 * own `Seat.metadata`) rather than in a stylesheet.
 *
 * A style is an *identity* colour, exactly like `SeatType.color`, and it takes
 * the same slot. It never replaces the selected or blocked treatment, and a held
 * or booked seat keeps its wash and occupant figure over it, so status is still
 * read from shape (decision D4 in #26). A future `states` field is where a
 * per-status override would go, if a real need for one appears.
 */
export interface KerusiSeatStyle {
  /**
   * The seat's own colour, in place of its `SeatType.color` or `availableBg`.
   * Never applied to a selected or blocked seat. Any CSS colour works; a
   * stylesheet's `--kerusi-seat-fill` still wins over it.
   */
  fill?: string;
  /**
   * The number's colour on that fill. When omitted, a hex `fill` gets black or
   * white, whichever reads better; any other `fill` (a `var()`, `hsl()`) falls
   * back to `availableFg`, so set this alongside it.
   */
  labelColor?: string;
  /** Extra classes on the seat's `<g>`, for CSS that needs more than colour. */
  className?: string | readonly string[];
}

/** Styles keyed by `SeatType.id`, for the `seatTypeStyles` input/prop. */
export type SeatTypeStyles = Readonly<Record<string, KerusiSeatStyle>>;

/**
 * The `seatStyle` input/prop: a style for one seat, or nothing to leave it be.
 * Called for every seat whenever the selection, state or theme changes.
 */
export type SeatStyleFn = (
  seat: RenderSeat,
  ctx: { selected: boolean },
) => KerusiSeatStyle | null | undefined;

/**
 * The style a seat is drawn with: its type's entry in `typeStyles`, with the
 * per-seat `fn` result laid over it field by field. Classes from both are kept.
 * `undefined` when neither has anything to say.
 *
 * `typeStyles` applies whether or not `typeColors` is on: that flag governs the
 * document's own `SeatType.color`, while a type style is the application's
 * explicit choice.
 */
export function resolveSeatStyle(
  seat: RenderSeat,
  selected: boolean,
  typeStyles?: SeatTypeStyles,
  fn?: SeatStyleFn,
): KerusiSeatStyle | undefined {
  const byType = typeStyles?.[seat.type.id];
  const bySeat = fn?.(seat, { selected }) ?? undefined;
  if (!byType && !bySeat) {
    return undefined;
  }
  const classes = [...classList(byType?.className), ...classList(bySeat?.className)];
  return {
    fill: bySeat?.fill ?? byType?.fill,
    labelColor: bySeat?.labelColor ?? byType?.labelColor,
    className: classes.length ? classes : undefined,
  };
}

/** A `className` as a flat list of non-empty class names. */
export function classList(className: string | readonly string[] | undefined): string[] {
  if (!className) {
    return [];
  }
  const parts = typeof className === 'string' ? [className] : className;
  return parts.flatMap((part) => part.split(/\s+/)).filter(Boolean);
}
