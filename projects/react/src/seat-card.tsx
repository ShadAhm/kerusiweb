import { cssLengthToPx, placeSeatCard, seatCardClassName } from '@kerusiweb/core';
import type {
  SeatCardAppearance,
  SeatCardDataAttributes,
  SeatCardPlacement,
  SeatCardPosition,
  WholeUnitCardDataAttributes,
} from '@kerusiweb/core';
import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';

export interface SeatCardProps {
  kind: 'hover' | 'click';
  /** The card's `id`: a hover card is named by the seat's `aria-describedby`. */
  id: string;
  /** What the card is for: a seat id, or a whole unit's hover key (D25). */
  anchorKey: string;
  /** The `data-*` attributes mirrored from the seat or the group. */
  data: SeatCardDataAttributes | WholeUnitCardDataAttributes;
  /** Names a click card's dialog. */
  label: string;
  placement: SeatCardPlacement;
  appearance: SeatCardAppearance;
  className?: string;
  /** The map's root element: the card is positioned in it and kept inside it. */
  rootRef: RefObject<HTMLElement | null>;
  /** The seat's `<g>`, or the whole unit's control: what the card is placed against. */
  getAnchorNode: () => Element | null;
  /** Moves focus into the card on mount; a click card opened from the keyboard. */
  focusOnOpen?: boolean;
  /** A hover card is hoverable (WCAG 1.4.13): the pointer may enter it. */
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  children: ReactNode;
}

const DEFAULT_OFFSET = 8;
const DEFAULT_ARROW = 6;

/**
 * One seat card: a floating element anchored to a seat, or to a whole unit's
 * control (D25).
 *
 * It sits inside the map's root, outside the clipped viewport, so it shows in
 * full screen and inherits the `--kerusi-*` properties set on the map. Where it
 * goes is `placeSeatCard()`'s; this component measures the seat, the card and
 * the root, and re-measures after every render and whenever the root or the card
 * changes size, which is how it follows zoom, pan, maximize and full screen.
 *
 * It sets no colour, no padding and no font: that is the stylesheet's, and then
 * the consumer's (D11).
 */
export function SeatCard({
  kind,
  id,
  anchorKey,
  data,
  label,
  placement,
  appearance,
  className,
  rootRef,
  getAnchorNode,
  focusOnOpen = false,
  onPointerEnter,
  onPointerLeave,
  children,
}: SeatCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<SeatCardPosition | null>(null);
  /** False when the consumer set `--kerusi-seat-card-arrow-size: 0`. */
  const [arrowShown, setArrowShown] = useState(true);

  const measure = () => {
    const root = rootRef.current;
    const card = cardRef.current;
    const seatNode = getAnchorNode();
    if (!root || !card || !seatNode) {
      return;
    }
    const rootBox = root.getBoundingClientRect();
    const seatBox = seatNode.getBoundingClientRect();
    // `position: absolute` is measured from the root's padding box.
    const originX = rootBox.left + root.clientLeft;
    const originY = rootBox.top + root.clientTop;

    const styles = getComputedStyle(card);
    const fontSizes = {
      root: parseFloat(getComputedStyle(card.ownerDocument.documentElement).fontSize) || 16,
      element: parseFloat(styles.fontSize) || 16,
    };
    const arrowSize = cssLengthToPx(
      styles.getPropertyValue('--kerusi-seat-card-arrow-size'),
      DEFAULT_ARROW,
      fontSizes,
    );
    setArrowShown(arrowSize > 0);
    const next = placeSeatCard({
      seat: {
        x: seatBox.left - originX,
        y: seatBox.top - originY,
        width: seatBox.width,
        height: seatBox.height,
      },
      card: { width: card.offsetWidth, height: card.offsetHeight },
      container: { x: 0, y: 0, width: root.clientWidth, height: root.clientHeight },
      placement,
      offset: cssLengthToPx(
        styles.getPropertyValue('--kerusi-seat-card-offset'),
        DEFAULT_OFFSET,
        fontSizes,
      ),
      arrowInset: Math.max(12, arrowSize * 2),
    });
    setPosition((current) =>
      current &&
      current.side === next.side &&
      current.x === next.x &&
      current.y === next.y &&
      current.arrowOffset === next.arrowOffset
        ? current
        : next,
    );
  };

  // After every render, before paint: the card is in place when it first shows,
  // and a zoom or pan (which re-renders the map) moves it with the seat.
  useLayoutEffect(measure);

  // A change the render did not announce: the root resized (maximize, full
  // screen, a rotated phone), or the card's own content did.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const card = cardRef.current;
    if (!root || !card || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => measure());
    observer.observe(root);
    observer.observe(card);
    return () => observer.disconnect();
    // `measure` closes over props that are stable for as long as the card is this seat's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorKey, placement]);

  useLayoutEffect(() => {
    if (!focusOnOpen) {
      return;
    }
    const card = cardRef.current;
    if (!card) {
      return;
    }
    const first = card.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (first ?? card).focus({ preventScroll: true });
  }, [focusOnOpen, anchorKey]);

  const style = {
    left: position?.x ?? 0,
    top: position?.y ?? 0,
    '--kerusi-seat-card-arrow-shift': `${position?.arrowOffset ?? 0}px`,
  } as CSSProperties;

  return (
    <div
      ref={cardRef}
      id={id}
      className={seatCardClassName(kind, appearance, className)}
      role={kind === 'hover' ? 'tooltip' : 'dialog'}
      aria-label={kind === 'click' ? label : undefined}
      tabIndex={kind === 'click' ? -1 : undefined}
      data-placement={position?.side ?? (placement === 'auto' ? 'top' : placement)}
      {...data}
      style={style}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="kerusi-seat-card__body">{children}</div>
      {appearance === 'none' || !arrowShown ? null : (
        <span className="kerusi-seat-card__arrow" aria-hidden="true" />
      )}
    </div>
  );
}
