import type { RenderSeat } from '../render/render-model.js';
import { seatDataAttributes } from './seat-glyph.js';

/**
 * The vocabulary of seat hover and click, shared by both bindings.
 *
 * Hover and click are independent and optional (D10): a binding reports them as
 * events, and can also show a card anchored to the seat on either one. What a
 * card says is the consumer's; this module only names the pieces.
 */

/** Which side of the seat a card sits on. */
export type SeatCardSide = 'top' | 'bottom' | 'left' | 'right';

/** The side a card prefers. `auto` takes whichever side has the most room. */
export type SeatCardPlacement = SeatCardSide | 'auto';

/**
 * What opened a card. `focus` only occurs with `hoverCardOnFocus` (D12).
 */
export type SeatCardTrigger = 'hover' | 'focus' | 'click';

/**
 * `default` draws the library's plain look; `none` drops the background, border,
 * padding, shadow and arrow, leaving only positioning (D11).
 */
export type SeatCardAppearance = 'default' | 'none';

/** What activated a seat. */
export type SeatClickSource = 'pointer' | 'keyboard';

/**
 * What `onSeatClick` / `seatClick` reports (D13). A read-only notification: it
 * cannot cancel or change what the click does.
 */
export interface SeatClick {
  seat: RenderSeat;
  /** Whether the seat was selected before this click. */
  selected: boolean;
  /** What activated it: a pointer click or tap, or Enter/Space on a focused seat. */
  source: SeatClickSource;
}

/** What a card's content is handed. */
export interface KerusiSeatCardContext {
  /** Everything the document knows about the seat, already resolved. */
  seat: RenderSeat;
  /** Whether the seat is in the current selection. */
  selected: boolean;
  /** What opened the card. */
  trigger: SeatCardTrigger;
  /** Closes the card. Most useful for a click card's own buttons. */
  close: () => void;
}

/** Milliseconds before a hover card opens and, after the pointer leaves, closes. */
export interface HoverCardDelay {
  open: number;
  close: number;
}

export const DEFAULT_HOVER_CARD_DELAY: Readonly<HoverCardDelay> = Object.freeze({
  open: 150,
  close: 100,
});

/** Fills in whichever half of the delay the caller left out; negatives become 0. */
export function resolveHoverCardDelay(delay?: Partial<HoverCardDelay>): HoverCardDelay {
  const pick = (value: number | undefined, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
  return {
    open: pick(delay?.open, DEFAULT_HOVER_CARD_DELAY.open),
    close: pick(delay?.close, DEFAULT_HOVER_CARD_DELAY.close),
  };
}

/** The pointer types that can hover. Touch has no hover (D10). */
export function canHover(pointerType: string | undefined): boolean {
  return pointerType === 'mouse' || pointerType === 'pen';
}

/**
 * The id a card element carries, from a per-map-instance prefix. A seat points
 * at its hover card with `aria-describedby`; a click card is labelled by the seat
 * through its own `aria-label`, so the id there is only a stable hook.
 */
export function seatCardId(prefix: string, kind: 'hover' | 'click'): string {
  return `${prefix}-seat-card-${kind}`;
}

/** The `data-*` attributes a card mirrors from its seat, so CSS can pick cards out by seat. */
export interface SeatCardDataAttributes {
  'data-seat-id': string;
  'data-seat-status': string;
  'data-seat-type': string;
  'data-section-id': string;
}

export function seatCardDataAttributes(seat: RenderSeat): SeatCardDataAttributes {
  const data = seatDataAttributes(seat);
  return {
    'data-seat-id': seat.id,
    'data-seat-status': data.status,
    'data-seat-type': data.type,
    'data-section-id': data.section,
  };
}

/** The class list for a card element: the hooks, then the consumer's own. */
export function seatCardClassName(
  trigger: 'hover' | 'click',
  appearance: SeatCardAppearance,
  extra?: string,
): string {
  return [
    'kerusi-seat-card',
    `kerusi-seat-card--${trigger}`,
    appearance === 'none' ? 'kerusi-seat-card--bare' : '',
    extra ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * A CSS length as pixels, for the two tokens placement needs as numbers
 * (`--kerusi-seat-card-offset`, `--kerusi-seat-card-arrow-size`).
 *
 * Reads `px`, `rem`, `em` and unitless numbers; anything else (a `calc()`, a
 * percentage, an unset property) yields `fallback`.
 */
export function cssLengthToPx(
  value: string | null | undefined,
  fallback: number,
  fontSizes: { root?: number; element?: number } = {},
): number {
  const match = /^\s*(-?\d*\.?\d+)\s*(px|rem|em)?\s*$/i.exec(value ?? '');
  if (!match) {
    return fallback;
  }
  const amount = Number(match[1]);
  switch ((match[2] ?? 'px').toLowerCase()) {
    case 'rem':
      return amount * (fontSizes.root ?? 16);
    case 'em':
      return amount * (fontSizes.element ?? fontSizes.root ?? 16);
    default:
      return amount;
  }
}
