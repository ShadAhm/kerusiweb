import type { KerusiState, RenderSeat, SeatClick } from '@kerusiweb/core';
import { act, fireEvent, render } from '@testing-library/react';
import { createRef, useState } from 'react';
import type { RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PARITY_CARD_SIGNATURE,
  PARITY_MAP,
  PARITY_STATE,
  svgSignature,
} from '../../core/src/testing/parity.fixture.js';
import { KerusiSeatmap } from './kerusi-seatmap.js';
import type { KerusiSeatmapHandle, KerusiSeatmapProps } from './types.js';

/**
 * Seat hover, seat click and seat cards (D10 to D15). The same scenarios as
 * `kerusi-seatmap.cards.spec.ts` in the Angular binding, in the same order, so
 * the two are held to the same behaviour.
 *
 * The town hall from the parity fixture: A2 is booked, T1-2 held, L7 blocked,
 * and A1 is the first seat of the first section.
 */

function Harness({
  handle,
  selection: initial = [],
  ...props
}: Partial<KerusiSeatmapProps> & { handle?: RefObject<KerusiSeatmapHandle | null> }) {
  const [selection, setSelection] = useState<readonly string[]>(initial);
  return (
    <KerusiSeatmap
      ref={handle}
      map={PARITY_MAP}
      state={PARITY_STATE}
      selection={selection}
      onSelectionChange={setSelection}
      {...props}
    />
  );
}

const pointerInit = (pointerType: string, extra: PointerEventInit = {}): PointerEventInit => ({
  pointerType,
  pointerId: 1,
  button: 0,
  bubbles: true,
  cancelable: true,
  ...extra,
});

describe('KerusiSeatmap: seat hover, click and cards', () => {
  let el: HTMLElement;
  let handle: RefObject<KerusiSeatmapHandle | null>;

  const mount = (props: Partial<KerusiSeatmapProps> = {}) => {
    const ui = (extra: Partial<KerusiSeatmapProps>) => (
      <Harness handle={handle} {...props} {...extra} />
    );
    const result = render(ui({}));
    el = result.container;
    return { update: (extra: Partial<KerusiSeatmapProps>) => result.rerender(ui(extra)) };
  };

  beforeEach(() => {
    handle = createRef<KerusiSeatmapHandle | null>();
  });

  const seat = (id: string) => el.querySelector<SVGGElement>(`[data-seat-id="${id}"]`)!;
  const root = () => el.querySelector<HTMLElement>('.kerusi-seatmap')!;
  const card = (kind?: 'hover' | 'click') =>
    el.querySelector<HTMLElement>(kind ? `.kerusi-seat-card--${kind}` : '.kerusi-seat-card');
  const tabStops = () =>
    [...el.querySelectorAll<SVGGElement>('g.kerusi-seat')]
      .filter((g) => g.getAttribute('tabindex') === '0')
      .map((g) => g.dataset['seatId']);

  /** `pointerover` with no related target is how React learns of a pointer entering. */
  const enter = (target: Element, type = 'mouse') =>
    act(() => {
      fireEvent(target, new PointerEvent('pointerover', pointerInit(type)));
    });
  const leave = (target: Element, to: Element | null = null, type = 'mouse') =>
    act(() => {
      fireEvent(target, new PointerEvent('pointerout', pointerInit(type, { relatedTarget: to })));
    });
  const move = (target: Element, type = 'mouse') =>
    act(() => {
      fireEvent(target, new PointerEvent('pointermove', pointerInit(type)));
    });
  const click = (target: Element) =>
    act(() => {
      fireEvent(target, new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  const key = (target: Element, k: string) => {
    const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    act(() => {
      fireEvent(target, event);
    });
    return event;
  };
  const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

  describe('onSeatHover', () => {
    let hovered: (RenderSeat | null)[];
    beforeEach(() => {
      hovered = [];
      mount({ onSeatHover: (s) => hovered.push(s) });
    });
    const ids = () => hovered.map((s) => s?.id ?? null);

    it('reports the seat on enter and null on leave', () => {
      enter(seat('A1'));
      leave(seat('A1'));
      expect(ids()).toEqual(['A1', null]);
    });

    it('hands over the same RenderSeat onSeatDisallowed gets', () => {
      enter(seat('A2'));
      expect(hovered[0]).toMatchObject({
        id: 'A2',
        label: 'A2',
        rowLabel: 'A',
        sectionId: 'stalls',
        status: 'booked',
        price: { amount: 2500, currency: 'MYR' },
      });
      expect(hovered[0]!.type.id).toBe('std');
    });

    it('is not called again while the pointer moves within a seat', () => {
      enter(seat('A1'));
      move(seat('A1'));
      move(seat('A1'));
      expect(ids()).toEqual(['A1']);
    });

    it('goes from one seat to the next as null then the seat', () => {
      enter(seat('A1'));
      leave(seat('A1'), seat('A3'));
      expect(ids()).toEqual(['A1', null, 'A3']);
    });

    it('reports a pen, and ignores touch', () => {
      enter(seat('A1'), 'touch');
      leave(seat('A1'), null, 'touch');
      expect(ids()).toEqual([]);
      enter(seat('A1'), 'pen');
      expect(ids()).toEqual(['A1']);
    });
  });

  describe('onSeatHover on other maps', () => {
    it('fires on a read-only map, and changes nothing about it', () => {
      const hovered: (string | null)[] = [];
      mount({ interactive: false, onSeatHover: (s) => hovered.push(s?.id ?? null) });
      enter(seat('A1'));
      leave(seat('A1'));
      expect(hovered).toEqual(['A1', null]);
      // Still the read-only markup it always was.
      expect(tabStops()).toEqual([]);
      expect(seat('A1').getAttribute('aria-pressed')).toBe('false');
      click(seat('A1'));
      expect(seat('A1').getAttribute('aria-pressed')).toBe('false');
    });

    it('fires for a custom seat drawing, because the listener is on the library’s <g>', () => {
      const hovered: (string | null)[] = [];
      mount({
        renderSeat: ({ seat: s }) => <circle r="4" data-mark={s.id} />,
        onSeatHover: (s) => hovered.push(s?.id ?? null),
      });
      enter(el.querySelector('[data-mark="A1"]')!);
      expect(hovered).toEqual(['A1']);
    });

    it('clears the hover once when a zoom starts, and resumes on the next pointer move', () => {
      const hovered: (string | null)[] = [];
      mount({ zoomable: true, onSeatHover: (s) => hovered.push(s?.id ?? null) });
      enter(seat('A1'));
      const wheel = () =>
        act(() => {
          fireEvent(
            el.querySelector('.kerusi-viewport')!,
            new WheelEvent('wheel', {
              bubbles: true,
              cancelable: true,
              ctrlKey: true,
              deltaY: -50,
            }),
          );
        });
      wheel();
      wheel();
      expect(hovered).toEqual(['A1', null]);
      // The seat under a stationary pointer is not re-reported until the pointer moves.
      leave(seat('A1'));
      expect(hovered).toEqual(['A1', null]);
      move(seat('A3'));
      expect(hovered).toEqual(['A1', null, 'A3']);
    });

    it('is quiet when nothing listens, adding no markup', () => {
      mount();
      enter(seat('A1'));
      expect(card()).toBeNull();
    });
  });

  describe('onSeatClick', () => {
    let clicks: SeatClick[];
    let order: string[];

    beforeEach(() => {
      clicks = [];
      order = [];
    });

    const events = (extra: Partial<KerusiSeatmapProps> = {}) => ({
      onSeatClick: (e: SeatClick) => {
        clicks.push(e);
        order.push('click');
      },
      onSeatSelect: () => order.push('select'),
      onSeatDeselect: () => order.push('deselect'),
      onSeatDisallowed: () => order.push('disallowed'),
      ...extra,
    });

    it('fires before the selection callbacks, with the selection as it was', () => {
      mount(events());
      click(seat('A1'));
      expect(order).toEqual(['click', 'select']);
      expect(clicks[0]).toMatchObject({ selected: false, source: 'pointer' });
      expect(clicks[0]!.seat.id).toBe('A1');
      click(seat('A1'));
      expect(order).toEqual(['click', 'select', 'click', 'deselect']);
      expect(clicks[1]!.selected).toBe(true);
    });

    it('fires for a booked, held or blocked seat, which still refuses the pick', () => {
      mount(events());
      for (const id of ['A2', 'T1-2', 'L7']) {
        click(seat(id));
      }
      expect(clicks.map((c) => c.seat.id)).toEqual(['A2', 'T1-2', 'L7']);
      expect(order).toEqual(['click', 'disallowed', 'click', 'disallowed', 'click', 'disallowed']);
      expect(el.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
    });

    it('reports Enter and Space as the keyboard', () => {
      mount(events());
      key(seat('A1'), 'Enter');
      key(seat('A1'), ' ');
      expect(clicks.map((c) => c.source)).toEqual(['keyboard', 'keyboard']);
      expect(clicks.map((c) => c.selected)).toEqual([false, true]);
    });

    it('does not change selection, whether or not it is listened to', () => {
      const picked: string[][] = [];
      mount({ onSelectionChange: (s) => picked.push([...s]) });
      click(seat('A1'));
      const without = el.innerHTML;
      el.remove();
      mount({ ...events(), onSelectionChange: (s) => picked.push([...s]) });
      click(seat('A1'));
      expect(el.innerHTML).toBe(without);
      expect(picked).toEqual([['A1'], ['A1']]);
    });

    it('on a read-only map keeps seats clickable and keyboard-reachable, with selection off', () => {
      mount(events({ interactive: false }));
      expect(tabStops()).toEqual(['A1', 'L1']);
      expect(seat('A1').hasAttribute('aria-pressed')).toBe(false);
      click(seat('A1'));
      key(seat('A1'), 'Enter');
      expect(clicks.map((c) => [c.seat.id, c.selected, c.source])).toEqual([
        ['A1', false, 'pointer'],
        ['A1', false, 'keyboard'],
      ]);
      // Selection stays off: nothing toggles, nothing is announced as selected.
      expect(order).toEqual(['click', 'click']);
      expect(el.querySelectorAll('[aria-pressed]')).toHaveLength(0);
    });

    it('moves focus between seats of a read-only map with the arrow keys', () => {
      mount(events({ interactive: false }));
      act(() => seat('A1').focus());
      key(seat('A1'), 'ArrowRight');
      expect(document.activeElement).toBe(seat('A2'));
    });

    it('turns the read-only behaviour back off when the callback goes', () => {
      const { update } = mount(events({ interactive: false }));
      update({ onSeatClick: undefined });
      expect(tabStops()).toEqual([]);
      expect(seat('A1').getAttribute('aria-pressed')).toBe('false');
    });

    it('reports nothing for a tap that became a pan', () => {
      mount(events({ zoomable: true }));
      const view = el.querySelector('.kerusi-viewport')!;
      const touch = (type: string, x: number) =>
        act(() => {
          fireEvent(view, new PointerEvent(type, pointerInit('touch', { clientX: x, clientY: 0 })));
        });
      touch('pointerdown', 10);
      touch('pointermove', 80);
      touch('pointerup', 80);
      click(seat('A1'));
      expect(clicks).toEqual([]);
    });
  });

  describe('hover card', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const hoverCard = (ctx: { seat: RenderSeat; trigger: string }) => (
      <span className="detail">
        {ctx.seat.id}:{ctx.trigger}
      </span>
    );

    it('opens after the open delay, named by the seat, and closes after the close delay', () => {
      mount({ renderHoverCard: hoverCard });
      enter(seat('A1'));
      expect(card()).toBeNull();
      tick(149);
      expect(card()).toBeNull();
      tick(1);
      expect(card('hover')).toHaveTextContent('A1:hover');
      expect(card('hover')!.getAttribute('role')).toBe('tooltip');
      expect(seat('A1').getAttribute('aria-describedby')).toBe(card('hover')!.id);

      leave(seat('A1'));
      tick(99);
      expect(card('hover')).not.toBeNull();
      tick(1);
      expect(card()).toBeNull();
      expect(seat('A1').hasAttribute('aria-describedby')).toBe(false);
    });

    it('honours hoverCardDelay', () => {
      mount({ renderHoverCard: hoverCard, hoverCardDelay: { open: 0, close: 400 } });
      enter(seat('A1'));
      expect(card('hover')).not.toBeNull();
      leave(seat('A1'));
      tick(399);
      expect(card('hover')).not.toBeNull();
      tick(1);
      expect(card()).toBeNull();
    });

    it('lets the pointer travel into the card and stays while it is there (hoverable)', () => {
      mount({ renderHoverCard: hoverCard });
      enter(seat('A1'));
      tick(150);
      leave(seat('A1'));
      enter(card('hover')!);
      tick(500);
      expect(card('hover')).not.toBeNull();
      leave(card('hover')!);
      tick(100);
      expect(card()).toBeNull();
    });

    it('is dismissed by Escape and stays dismissed while the pointer stays on the seat', () => {
      mount({ renderHoverCard: hoverCard });
      enter(seat('A1'));
      tick(150);
      const escape = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      act(() => void document.body.dispatchEvent(escape));
      expect(card()).toBeNull();
      expect(escape.defaultPrevented).toBe(true);
      move(seat('A1'));
      tick(500);
      expect(card()).toBeNull();
      leave(seat('A1'));
      enter(seat('A1'));
      tick(150);
      expect(card('hover')).not.toBeNull();
    });

    it('is closed when a pan or zoom starts', () => {
      mount({ renderHoverCard: hoverCard, zoomable: true });
      enter(seat('A1'));
      tick(150);
      const view = el.querySelector('.kerusi-viewport')!;
      act(() => {
        fireEvent(
          view,
          new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -50 }),
        );
      });
      expect(card()).toBeNull();
    });

    it('never shows for touch', () => {
      mount({ renderHoverCard: hoverCard });
      enter(seat('A1'), 'touch');
      tick(1000);
      expect(card()).toBeNull();
    });

    it('shows no card for a seat whose function returns nothing', () => {
      mount({ renderHoverCard: (ctx) => (ctx.seat.status === 'booked' ? <b>booked</b> : null) });
      enter(seat('A1'));
      tick(150);
      expect(card()).toBeNull();
      leave(seat('A1'), seat('A2'));
      expect(card('hover')).toHaveTextContent('booked');
      expect(seat('A1').hasAttribute('aria-describedby')).toBe(false);
    });

    it('works on a read-only map', () => {
      mount({ renderHoverCard: hoverCard, interactive: false });
      enter(seat('A2'));
      tick(150);
      expect(card('hover')).toHaveTextContent('A2:hover');
    });

    it('is hidden while the same seat has its click card open', () => {
      mount({ renderHoverCard: hoverCard, renderClickCard: () => <i>click</i> });
      enter(seat('A1'));
      tick(150);
      expect(card('hover')).not.toBeNull();
      click(seat('A1'));
      expect(card('click')).not.toBeNull();
      expect(card('hover')).toBeNull();
    });

    describe('on keyboard focus (D12)', () => {
      it('shows nothing by default', () => {
        mount({ renderHoverCard: hoverCard });
        act(() => seat('A1').focus());
        tick(1000);
        expect(card()).toBeNull();
      });

      it('shows at once with hoverCardOnFocus, with trigger "focus", and closes on blur', () => {
        mount({ renderHoverCard: hoverCard, hoverCardOnFocus: true });
        act(() => seat('A1').focus());
        expect(card('hover')).toHaveTextContent('A1:focus');
        expect(seat('A1').getAttribute('aria-describedby')).toBe(card('hover')!.id);
        act(() => seat('A1').blur());
        expect(card()).toBeNull();
      });

      it('makes the seats of a read-only map reachable, so focus has somewhere to go', () => {
        mount({ renderHoverCard: hoverCard, hoverCardOnFocus: true, interactive: false });
        expect(tabStops()).toEqual(['A1', 'L1']);
      });
    });
  });

  describe('click card', () => {
    const clickCard = (ctx: { seat: RenderSeat; selected: boolean; close: () => void }) => (
      <div>
        <span className="detail">
          {ctx.seat.id}:{String(ctx.selected)}
        </span>
        <button type="button" onClick={ctx.close}>
          Done
        </button>
      </div>
    );

    it('opens on a click, as a non-modal dialog labelled by the seat', () => {
      mount({ renderClickCard: clickCard });
      click(seat('A2'));
      const dialog = card('click')!;
      expect(dialog).toHaveTextContent('A2:false');
      expect(dialog.getAttribute('role')).toBe('dialog');
      expect(dialog.getAttribute('aria-label')).toBe(seat('A2').getAttribute('aria-label'));
      expect(dialog.hasAttribute('aria-modal')).toBe(false);
      expect(handle.current!.openSeatCardId).toBe('A2');
    });

    it('opens for a booked seat too, which is what a who-sits-where map needs', () => {
      mount({ renderClickCard: clickCard, interactive: false });
      click(seat('A2'));
      expect(card('click')).toHaveTextContent('A2');
      expect(el.querySelectorAll('[aria-pressed]')).toHaveLength(0);
    });

    it('also toggles a selectable seat, and tells the card so', () => {
      mount({ renderClickCard: clickCard });
      click(seat('A1'));
      expect(seat('A1').getAttribute('aria-pressed')).toBe('true');
      expect(card('click')).toHaveTextContent('A1:true');
    });

    it('closes on a second click on the same seat, and moves to another seat’s click', () => {
      mount({ renderClickCard: clickCard });
      click(seat('A2'));
      click(seat('A4'));
      expect(el.querySelectorAll('.kerusi-seat-card')).toHaveLength(1);
      expect(card('click')).toHaveTextContent('A4');
      click(seat('A4'));
      expect(card()).toBeNull();
    });

    it('closes from its own buttons through ctx.close()', () => {
      mount({ renderClickCard: clickCard });
      click(seat('A2'));
      click(card('click')!.querySelector('button')!);
      expect(card()).toBeNull();
    });

    it('closes on a press outside the card and the seats, not on one inside', () => {
      mount({ renderClickCard: clickCard });
      click(seat('A2'));
      act(() => {
        fireEvent.pointerDown(card('click')!.querySelector('.detail')!);
      });
      expect(card('click')).not.toBeNull();
      act(() => {
        fireEvent.pointerDown(seat('A4'));
      });
      expect(card('click')).not.toBeNull();
      act(() => {
        fireEvent.pointerDown(document.body);
      });
      expect(card()).toBeNull();
    });

    it('opens from the keyboard with focus moved into it, and Escape returns focus to the seat', async () => {
      mount({ renderClickCard: clickCard });
      act(() => seat('A2').focus());
      key(seat('A2'), 'Enter');
      expect(card('click')!.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).toBe(card('click')!.querySelector('button'));

      key(document.activeElement!, 'Escape');
      expect(card()).toBeNull();
      await act(async () => {});
      expect(document.activeElement).toBe(seat('A2'));
    });

    it('closes on Escape from the seat without taking focus anywhere', () => {
      mount({ renderClickCard: clickCard });
      click(seat('A1'));
      act(() => seat('A1').focus());
      const escape = key(seat('A1'), 'Escape');
      expect(card()).toBeNull();
      expect(escape.defaultPrevented).toBe(true);
      // The card took the Escape, so the selection it did not clear is still there.
      expect(seat('A1').getAttribute('aria-pressed')).toBe('true');
    });

    it('shows no card when the function returns nothing', () => {
      mount({ renderClickCard: (ctx) => (ctx.seat.status === 'booked' ? <b>booked</b> : null) });
      click(seat('A1'));
      expect(card()).toBeNull();
      expect(handle.current!.openSeatCardId).toBeNull();
      click(seat('A2'));
      expect(card('click')).toHaveTextContent('booked');
    });

    it('re-renders with the seat’s new state, and closes if the seat goes', () => {
      const booked: KerusiState = {
        ...PARITY_STATE,
        seats: { ...PARITY_STATE.seats, A1: { status: 'booked' } },
      };
      const ui = (props: Partial<KerusiSeatmapProps>) => (
        <KerusiSeatmap
          map={PARITY_MAP}
          state={PARITY_STATE}
          renderClickCard={(ctx) => <span className="detail">{ctx.seat.status}</span>}
          {...props}
        />
      );
      const result = render(ui({}));
      el = result.container;
      click(seat('A1'));
      expect(card('click')).toHaveTextContent('available');
      result.rerender(ui({ state: booked }));
      expect(card('click')).toHaveTextContent('booked');
      result.rerender(ui({ state: booked, sectionOverrides: { stalls: { hidden: true } } }));
      expect(card()).toBeNull();
    });

    it('is opened and closed from the handle', () => {
      mount({ renderClickCard: clickCard });
      act(() => handle.current!.openSeatCard('A4'));
      expect(card('click')).toHaveTextContent('A4');
      expect(handle.current!.openSeatCardId).toBe('A4');
      act(() => handle.current!.openSeatCard('no-such-seat'));
      expect(handle.current!.openSeatCardId).toBe('A4');
      act(() => handle.current!.closeSeatCard());
      expect(card()).toBeNull();
      expect(handle.current!.openSeatCardId).toBeNull();
    });

    it('is not opened by the handle without a click card', () => {
      mount();
      act(() => handle.current!.openSeatCard('A1'));
      expect(card()).toBeNull();
    });
  });

  describe('styling hooks (D11)', () => {
    const open = (props: Partial<KerusiSeatmapProps> = {}) => {
      mount({ renderClickCard: () => <em>hi</em>, ...props });
      click(seat('A2'));
      return card('click')!;
    };

    it('mirrors the seat as data attributes, and the side actually used', () => {
      const c = open();
      expect(c.dataset).toMatchObject({
        seatId: 'A2',
        seatStatus: 'booked',
        seatType: 'std',
        sectionId: 'stalls',
      });
      expect(['top', 'bottom', 'left', 'right']).toContain(c.dataset['placement']);
    });

    it('carries the consumer’s own classes', () => {
      expect(open({ seatCardClassName: 'my-card other' }).className).toBe(
        'kerusi-seat-card kerusi-seat-card--click my-card other',
      );
    });

    it('wraps the content in a body and ends with an arrow', () => {
      const c = open();
      expect(c.querySelector('.kerusi-seat-card__body')).toHaveTextContent('hi');
      expect(c.querySelector('.kerusi-seat-card__arrow')).not.toBeNull();
    });

    it('drops the chrome and the arrow with seatCardAppearance="none"', () => {
      const c = open({ seatCardAppearance: 'none' });
      expect(c.classList.contains('kerusi-seat-card--bare')).toBe(true);
      expect(c.querySelector('.kerusi-seat-card__arrow')).toBeNull();
    });

    it('sits inside the map root, outside the clipped viewport', () => {
      const c = open({ zoomable: true });
      expect(c.parentElement).toBe(root());
      expect(c.closest('.kerusi-viewport')).toBeNull();
    });

    it('is placed with an inline left and top, and no colour of its own', () => {
      const c = open();
      expect(c.style.left).not.toBe('');
      expect(c.style.top).not.toBe('');
      expect(c.style.background).toBe('');
      expect(c.style.color).toBe('');
    });
  });

  describe('markup', () => {
    it('is unchanged with no card configured', () => {
      mount();
      const plain = el.innerHTML;
      el.remove();
      mount({ onSeatHover: () => undefined, onSeatClick: () => undefined });
      // Listening adds no attribute, class or element to a map that takes selection.
      expect(el.innerHTML).toBe(plain);
    });

    it('draws one open click card the same way as the Angular binding (parity)', () => {
      mount({ renderClickCard: (ctx) => <span className="detail">Booked {ctx.seat.id}</span> });
      click(seat('A2'));
      expect(svgSignature(card('click')!)).toBe(PARITY_CARD_SIGNATURE);
    });
  });
});
