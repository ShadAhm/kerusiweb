import {
  IDLE_SEAT_HOVER,
  reduceSeatHover,
  resolveHoverCardDelay,
  seatAriaLabel,
  seatCardId,
} from '@kerusiweb/core';
import type {
  HoverCardDelay,
  KerusiSeatCardContext,
  RenderMap,
  RenderSeat,
  SeatAriaStrings,
  SeatCardAppearance,
  SeatCardPlacement,
  SeatClickSource,
  SeatHoverEvent,
  SeatHoverState,
} from '@kerusiweb/core';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { SeatCard } from './seat-card.js';

export interface UseSeatCardsOptions {
  rootRef: RefObject<HTMLElement | null>;
  renderMap: RenderMap;
  selection: ReadonlySet<string>;
  locale: string;
  ariaStrings: SeatAriaStrings;
  getSeatNode: (seatId: string) => SVGGElement | null;
  focusSeat: (seatId: string) => void;
  onSeatHover?: (seat: RenderSeat | null) => void;
  renderHoverCard?: (ctx: KerusiSeatCardContext) => ReactNode;
  renderClickCard?: (ctx: KerusiSeatCardContext) => ReactNode;
  placement: SeatCardPlacement;
  className?: string;
  appearance: SeatCardAppearance;
  hoverCardDelay?: Partial<HoverCardDelay>;
  hoverCardOnFocus: boolean;
}

export interface SeatCards {
  /** Whether seats need pointer listeners at all. */
  tracksPointer: boolean;
  /** Whether seats need focus and blur listeners for a hover card (D12). */
  tracksFocus: boolean;
  /** A click behaviour is configured: `onSeatClick` or a click card (D14). */
  pointer(type: 'enter' | 'leave' | 'move', seatId: string, pointerType: string): void;
  focus(seatId: string): void;
  blur(seatId: string): void;
  /** A pan, pinch or wheel zoom began. */
  gesture(): void;
  /** Opens or closes the click card for an activated seat. */
  activate(seatId: string, source: SeatClickSource): void;
  /** Closes what is open, hover card first. True if a card was showing. */
  dismiss(): boolean;
  openSeatCard(seatId: string): void;
  closeSeatCard(): void;
  /** The seat whose click card is showing. */
  openSeatCardId: string | null;
  /** The seat → card `id` link, for the seat showing a hover card. */
  describedBy: { seatId: string; id: string } | null;
  /** Both cards, as elements to render inside the map's root. */
  elements: ReactNode;
}

/** `null`, `undefined`, `false`, `true`, `''` and `[]` draw nothing. */
function isEmptyContent(node: ReactNode): boolean {
  if (node === null || node === undefined || typeof node === 'boolean' || node === '') {
    return true;
  }
  return Array.isArray(node) && node.every(isEmptyContent);
}

/**
 * Seat hover events and the two seat cards (D10).
 *
 * The rules are core's: `reduceSeatHover()` decides what a pointer, a key or a
 * timer means, and `placeSeatCard()` where a card goes. This hook holds the
 * state, runs the one timer the reducer asks for, and renders the cards.
 */
export function useSeatCards(options: UseSeatCardsOptions): SeatCards {
  const {
    rootRef,
    renderMap,
    selection,
    locale,
    ariaStrings,
    getSeatNode,
    focusSeat,
    renderHoverCard,
    renderClickCard,
    placement,
    className,
    appearance,
    hoverCardOnFocus,
  } = options;

  const prefix = useId();
  const delayOpen = options.hoverCardDelay?.open;
  const delayClose = options.hoverCardDelay?.close;
  const delay = useMemo(
    () => resolveHoverCardDelay({ open: delayOpen, close: delayClose }),
    [delayOpen, delayClose],
  );

  // The latest of everything the long-lived callbacks read.
  const live = useRef({ renderMap, delay, onSeatHover: options.onSeatHover });
  live.current = { renderMap, delay, onSeatHover: options.onSeatHover };

  // --- hover ----------------------------------------------------------------

  const [hover, setHover] = useState<SeatHoverState>(IDLE_SEAT_HOVER);
  const hoverRef = useRef<SeatHoverState>(IDLE_SEAT_HOVER);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const feed = useCallback((event: SeatHoverEvent) => {
    const result = reduceSeatHover(hoverRef.current, event, live.current.delay);
    hoverRef.current = result.state;
    setHover(result.state);

    if (result.timer) {
      clearTimeout(timer.current);
      timer.current = undefined;
      if (result.timer.action === 'start') {
        const { kind, ms } = result.timer;
        timer.current = setTimeout(() => feed({ type: 'timer', kind }), ms);
      }
    }
    if (result.report) {
      const { seatId } = result.report;
      const seat = seatId === null ? null : (live.current.renderMap.seatsById.get(seatId) ?? null);
      if (seatId === null || seat) {
        live.current.onSeatHover?.(seat);
      }
    }
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const tracksPointer = !!options.onSeatHover || !!renderHoverCard;
  const tracksFocus = hoverCardOnFocus && !!renderHoverCard;

  const pointer = useCallback(
    (type: 'enter' | 'leave' | 'move', seatId: string, pointerType: string) =>
      feed({ type, seatId, pointerType }),
    [feed],
  );
  const focus = useCallback((seatId: string) => feed({ type: 'focus', seatId }), [feed]);
  const blur = useCallback((seatId: string) => feed({ type: 'blur', seatId }), [feed]);
  const gesture = useCallback(() => feed({ type: 'gesture' }), [feed]);

  // --- click ----------------------------------------------------------------

  const [clickId, setClickId] = useState<string | null>(null);
  const clickRef = useRef<string | null>(null);
  clickRef.current = clickId;
  /** Set when the card is opened from the keyboard, so focus moves into it. */
  const [clickFromKeyboard, setClickFromKeyboard] = useState(false);

  /**
   * Closes the click card. Focus goes back to the seat only when it was inside
   * the card, so a press elsewhere on the page keeps the focus it just took.
   */
  const closeClick = useCallback(
    (restoreFocus: boolean) => {
      const current = clickRef.current;
      if (current !== null && restoreFocus) {
        const card = rootRef.current?.querySelector('.kerusi-seat-card--click');
        if (card?.contains(card.ownerDocument.activeElement)) {
          // After the card is gone, so nothing fights the focus move.
          queueMicrotask(() => focusSeat(current));
        }
      }
      setClickId(null);
      setClickFromKeyboard(false);
    },
    [rootRef, focusSeat],
  );

  const activate = useCallback(
    (seatId: string, source: SeatClickSource) => {
      if (!renderClickCard) {
        return;
      }
      if (clickId === seatId) {
        closeClick(true);
        return;
      }
      setClickId(seatId);
      setClickFromKeyboard(source === 'keyboard');
    },
    [renderClickCard, clickId, closeClick],
  );

  const openSeatCard = useCallback(
    (seatId: string) => {
      if (renderClickCard && live.current.renderMap.seatsById.has(seatId)) {
        setClickId(seatId);
        setClickFromKeyboard(false);
      }
    },
    [renderClickCard],
  );
  const closeSeatCard = useCallback(() => closeClick(true), [closeClick]);

  // --- what is showing ------------------------------------------------------

  const clickSeat = clickId ? renderMap.seatsById.get(clickId) : undefined;
  const hoverSeat = hover.cardId ? renderMap.seatsById.get(hover.cardId) : undefined;

  const contextFor = (
    seat: RenderSeat,
    trigger: KerusiSeatCardContext['trigger'],
    close: () => void,
  ): KerusiSeatCardContext => ({ seat, selected: selection.has(seat.id), trigger, close });

  const clickContent =
    renderClickCard && clickSeat
      ? renderClickCard(contextFor(clickSeat, 'click', () => closeClick(true)))
      : null;
  const clickShowing = clickSeat !== undefined && !isEmptyContent(clickContent);

  // A click card open for a seat hides that seat's hover card.
  const hoverContent =
    renderHoverCard && hoverSeat && hoverSeat.id !== clickId
      ? renderHoverCard(
          contextFor(hoverSeat, hover.cardTrigger === 'focus' ? 'focus' : 'hover', () =>
            feed({ type: 'escape' }),
          ),
        )
      : null;
  const hoverShowing = hoverSeat !== undefined && !isEmptyContent(hoverContent);

  // A seat that goes away (a hidden section, a new map) takes its cards with it.
  useEffect(() => {
    if (clickId !== null && !renderMap.seatsById.has(clickId)) {
      closeClick(false);
    }
    if (hover.cardId !== null && !renderMap.seatsById.has(hover.cardId)) {
      feed({ type: 'reset' });
    }
  }, [renderMap, clickId, hover.cardId, closeClick, feed]);

  // A card whose render function is taken away has nothing to show.
  useEffect(() => {
    if (!renderClickCard && clickId !== null) {
      closeClick(false);
    }
  }, [renderClickCard, clickId, closeClick]);
  useEffect(() => {
    if (!tracksPointer && hoverRef.current !== IDLE_SEAT_HOVER) {
      feed({ type: 'reset' });
    }
  }, [tracksPointer, feed]);

  const dismiss = useCallback((): boolean => {
    if (clickId !== null) {
      closeClick(true);
      return clickShowing;
    }
    if (hoverRef.current.cardId !== null || hoverRef.current.pendingId !== null) {
      feed({ type: 'escape' });
      return hoverShowing;
    }
    return false;
  }, [clickId, clickShowing, hoverShowing, closeClick, feed]);

  const anyOpen = clickId !== null || hover.cardId !== null;

  // Escape anywhere dismisses a card, including with focus outside the map: a
  // hover card the pointer opened must be dismissible without moving it (WCAG
  // 1.4.13). The map's own key handling runs first and marks the event handled.
  useEffect(() => {
    if (!anyOpen) {
      return;
    }
    const doc = rootRef.current?.ownerDocument ?? document;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && dismiss()) {
        event.preventDefault();
      }
    };
    doc.addEventListener('keydown', onKeyDown);
    return () => doc.removeEventListener('keydown', onKeyDown);
  }, [anyOpen, dismiss, rootRef]);

  // A press outside the click card and outside every seat closes it. A press on
  // a seat is that seat's own click, which opens or closes a card by itself.
  useEffect(() => {
    if (clickId === null) {
      return;
    }
    const doc = rootRef.current?.ownerDocument ?? document;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      const root = rootRef.current;
      if (!target || !root) {
        return;
      }
      const inCard = target.closest?.('.kerusi-seat-card--click');
      const onSeat = root.contains(target) && target.closest?.('[data-seat-id]');
      if (!inCard && !onSeat) {
        closeClick(false);
      }
    };
    doc.addEventListener('pointerdown', onPointerDown, true);
    return () => doc.removeEventListener('pointerdown', onPointerDown, true);
  }, [clickId, closeClick, rootRef]);

  // --- render ---------------------------------------------------------------

  const hoverId = seatCardId(prefix, 'hover');
  const clickCardId = seatCardId(prefix, 'click');

  const elements = (
    <>
      {hoverShowing && hoverSeat && (
        <SeatCard
          key={`hover:${hoverSeat.id}`}
          kind="hover"
          id={hoverId}
          seat={hoverSeat}
          label=""
          placement={placement}
          appearance={appearance}
          className={className}
          rootRef={rootRef}
          getSeatNode={getSeatNode}
          onPointerEnter={() => feed({ type: 'card-enter' })}
          onPointerLeave={() => feed({ type: 'card-leave' })}
        >
          {hoverContent}
        </SeatCard>
      )}
      {clickShowing && clickSeat && (
        <SeatCard
          key={`click:${clickSeat.id}`}
          kind="click"
          id={clickCardId}
          seat={clickSeat}
          label={seatAriaLabel(clickSeat, locale, ariaStrings)}
          placement={placement}
          appearance={appearance}
          className={className}
          rootRef={rootRef}
          getSeatNode={getSeatNode}
          focusOnOpen={clickFromKeyboard}
        >
          {clickContent}
        </SeatCard>
      )}
    </>
  );

  return {
    tracksPointer,
    tracksFocus,
    pointer,
    focus,
    blur,
    gesture,
    activate,
    dismiss,
    openSeatCard,
    closeSeatCard,
    openSeatCardId: clickShowing ? clickId : null,
    describedBy: hoverShowing && hoverSeat ? { seatId: hoverSeat.id, id: hoverId } : null,
    elements,
  };
}
