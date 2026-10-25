import { canHover, type HoverCardDelay, wholeUnitOfHoverKey } from './seat-card.js';

/**
 * Seat hover as a reducer, the way `reduceGesture()` does pan and pinch.
 *
 * A binding feeds in what the pointer, the keyboard and its timers did, and
 * applies what comes back: the seat to report to `onSeatHover` / `seatHover`,
 * which hover card should be showing, and the one timer it should be running.
 * The rules live here, once, so the two bindings cannot drift apart (D10):
 *
 * - Only a mouse or a pen hovers. Touch has no hover, and a tap stays a tap.
 * - The seat is reported once on entry and once, as `null`, on leave. Moving
 *   within a seat reports nothing.
 * - While the map is panned or zoomed the hover is cleared once. It resumes on
 *   the first pointer move after the gesture ends, not before.
 * - A hover card opens after `delay.open`, stays while the pointer is on the
 *   seat or on the card (WCAG 1.4.13 "hoverable"), and closes `delay.close`
 *   after the pointer leaves both. `Escape` dismisses it, and it stays dismissed
 *   until the pointer or focus has left that seat (WCAG 1.4.13 "dismissible").
 * - Keyboard focus shows the card only when the binding feeds `focus` events,
 *   which it does only with `hoverCardOnFocus` (D12).
 * - A whole unit's control, such as a tabletop, is fed by its
 *   `wholeUnitHoverKey()` in place of a seat id, so its card follows the same
 *   rules and only one card shows at a time (D25). `report` stays about seats:
 *   the pointer on a control is reported as on no seat.
 */

export interface SeatHoverState {
  /** The seat the pointer is over, as last reported. */
  readonly hoveredId: string | null;
  /** True from the start of a pan or zoom until the next pointer move. */
  readonly suppressed: boolean;
  /** The seat whose hover card is showing. */
  readonly cardId: string | null;
  /** Why the card is showing. */
  readonly cardTrigger: 'hover' | 'focus' | null;
  /** The seat a running open timer will show a card for. */
  readonly pendingId: string | null;
  /** True while a close timer is running. */
  readonly closing: boolean;
  /** True while the pointer is on the card itself. */
  readonly overCard: boolean;
  /** The seat the focus is on, when focus is being followed. */
  readonly focusedId: string | null;
  /** A seat whose card `Escape` dismissed, until the pointer and focus leave it. */
  readonly dismissedId: string | null;
}

export const IDLE_SEAT_HOVER: SeatHoverState = Object.freeze({
  hoveredId: null,
  suppressed: false,
  cardId: null,
  cardTrigger: null,
  pendingId: null,
  closing: false,
  overCard: false,
  focusedId: null,
  dismissedId: null,
});

export type SeatHoverEvent =
  | { type: 'enter' | 'move'; seatId: string; pointerType: string }
  | { type: 'leave'; seatId: string; pointerType: string }
  /** A pan, pinch or wheel zoom began. */
  | { type: 'gesture' }
  | { type: 'card-enter' | 'card-leave' }
  | { type: 'focus' | 'blur'; seatId: string }
  | { type: 'escape' }
  /** The open or close timer the reducer asked for has run out. */
  | { type: 'timer'; kind: 'open' | 'close' }
  /** The seat the card is for no longer exists, or the feature was turned off. */
  | { type: 'reset' };

/** The one timer the binding should be running, if any. */
export type SeatHoverTimer =
  { action: 'start'; kind: 'open' | 'close'; ms: number } | { action: 'clear' };

export interface SeatHoverResult {
  state: SeatHoverState;
  /**
   * Present when `onSeatHover` should be called: with this seat, or `null`.
   * Never a whole unit's key (D25).
   */
  report?: { seatId: string | null };
  /** Absent when the timer is to be left as it is. */
  timer?: SeatHoverTimer;
}

export function reduceSeatHover(
  state: SeatHoverState,
  event: SeatHoverEvent,
  delay: HoverCardDelay,
): SeatHoverResult {
  const result = reduce(state, event, delay);
  if (!result.report) {
    return result;
  }
  // The keys in the state are seats and whole units alike; the report is the
  // seat under the pointer, so a control counts as no seat, and moving between
  // a control and the space around it reports nothing (D25).
  const before = seatOf(state.hoveredId);
  const after = seatOf(result.report.seatId);
  if (before === after && after === null) {
    return { state: result.state, timer: result.timer };
  }
  return after === result.report.seatId ? result : { ...result, report: { seatId: after } };
}

/** A hover key as a seat id, or `null` for no seat or a whole unit's control. */
function seatOf(key: string | null): string | null {
  return key === null || wholeUnitOfHoverKey(key) !== undefined ? null : key;
}

function reduce(
  state: SeatHoverState,
  event: SeatHoverEvent,
  delay: HoverCardDelay,
): SeatHoverResult {
  switch (event.type) {
    case 'enter':
    case 'move':
      return canHover(event.pointerType) ? onPointerOver(state, event.seatId, delay) : { state };
    case 'leave':
      return canHover(event.pointerType) ? onPointerOut(state, event.seatId, delay) : { state };
    case 'gesture':
      return onGesture(state);
    case 'card-enter':
      return state.cardId === null
        ? { state }
        : { state: { ...state, overCard: true, closing: false }, timer: { action: 'clear' } };
    case 'card-leave':
      return onCardLeave(state, delay);
    case 'focus':
      return onFocus(state, event.seatId);
    case 'blur':
      return onBlur(state, event.seatId);
    case 'escape':
      return onEscape(state);
    case 'timer':
      return onTimer(state, event.kind);
    case 'reset':
      return state === IDLE_SEAT_HOVER
        ? { state }
        : {
            state: IDLE_SEAT_HOVER,
            timer: { action: 'clear' },
            report: state.hoveredId === null ? undefined : { seatId: null },
          };
  }
}

function onPointerOver(
  state: SeatHoverState,
  seatId: string,
  delay: HoverCardDelay,
): SeatHoverResult {
  if (state.hoveredId === seatId && !state.suppressed) {
    return { state };
  }
  const resumed = { ...state, suppressed: false, hoveredId: seatId };
  const report = { seatId };

  if (state.dismissedId === seatId) {
    return { state: resumed, report };
  }

  // Already showing this seat's card (the pointer came back during the close
  // delay, or the card was opened by focus): keep it.
  if (state.cardId === seatId) {
    return {
      state: { ...resumed, closing: false, pendingId: null },
      report,
      timer: { action: 'clear' },
    };
  }

  // Another seat's card is showing: move to this one at once, so sweeping
  // across a row does not flicker the card through its open delay each time.
  if (state.cardId !== null) {
    return {
      state: {
        ...resumed,
        cardId: seatId,
        cardTrigger: 'hover',
        closing: false,
        overCard: false,
        pendingId: null,
      },
      report,
      timer: { action: 'clear' },
    };
  }

  if (delay.open <= 0) {
    return {
      state: { ...resumed, cardId: seatId, cardTrigger: 'hover', pendingId: null },
      report,
      timer: { action: 'clear' },
    };
  }
  return {
    state: { ...resumed, pendingId: seatId },
    report,
    timer: { action: 'start', kind: 'open', ms: delay.open },
  };
}

function onPointerOut(
  state: SeatHoverState,
  seatId: string,
  delay: HoverCardDelay,
): SeatHoverResult {
  if (state.hoveredId !== seatId) {
    return { state };
  }
  const left: SeatHoverState = {
    ...state,
    hoveredId: null,
    pendingId: null,
    dismissedId:
      state.dismissedId === seatId && state.focusedId !== seatId ? null : state.dismissedId,
  };
  const report = { seatId: null };

  // A card the pointer opened lingers for the close delay, so the pointer can
  // travel into it. One that focus opened stays with the focus.
  if (state.cardId === seatId && state.cardTrigger === 'hover' && !state.overCard) {
    if (delay.close <= 0) {
      return { state: closeCard(left), report, timer: { action: 'clear' } };
    }
    return {
      state: { ...left, closing: true },
      report,
      timer: { action: 'start', kind: 'close', ms: delay.close },
    };
  }
  return {
    state: left,
    report,
    timer: state.pendingId === null && !state.closing ? undefined : { action: 'clear' },
  };
}

function onGesture(state: SeatHoverState): SeatHoverResult {
  const hadHover = state.hoveredId !== null;
  return {
    state: { ...closeCard(state), hoveredId: null, pendingId: null, suppressed: true },
    report: hadHover ? { seatId: null } : undefined,
    timer: { action: 'clear' },
  };
}

function onCardLeave(state: SeatHoverState, delay: HoverCardDelay): SeatHoverResult {
  if (!state.overCard) {
    return { state };
  }
  const off = { ...state, overCard: false };
  // Back on the seat, or the card is held open by focus: nothing to close.
  if (state.cardId === null || state.cardTrigger !== 'hover' || state.hoveredId === state.cardId) {
    return { state: off };
  }
  if (delay.close <= 0) {
    return { state: closeCard(off), timer: { action: 'clear' } };
  }
  return {
    state: { ...off, closing: true },
    timer: { action: 'start', kind: 'close', ms: delay.close },
  };
}

function onFocus(state: SeatHoverState, seatId: string): SeatHoverResult {
  const focused = { ...state, focusedId: seatId };
  if (state.dismissedId === seatId || state.cardId === seatId) {
    return { state: focused };
  }
  return {
    state: {
      ...focused,
      cardId: seatId,
      cardTrigger: 'focus',
      pendingId: null,
      closing: false,
      overCard: false,
    },
    timer: { action: 'clear' },
  };
}

function onBlur(state: SeatHoverState, seatId: string): SeatHoverResult {
  if (state.focusedId !== seatId) {
    return { state };
  }
  const blurred: SeatHoverState = {
    ...state,
    focusedId: null,
    dismissedId:
      state.dismissedId === seatId && state.hoveredId !== seatId ? null : state.dismissedId,
  };
  if (state.cardId !== seatId || state.cardTrigger !== 'focus') {
    return { state: blurred };
  }
  // The pointer is still on the seat: the card carries on as a hover card.
  if (state.hoveredId === seatId) {
    return { state: { ...blurred, cardTrigger: 'hover' } };
  }
  return { state: closeCard(blurred), timer: { action: 'clear' } };
}

function onEscape(state: SeatHoverState): SeatHoverResult {
  if (state.cardId === null && state.pendingId === null) {
    return { state };
  }
  return {
    state: { ...closeCard(state), pendingId: null, dismissedId: state.cardId ?? state.pendingId },
    timer: { action: 'clear' },
  };
}

function onTimer(state: SeatHoverState, kind: 'open' | 'close'): SeatHoverResult {
  if (kind === 'open' && state.pendingId !== null) {
    return {
      state: { ...state, cardId: state.pendingId, cardTrigger: 'hover', pendingId: null },
    };
  }
  if (kind === 'close' && state.closing) {
    return { state: closeCard(state) };
  }
  return { state };
}

function closeCard(state: SeatHoverState): SeatHoverState {
  return { ...state, cardId: null, cardTrigger: null, closing: false, overCard: false };
}
