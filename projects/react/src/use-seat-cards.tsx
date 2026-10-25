import {
  IDLE_SEAT_HOVER,
  reduceSeatHover,
  resolveHoverCardDelay,
  seatAriaLabel,
  seatCardClickAction,
  seatCardDataAttributes,
  seatCardId,
  seatCardKeyExists,
  wholeUnitAriaLabel,
  wholeUnitCardContext,
  wholeUnitCardDataAttributes,
  wholeUnitCardGroup,
  wholeUnitHoverKey,
  wholeUnitOfHoverKey,
} from '@kerusiweb/core';
import type {
  HoverCardDelay,
  KerusiSeatCardContext,
  KerusiWholeUnitCardContext,
  RenderGroup,
  RenderMap,
  RenderSeat,
  SeatAriaStrings,
  SeatCardAppearance,
  SeatCardPlacement,
  SeatClickSource,
  SeatHoverEvent,
  SeatHoverState,
  WholeUnitPriceFn,
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
  /**
   * The groups whose shape is drawn as a whole unit's control, by id: none on a
   * read-only map (D19). Their cards anchor to the control (D25).
   */
  controlGroups: ReadonlyMap<string, RenderGroup>;
  renderWholeUnitHoverCard?: (ctx: KerusiWholeUnitCardContext) => ReactNode;
  renderWholeUnitClickCard?: (ctx: KerusiWholeUnitCardContext) => ReactNode;
  wholeUnitPrice?: WholeUnitPriceFn;
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
  /** Whether whole units' controls need pointer listeners: a whole-unit hover card (D25). */
  tracksUnitPointer: boolean;
  /** Whether whole units' controls need focus and blur listeners (D12, D25). */
  tracksUnitFocus: boolean;
  pointer(type: 'enter' | 'leave' | 'move', seatId: string, pointerType: string): void;
  focus(seatId: string): void;
  blur(seatId: string): void;
  unitPointer(type: 'enter' | 'leave' | 'move', groupId: string, pointerType: string): void;
  unitFocus(groupId: string): void;
  unitBlur(groupId: string): void;
  /** A pan, pinch or wheel zoom began. */
  gesture(): void;
  /** Opens or closes the click card for an activated seat. */
  activate(seatId: string, source: SeatClickSource): void;
  /** Opens or closes the click card for a pressed whole unit's control (D25). */
  activateUnit(groupId: string, source: SeatClickSource): void;
  /** Closes what is open, hover card first. True if a card was showing. */
  dismiss(): boolean;
  openSeatCard(seatId: string): void;
  closeSeatCard(): void;
  /** The seat whose click card is showing. */
  openSeatCardId: string | null;
  /** The seat → card `id` link, for the seat showing a hover card. */
  describedBy: { seatId: string; id: string } | null;
  /** The control → card `id` link, for the whole unit showing a hover card (D25). */
  unitDescribedBy: { groupId: string; id: string } | null;
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
 * Seat hover events and the two seat cards (D10), which also open on a whole
 * unit's control when the whole-unit renderers are set (D25). One hover card and
 * one click card show at a time, for a seat or a control.
 *
 * The rules are core's: `reduceSeatHover()` decides what a pointer, a key or a
 * timer means, and `placeSeatCard()` where a card goes. This hook holds the
 * state, runs the one timer the reducer asks for, and renders the cards. A
 * control goes by its `wholeUnitHoverKey()` wherever a seat goes by its id.
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
    controlGroups,
    renderWholeUnitHoverCard,
    renderWholeUnitClickCard,
    wholeUnitPrice,
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
  const tracksUnitPointer = !!renderWholeUnitHoverCard;
  const tracksUnitFocus = hoverCardOnFocus && !!renderWholeUnitHoverCard;

  const pointer = useCallback(
    (type: 'enter' | 'leave' | 'move', seatId: string, pointerType: string) =>
      feed({ type, seatId, pointerType }),
    [feed],
  );
  const focus = useCallback((seatId: string) => feed({ type: 'focus', seatId }), [feed]);
  const blur = useCallback((seatId: string) => feed({ type: 'blur', seatId }), [feed]);
  const unitPointer = useCallback(
    (type: 'enter' | 'leave' | 'move', groupId: string, pointerType: string) =>
      feed({ type, seatId: wholeUnitHoverKey(groupId), pointerType }),
    [feed],
  );
  const unitFocus = useCallback(
    (groupId: string) => feed({ type: 'focus', seatId: wholeUnitHoverKey(groupId) }),
    [feed],
  );
  const unitBlur = useCallback(
    (groupId: string) => feed({ type: 'blur', seatId: wholeUnitHoverKey(groupId) }),
    [feed],
  );
  const gesture = useCallback(() => feed({ type: 'gesture' }), [feed]);

  /** A whole unit's control, found in the map by its group id. */
  const getControlNode = useCallback(
    (groupId: string): SVGGElement | null => {
      const controls = rootRef.current?.querySelectorAll<SVGGElement>('.kerusi-group--whole');
      return [...(controls ?? [])].find((node) => node.dataset['groupId'] === groupId) ?? null;
    },
    [rootRef],
  );

  // --- click ----------------------------------------------------------------

  /** The seat id, or a whole unit's hover key, whose click card is open. */
  const [clickId, setClickId] = useState<string | null>(null);
  const clickRef = useRef<string | null>(null);
  clickRef.current = clickId;
  /** Set when the card is opened from the keyboard, so focus moves into it. */
  const [clickFromKeyboard, setClickFromKeyboard] = useState(false);

  /**
   * Closes the click card. Focus goes back to the seat or control only when it
   * was inside the card, so a press elsewhere on the page keeps the focus it
   * just took.
   */
  const closeClick = useCallback(
    (restoreFocus: boolean) => {
      const current = clickRef.current;
      if (current !== null && restoreFocus) {
        const card = rootRef.current?.querySelector('.kerusi-seat-card--click');
        if (card?.contains(card.ownerDocument.activeElement)) {
          const groupId = wholeUnitOfHoverKey(current);
          // After the card is gone, so nothing fights the focus move.
          queueMicrotask(() =>
            groupId === undefined
              ? focusSeat(current)
              : getControlNode(groupId)?.focus({ preventScroll: true }),
          );
        }
      }
      setClickId(null);
      setClickFromKeyboard(false);
    },
    [rootRef, focusSeat, getControlNode],
  );

  /**
   * Opens or closes the click card for a seat id or a whole unit's key. With no
   * renderer for it, the press opens nothing, and only the other kind's card
   * gives way to it.
   */
  const toggleClick = useCallback(
    (key: string, source: SeatClickSource, canOpen: boolean) => {
      switch (seatCardClickAction(clickRef.current, key, canOpen)) {
        case 'open':
          setClickId(key);
          setClickFromKeyboard(source === 'keyboard');
          return;
        case 'close':
          closeClick(true);
          return;
        case 'give-way':
          closeClick(false);
          return;
      }
    },
    [closeClick],
  );

  const activate = useCallback(
    (seatId: string, source: SeatClickSource) => toggleClick(seatId, source, !!renderClickCard),
    [renderClickCard, toggleClick],
  );
  const activateUnit = useCallback(
    (groupId: string, source: SeatClickSource) =>
      toggleClick(wholeUnitHoverKey(groupId), source, !!renderWholeUnitClickCard),
    [renderWholeUnitClickCard, toggleClick],
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

  const seatFor = (key: string | null): RenderSeat | undefined =>
    key !== null && wholeUnitOfHoverKey(key) === undefined
      ? renderMap.seatsById.get(key)
      : undefined;
  const clickSeat = seatFor(clickId);
  const clickGroup = wholeUnitCardGroup(clickId, controlGroups);
  const hoverSeat = seatFor(hover.cardId);
  const hoverGroup = wholeUnitCardGroup(hover.cardId, controlGroups);

  const contextFor = (
    seat: RenderSeat,
    trigger: KerusiSeatCardContext['trigger'],
    close: () => void,
  ): KerusiSeatCardContext => ({
    seat,
    group: seat.group,
    selected: selection.has(seat.id),
    trigger,
    close,
  });

  const closeClickCard = () => closeClick(true);
  const clickContent =
    renderClickCard && clickSeat
      ? renderClickCard(contextFor(clickSeat, 'click', closeClickCard))
      : renderWholeUnitClickCard && clickGroup
        ? renderWholeUnitClickCard(
            wholeUnitCardContext(clickGroup, selection, 'click', closeClickCard),
          )
        : null;
  const clickShowing =
    (clickSeat !== undefined || clickGroup !== undefined) && !isEmptyContent(clickContent);

  // A click card open for a seat or a control hides that one's hover card.
  const hoverTrigger = hover.cardTrigger === 'focus' ? 'focus' : 'hover';
  const escapeHover = () => feed({ type: 'escape' });
  const hoverContent =
    hover.cardId === clickId
      ? null
      : renderHoverCard && hoverSeat
        ? renderHoverCard(contextFor(hoverSeat, hoverTrigger, escapeHover))
        : renderWholeUnitHoverCard && hoverGroup
          ? renderWholeUnitHoverCard(
              wholeUnitCardContext(hoverGroup, selection, hoverTrigger, escapeHover),
            )
          : null;
  const hoverShowing =
    (hoverSeat !== undefined || hoverGroup !== undefined) && !isEmptyContent(hoverContent);

  // A seat or a control that goes away (a hidden section, a new map, selection
  // turned off) takes its cards with it.
  const exists = useCallback(
    (key: string) => seatCardKeyExists(key, renderMap.seatsById, controlGroups),
    [renderMap, controlGroups],
  );
  useEffect(() => {
    if (clickId !== null && !exists(clickId)) {
      closeClick(false);
    }
    if (hover.cardId !== null && !exists(hover.cardId)) {
      feed({ type: 'reset' });
    }
  }, [exists, clickId, hover.cardId, closeClick, feed]);

  // A card whose render function is taken away has nothing to show.
  const clickIsUnit = wholeUnitOfHoverKey(clickId) !== undefined;
  useEffect(() => {
    if (clickId !== null && !(clickIsUnit ? renderWholeUnitClickCard : renderClickCard)) {
      closeClick(false);
    }
  }, [renderClickCard, renderWholeUnitClickCard, clickId, clickIsUnit, closeClick]);
  useEffect(() => {
    if (!tracksPointer && !tracksUnitPointer && hoverRef.current !== IDLE_SEAT_HOVER) {
      feed({ type: 'reset' });
    }
  }, [tracksPointer, tracksUnitPointer, feed]);

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
  // a seat, or on a whole unit's control, is that one's own click, which opens
  // or closes a card by itself.
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
      const onSeat =
        root.contains(target) && target.closest?.('[data-seat-id], .kerusi-group--whole');
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

  /** What a card for this seat or control is placed against, named and marked by. */
  const anchorFor = (seat: RenderSeat | undefined, group: RenderGroup | undefined) =>
    seat
      ? {
          anchorKey: seat.id,
          data: seatCardDataAttributes(seat),
          getAnchorNode: () => getSeatNode(seat.id),
          label: () => seatAriaLabel(seat, locale, ariaStrings),
        }
      : {
          anchorKey: wholeUnitHoverKey(group!.id),
          data: wholeUnitCardDataAttributes(group!),
          getAnchorNode: () => getControlNode(group!.id),
          label: () => wholeUnitAriaLabel(group!.wholeUnit!, locale, ariaStrings, wholeUnitPrice),
        };

  const hoverAnchor = hoverShowing ? anchorFor(hoverSeat, hoverGroup) : undefined;
  const clickAnchor = clickShowing ? anchorFor(clickSeat, clickGroup) : undefined;

  const elements = (
    <>
      {hoverAnchor && (
        <SeatCard
          key={`hover:${hoverAnchor.anchorKey}`}
          kind="hover"
          id={hoverId}
          anchorKey={hoverAnchor.anchorKey}
          data={hoverAnchor.data}
          getAnchorNode={hoverAnchor.getAnchorNode}
          label=""
          placement={placement}
          appearance={appearance}
          className={className}
          rootRef={rootRef}
          onPointerEnter={() => feed({ type: 'card-enter' })}
          onPointerLeave={() => feed({ type: 'card-leave' })}
        >
          {hoverContent}
        </SeatCard>
      )}
      {clickAnchor && (
        <SeatCard
          key={`click:${clickAnchor.anchorKey}`}
          kind="click"
          id={clickCardId}
          anchorKey={clickAnchor.anchorKey}
          data={clickAnchor.data}
          getAnchorNode={clickAnchor.getAnchorNode}
          label={clickAnchor.label()}
          placement={placement}
          appearance={appearance}
          className={className}
          rootRef={rootRef}
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
    tracksUnitPointer,
    tracksUnitFocus,
    pointer,
    focus,
    blur,
    unitPointer,
    unitFocus,
    unitBlur,
    gesture,
    activate,
    activateUnit,
    dismiss,
    openSeatCard,
    closeSeatCard,
    openSeatCardId: clickShowing && clickSeat ? clickSeat.id : null,
    describedBy: hoverShowing && hoverSeat ? { seatId: hoverSeat.id, id: hoverId } : null,
    unitDescribedBy: hoverShowing && hoverGroup ? { groupId: hoverGroup.id, id: hoverId } : null,
    elements,
  };
}
