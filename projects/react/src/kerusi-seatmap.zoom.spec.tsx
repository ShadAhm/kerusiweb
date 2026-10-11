import type { KerusiMap, KerusiViewport } from '@kerusiweb/core';
import { act, fireEvent, render } from '@testing-library/react';
import { createRef, useState } from 'react';
import type { RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KerusiSeatmap } from './kerusi-seatmap.js';
import type { KerusiSeatmapHandle, KerusiSeatmapProps } from './types.js';

/** A 10 x 30 grid: 300 seats, the size the issue calls out. */
function bigMap(rows = 10, cols = 30): KerusiMap {
  const rowDefs = Array.from({ length: rows }, (_, r) => ({
    id: `R${r}`,
    label: String.fromCharCode(65 + r),
    index: r,
  }));
  return {
    kerusi: '1.0',
    id: 'big',
    name: 'Big hall',
    locale: 'en',
    legend: [{ id: 'standard', label: { en: 'Standard' }, color: '#3a8f63' }],
    sections: [
      {
        id: 'main',
        index: 1,
        label: { en: 'Main' },
        layout: 'grid',
        rows: rowDefs,
        seats: rowDefs.flatMap((row) =>
          Array.from({ length: cols }, (_, c) => ({
            id: `${row.label}${c + 1}`,
            label: String(c + 1),
            row: row.id,
            col: c + 1,
            type: 'standard',
          })),
        ),
      },
    ],
  };
}

const MAP = bigMap();

/** Holds the selection, as a host would, so a tap can be seen to select. */
function Harness({
  handle,
  ...props
}: Partial<KerusiSeatmapProps> & { handle?: RefObject<KerusiSeatmapHandle | null> }) {
  const [selection, setSelection] = useState<readonly string[]>([]);
  return (
    <KerusiSeatmap
      ref={handle}
      map={MAP}
      selection={selection}
      onSelectionChange={setSelection}
      {...props}
    />
  );
}

/** jsdom does no layout, so give the viewport and the map inside it a 375 x 600 phone. */
const SIZE = { width: 375, height: 600 };
const SIZE_PROPS = ['clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight'] as const;

function stubLayout(): () => void {
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const prop of SIZE_PROPS) {
    saved.set(prop, Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop));
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) {
        const sized =
          this.classList.contains('kerusi-viewport') ||
          this.classList.contains('kerusi-viewport__content');
        return sized ? SIZE[prop.endsWith('Width') ? 'width' : 'height'] : 0;
      },
    });
  }
  return () => {
    for (const prop of SIZE_PROPS) {
      const original = saved.get(prop);
      if (original) {
        Object.defineProperty(HTMLElement.prototype, prop, original);
      } else {
        delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop];
      }
    }
  };
}

describe('KerusiSeatmap: zoom, pan and maximize', () => {
  let restoreLayout: () => void;
  let container: HTMLElement;
  let handle: RefObject<KerusiSeatmapHandle | null>;
  let viewports: KerusiViewport[];
  let maximizedEvents: boolean[];

  const mount = (props: Partial<KerusiSeatmapProps> = {}) => {
    const ui = (extra: Partial<KerusiSeatmapProps>) => (
      <Harness
        handle={handle}
        onViewportChange={(v) => viewports.push(v)}
        onMaximizedChange={(m) => maximizedEvents.push(m)}
        {...props}
        {...extra}
      />
    );
    const result = render(ui({}));
    container = result.container;
    return {
      /** Re-renders the same harness with changed props. */
      update: (extra: Partial<KerusiSeatmapProps>) => result.rerender(ui(extra)),
    };
  };

  beforeEach(() => {
    restoreLayout = stubLayout();
    handle = createRef<KerusiSeatmapHandle | null>();
    viewports = [];
    maximizedEvents = [];
  });

  afterEach(() => {
    restoreLayout();
    document.body.style.overflow = '';
  });

  const root = () => container.querySelector<HTMLElement>('.kerusi-seatmap')!;
  const viewport = () => container.querySelector<HTMLElement>('.kerusi-viewport');
  const content = () => container.querySelector<HTMLElement>('.kerusi-viewport__content')!;
  const seat = (id: string) => container.querySelector<SVGGElement>(`[data-seat-id="${id}"]`)!;
  const button = (name: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  const transform = () => content().style.transform;
  const current = () => handle.current!.viewport;
  const selected = () =>
    [...container.querySelectorAll<SVGGElement>('g.kerusi-seat[aria-pressed="true"]')].map(
      (g) => g.dataset['seatId'],
    );

  const pointer = (
    target: Element,
    type: string,
    id: number,
    x: number,
    y: number,
    extra: PointerEventInit = {},
  ) =>
    fireEvent(
      target,
      new PointerEvent(type, {
        pointerId: id,
        clientX: x,
        clientY: y,
        button: 0,
        pointerType: 'touch',
        bubbles: true,
        cancelable: true,
        ...extra,
      }),
    );
  const click = (target: Element) =>
    fireEvent(target, new MouseEvent('click', { bubbles: true, cancelable: true }));
  const key = (target: Element, k: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', {
      key: k,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    fireEvent(target, event);
    return event;
  };
  const wheel = (init: WheelEventInit) => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
    fireEvent(viewport()!, event);
    return event;
  };

  /** Two fingers 100px apart on the horizontal midline, then moved to `spread` apart. */
  const pinch = (spread: number, target: Element = viewport()!) => {
    pointer(target, 'pointerdown', 1, 137.5, 300);
    pointer(target, 'pointerdown', 2, 237.5, 300);
    pointer(target, 'pointermove', 1, 187.5 - spread / 2, 300);
    pointer(target, 'pointermove', 2, 187.5 + spread / 2, 300);
    pointer(target, 'pointerup', 2, 187.5 + spread / 2, 300);
    pointer(target, 'pointerup', 1, 187.5 - spread / 2, 300);
  };

  describe('off by default', () => {
    beforeEach(() => {
      mount();
    });

    it('renders the same markup a plain map always did', () => {
      expect(viewport()).toBeNull();
      expect(container.querySelector('.kerusi-toolbar')).toBeNull();
      expect(container.querySelector('.kerusi-seatmap__stage')).toBeNull();
      expect(container.querySelector('button')).toBeNull();
      expect(root().className).toBe('kerusi-seatmap');
      expect(root().getAttribute('style')).toBeNull();
      expect(container.innerHTML).not.toContain('touch-action');
      // The section is still a direct child of the map, with no wrapper between.
      expect(root().querySelector(':scope > section.kerusi-seatmap__section')).not.toBeNull();
    });

    it('ignores the zoom keys and the zoom methods', () => {
      key(seat('A1'), '+');
      act(() => handle.current!.zoomIn());
      act(() => handle.current!.resetZoom());
      expect(viewports).toHaveLength(0);
      expect(current()).toEqual({ zoom: 1, x: 0, y: 0 });
    });

    it('leaves a tap on a seat selecting, exactly as before', () => {
      click(seat('A1'));
      expect(selected()).toEqual(['A1']);
    });
  });

  describe('zoomable', () => {
    beforeEach(() => {
      mount({ zoomable: true });
    });

    it('wraps the map in a focusable, named viewport', () => {
      const view = viewport()!;
      expect(view.getAttribute('tabindex')).toBe('0');
      expect(view.getAttribute('role')).toBe('group');
      expect(view.getAttribute('aria-label')).toMatch(/zoomable/i);
      expect(transform()).toBe('translate(0px, 0px) scale(1)');
      expect(container.querySelectorAll('.kerusi-viewport__content section')).toHaveLength(1);
    });

    it('sets touch-action so a pinch does not scroll the page, and takes every gesture once zoomed in', () => {
      expect(viewport()!.style.touchAction).toBe('pan-y');
      fireEvent.click(button('Zoom in')!);
      expect(viewport()!.style.touchAction).toBe('none');
    });

    it('gives every control a real button with an accessible name', () => {
      const names = [...container.querySelectorAll('.kerusi-toolbar button')].map((b) => [
        b.tagName,
        b.getAttribute('type'),
        b.getAttribute('aria-label'),
      ]);
      expect(names).toEqual([
        ['BUTTON', 'button', 'Zoom in'],
        ['BUTTON', 'button', 'Zoom out'],
        ['BUTTON', 'button', 'Reset zoom'],
      ]);
      expect(container.querySelector('.kerusi-toolbar')!.getAttribute('role')).toBe('toolbar');
    });

    it('uses the --kerusi-* tokens for the buttons, with no colour of its own', () => {
      const style = button('Zoom in')!.getAttribute('style')!;
      expect(style).toContain('var(--kerusi-element-bg');
      expect(style).toContain('var(--kerusi-element-fg');
    });

    describe('buttons', () => {
      it('zoom in and out, and announce the new viewport', () => {
        fireEvent.click(button('Zoom in')!);
        expect(current().zoom).toBeCloseTo(1.5);
        expect(transform()).toContain('scale(1.5)');
        expect(viewports.at(-1)!.zoom).toBeCloseTo(1.5);

        fireEvent.click(button('Zoom out')!);
        expect(current().zoom).toBeCloseTo(1);
      });

      it('reset returns the original view', () => {
        fireEvent.click(button('Zoom in')!);
        fireEvent.click(button('Zoom in')!);
        fireEvent.click(button('Reset zoom')!);
        expect(current()).toEqual({ zoom: 1, x: 0, y: 0 });
        expect(transform()).toBe('translate(0px, 0px) scale(1)');
        expect(viewports.at(-1)).toEqual({ zoom: 1, x: 0, y: 0 });
      });

      it('mark a limit with aria-disabled and stay focusable', () => {
        const zoomOut = button('Zoom out')!;
        expect(zoomOut.getAttribute('aria-disabled')).toBe('true');
        expect(zoomOut.hasAttribute('disabled')).toBe(false);

        for (let i = 0; i < 12; i++) {
          fireEvent.click(button('Zoom in')!);
        }
        expect(current().zoom).toBe(4);
        expect(button('Zoom in')!.getAttribute('aria-disabled')).toBe('true');
        expect(zoomOut.getAttribute('aria-disabled')).toBe('false');
      });
    });

    describe('wheel and trackpad pinch', () => {
      it('zooms on Ctrl + wheel and stops the page zooming too', () => {
        const event = wheel({ ctrlKey: true, deltaY: -40, clientX: 100, clientY: 200 });
        expect(event.defaultPrevented).toBe(true);
        expect(current().zoom).toBeGreaterThan(1);
      });

      it('zooms on Cmd + wheel', () => {
        wheel({ metaKey: true, deltaY: -40 });
        expect(current().zoom).toBeGreaterThan(1);
      });

      it('leaves a plain wheel to scroll the page', () => {
        const event = wheel({ deltaY: -120 });
        expect(event.defaultPrevented).toBe(false);
        expect(current().zoom).toBe(1);
      });

      it('clamps at the ceiling', () => {
        for (let i = 0; i < 60; i++) {
          wheel({ ctrlKey: true, deltaY: -100, clientX: 300, clientY: 500 });
        }
        expect(current().zoom).toBe(4);
      });

      it('clamps at fit and never shrinks below the container', () => {
        fireEvent.click(button('Zoom in')!);
        for (let i = 0; i < 60; i++) {
          wheel({ ctrlKey: true, deltaY: 100 });
        }
        expect(current()).toEqual({ zoom: 1, x: 0, y: 0 });
      });

      it('keeps the point under the pointer where it was', () => {
        wheel({ ctrlKey: true, deltaY: -30, clientX: 100, clientY: 200 });
        const { zoom, x, y } = current();
        expect((100 - x) / zoom).toBeCloseTo(100);
        expect((200 - y) / zoom).toBeCloseTo(200);
      });

      it('moves the map directly rather than easing behind the wheel', () => {
        fireEvent.click(button('Zoom in')!);
        expect(content().classList.contains('kerusi-viewport__content--animated')).toBe(true);
        wheel({ ctrlKey: true, deltaY: -20 });
        expect(content().classList.contains('kerusi-viewport__content--animated')).toBe(false);
      });
    });

    describe('pinch', () => {
      it('zooms by the spread of two fingers', () => {
        pinch(200);
        expect(current().zoom).toBeCloseTo(2);
      });

      it('clamps at the ceiling however wide the fingers go', () => {
        pinch(5000);
        expect(current().zoom).toBe(4);
      });

      it('clamps at fit however close the fingers get', () => {
        fireEvent.click(button('Zoom in')!);
        pinch(2);
        expect(current()).toEqual({ zoom: 1, x: 0, y: 0 });
      });

      it('zooms a 300-seat map to 3x on a 375px phone and keeps it in bounds', () => {
        pinch(300);
        const { zoom, x, y } = current();
        expect(zoom).toBeCloseTo(3);
        expect(x).toBeLessThanOrEqual(0);
        expect(x).toBeGreaterThanOrEqual(SIZE.width - SIZE.width * zoom);
        expect(y).toBeGreaterThanOrEqual(SIZE.height - SIZE.height * zoom);
        expect(container.querySelectorAll('g.kerusi-seat')).toHaveLength(300);
      });

      it('does not select the seat the fingers were on', () => {
        pinch(200, seat('A1'));
        click(seat('A1'));
        expect(selected()).toEqual([]);
      });
    });

    describe('tap versus drag', () => {
      it('a tap selects the seat, then a second tap deselects it', () => {
        pointer(seat('B2'), 'pointerdown', 1, 50, 50);
        pointer(seat('B2'), 'pointerup', 1, 50, 50);
        click(seat('B2'));
        expect(selected()).toEqual(['B2']);

        pointer(seat('B2'), 'pointerdown', 1, 50, 50);
        pointer(seat('B2'), 'pointerup', 1, 50, 50);
        click(seat('B2'));
        expect(selected()).toEqual([]);
      });

      it('a wobble inside the slop is still a tap', () => {
        fireEvent.click(button('Zoom in')!);
        const before = current();
        pointer(seat('B2'), 'pointerdown', 1, 50, 50);
        pointer(seat('B2'), 'pointermove', 1, 55, 53);
        pointer(seat('B2'), 'pointerup', 1, 55, 53);
        click(seat('B2'));
        expect(selected()).toEqual(['B2']);
        expect(current()).toEqual(before);
      });

      it('a tap selects at every zoom level, including 3x', () => {
        pinch(300);
        expect(current().zoom).toBeCloseTo(3);
        pointer(seat('J30'), 'pointerdown', 1, 300, 400);
        pointer(seat('J30'), 'pointerup', 1, 300, 400);
        click(seat('J30'));
        expect(selected()).toEqual(['J30']);
        expect(current().zoom).toBeCloseTo(3);
      });

      it('a drag pans and selects nothing', () => {
        fireEvent.click(button('Zoom in')!);
        fireEvent.click(button('Zoom in')!);
        const before = current();
        pointer(seat('B2'), 'pointerdown', 1, 200, 200);
        pointer(seat('B2'), 'pointermove', 1, 150, 170);
        pointer(seat('B2'), 'pointerup', 1, 150, 170);
        click(seat('B2'));
        expect(selected()).toEqual([]);
        expect(current().x).toBeCloseTo(before.x - 50);
        expect(current().y).toBeCloseTo(before.y - 30);
      });

      it('does not swallow the next, real click after a drag', () => {
        pointer(seat('B2'), 'pointerdown', 1, 200, 200);
        pointer(seat('B2'), 'pointermove', 1, 150, 200);
        pointer(seat('B2'), 'pointerup', 1, 150, 200);
        click(seat('B2'));
        pointer(seat('B2'), 'pointerdown', 1, 90, 90);
        pointer(seat('B2'), 'pointerup', 1, 90, 90);
        click(seat('B2'));
        expect(selected()).toEqual(['B2']);
      });

      it('drags with the mouse too, but only the primary button', () => {
        fireEvent.click(button('Zoom in')!);
        const before = current();
        pointer(seat('B2'), 'pointerdown', 1, 200, 200, { pointerType: 'mouse', button: 2 });
        pointer(seat('B2'), 'pointermove', 1, 100, 200, { pointerType: 'mouse' });
        expect(current()).toEqual(before);

        pointer(seat('B2'), 'pointerdown', 2, 200, 200, { pointerType: 'mouse' });
        pointer(seat('B2'), 'pointermove', 2, 150, 200, { pointerType: 'mouse' });
        pointer(seat('B2'), 'pointerup', 2, 150, 200, { pointerType: 'mouse' });
        expect(current().x).toBeCloseTo(before.x - 50);
      });

      it('keeps the pan inside the map', () => {
        fireEvent.click(button('Zoom in')!);
        fireEvent.click(button('Zoom in')!);
        pointer(seat('B2'), 'pointerdown', 1, 300, 300);
        pointer(seat('B2'), 'pointermove', 1, 9000, 9000);
        pointer(seat('B2'), 'pointerup', 1, 9000, 9000);
        expect(current().x).toBe(0);
        expect(current().y).toBe(0);
      });

      it('lets the browser take the gesture on a cancel without suppressing a click', () => {
        pointer(seat('B2'), 'pointerdown', 1, 200, 200);
        pointer(seat('B2'), 'pointermove', 1, 200, 400);
        pointer(seat('B2'), 'pointercancel', 1, 200, 400);
        click(seat('B2'));
        expect(selected()).toEqual(['B2']);
      });
    });

    describe('keyboard', () => {
      it('zooms with + and -, and resets with 0, from the viewport', () => {
        key(viewport()!, '+');
        expect(current().zoom).toBeCloseTo(1.5);
        key(viewport()!, '+');
        key(viewport()!, '-');
        expect(current().zoom).toBeCloseTo(1.5);
        key(viewport()!, '0');
        expect(current()).toEqual({ zoom: 1, x: 0, y: 0 });
      });

      it('zooms from a focused seat too', () => {
        const event = key(seat('A1'), '=');
        expect(event.defaultPrevented).toBe(true);
        expect(current().zoom).toBeCloseTo(1.5);
      });

      it('leaves the browser its own Ctrl/Cmd zoom shortcuts', () => {
        const event = key(viewport()!, '+', { ctrlKey: true });
        expect(event.defaultPrevented).toBe(false);
        expect(current().zoom).toBe(1);
      });

      it('pans with the arrow keys when the viewport itself has focus', () => {
        fireEvent.click(button('Zoom in')!);
        fireEvent.click(button('Zoom in')!);
        const before = current();
        key(viewport()!, 'ArrowRight');
        expect(current().x).toBeLessThan(before.x);
        key(viewport()!, 'ArrowLeft');
        expect(current().x).toBeCloseTo(before.x);
        key(viewport()!, 'ArrowDown');
        expect(current().y).toBeLessThan(before.y);
      });

      it('keeps arrows moving seat focus when a seat has focus', () => {
        fireEvent.click(button('Zoom in')!);
        fireEvent.click(button('Zoom in')!);
        const before = current();
        key(seat('A1'), 'ArrowRight');
        expect(current().x).toBeCloseTo(before.x);
      });

      it('scrolls a seat that takes keyboard focus into view', () => {
        pinch(300);
        const before = current();
        const target = seat('A30');
        vi.spyOn(target, 'matches').mockReturnValue(true);
        vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
          left: 500,
          top: 100,
          width: 30,
          height: 30,
          right: 530,
          bottom: 130,
          x: 500,
          y: 100,
          toJSON: () => ({}),
        });
        fireEvent.focus(target);
        // 530 is past the 375px edge: the map moves left until it is inside the margin.
        expect(current().x).toBeLessThan(before.x);
      });

      it('does not move the map when a click focuses a seat', () => {
        pinch(300);
        const before = current();
        const target = seat('A30');
        vi.spyOn(target, 'matches').mockReturnValue(false);
        vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
          left: 500,
          top: 100,
          width: 30,
          height: 30,
          right: 530,
          bottom: 130,
          x: 500,
          y: 100,
          toJSON: () => ({}),
        });
        fireEvent.focus(target);
        expect(current()).toEqual(before);
      });
    });
  });

  describe('zoomable options', () => {
    it('respects maxZoom', () => {
      mount({ zoomable: true, maxZoom: 2 });
      for (let i = 0; i < 6; i++) {
        fireEvent.click(button('Zoom in')!);
      }
      expect(current().zoom).toBe(2);
    });

    it('takes the control names from controlStrings', () => {
      mount({ zoomable: true, controlStrings: { zoomIn: 'Zum masuk', zoomReset: 'Set semula' } });
      expect(button('Zum masuk')).not.toBeNull();
      expect(button('Set semula')).not.toBeNull();
      expect(button('Zoom out')).not.toBeNull();
    });

    it('can have its buttons replaced by the host: hidden, with the methods still working', () => {
      mount({ zoomable: true, showZoomControls: false });
      expect(container.querySelector('button')).toBeNull();
      act(() => handle.current!.zoomIn());
      expect(viewports.at(-1)!.zoom).toBeCloseTo(1.5);
    });

    it('puts the map back as it was when zoomable is switched off', () => {
      const { update } = mount({ zoomable: true });
      fireEvent.click(button('Zoom in')!);
      update({ zoomable: false });
      expect(viewport()).toBeNull();
      expect(container.querySelector('button')).toBeNull();
      expect(current()).toEqual({ zoom: 1, x: 0, y: 0 });
    });

    it('leaves a key typed into the host’s own field alone', () => {
      const { update } = mount({ zoomable: true });
      update({ zoomable: true, children: <input aria-label="Seat note" /> });
      const input = container.querySelector('input')!;
      const event = key(input, '+');
      expect(event.defaultPrevented).toBe(false);
      expect(current().zoom).toBe(1);
    });
  });

  describe('maximizable', () => {
    const fullscreenElement = { value: null as Element | null };

    beforeEach(() => {
      fullscreenElement.value = null;
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        get: () => fullscreenElement.value,
      });
    });

    afterEach(() => {
      delete (document as unknown as Record<string, unknown>)['fullscreenElement'];
    });

    it('adds only a maximize button when the map is not zoomable', () => {
      mount({ maximizable: true });
      const names = [...container.querySelectorAll('button')].map((b) =>
        b.getAttribute('aria-label'),
      );
      expect(names).toEqual(['Enter full screen']);
      expect(viewport()).toBeNull();
    });

    it('is absent unless asked for', () => {
      mount();
      expect(container.querySelector('button')).toBeNull();
    });

    it('sits beside the zoom buttons when both are on', () => {
      mount({ maximizable: true, zoomable: true });
      const names = [...container.querySelectorAll('button')].map((b) =>
        b.getAttribute('aria-label'),
      );
      expect(names).toEqual(['Zoom in', 'Zoom out', 'Reset zoom', 'Enter full screen']);
    });

    it('maximizes, renames the button, freezes the page and reports it', () => {
      mount({ maximizable: true });
      fireEvent.click(button('Enter full screen')!);
      expect(root().classList.contains('kerusi-seatmap--maximized')).toBe(true);
      expect(button('Exit full screen')).not.toBeNull();
      expect(button('Enter full screen')).toBeNull();
      expect(document.body.style.overflow).toBe('hidden');
      expect(maximizedEvents).toEqual([true]);
      expect(handle.current!.maximized).toBe(true);
      // Colour comes from the tokens, with the page's canvas behind a transparent backdrop.
      expect(root().getAttribute('style')).toContain('var(--kerusi-backdrop');
    });

    it('keeps the host’s className and style when maximized', () => {
      mount({ maximizable: true, className: 'mine', style: { margin: '3px' } });
      fireEvent.click(button('Enter full screen')!);
      expect(root().className).toBe('kerusi-seatmap mine kerusi-seatmap--maximized');
      expect(root().style.margin).toBe('3px');
    });

    it('restores, and gives the page its scrolling back', () => {
      document.body.style.overflow = 'scroll';
      mount({ maximizable: true });
      fireEvent.click(button('Enter full screen')!);
      fireEvent.click(button('Exit full screen')!);
      expect(root().classList.contains('kerusi-seatmap--maximized')).toBe(false);
      expect(root().style.background).toBe('');
      expect(root().style.color).toBe('');
      expect(document.body.style.overflow).toBe('scroll');
      expect(maximizedEvents).toEqual([true, false]);
    });

    it('leaves on Escape from the map', () => {
      mount({ maximizable: true });
      fireEvent.click(button('Enter full screen')!);
      const event = key(seat('A1'), 'Escape');
      expect(event.defaultPrevented).toBe(true);
      expect(handle.current!.maximized).toBe(false);
    });

    it('lets Escape clear the selection first, as it always has, then leave', () => {
      mount({ maximizable: true });
      fireEvent.click(button('Enter full screen')!);
      click(seat('A1'));
      expect(selected()).toEqual(['A1']);

      key(seat('A1'), 'Escape');
      expect(selected()).toEqual([]);
      expect(handle.current!.maximized).toBe(true);

      key(seat('A1'), 'Escape');
      expect(handle.current!.maximized).toBe(false);
    });

    it('ignores Escape when not maximized', () => {
      mount({ maximizable: true });
      const event = key(seat('A1'), 'Escape');
      expect(event.defaultPrevented).toBe(false);
      expect(maximizedEvents).toEqual([]);
    });

    it('cannot be maximized by method when it was not asked for', () => {
      mount();
      act(() => handle.current!.toggleMaximized());
      expect(handle.current!.maximized).toBe(false);
    });

    it('un-maximizes if maximizable is switched off underneath it', () => {
      const { update } = mount({ maximizable: true });
      fireEvent.click(button('Enter full screen')!);
      update({ maximizable: false });
      expect(handle.current!.maximized).toBe(false);
      expect(root().classList.contains('kerusi-seatmap--maximized')).toBe(false);
    });

    it('asks the browser for native full screen too, and follows it out', () => {
      mount({ maximizable: true });
      const request = vi.fn(() => {
        fullscreenElement.value = root();
        return Promise.resolve();
      });
      (root() as unknown as { requestFullscreen: () => Promise<void> }).requestFullscreen = request;

      fireEvent.click(button('Enter full screen')!);
      expect(request).toHaveBeenCalledTimes(1);
      fireEvent(document, new Event('fullscreenchange'));

      // The browser's own Esc leaves native full screen; the map must follow.
      fullscreenElement.value = null;
      fireEvent(document, new Event('fullscreenchange'));
      expect(handle.current!.maximized).toBe(false);
      expect(maximizedEvents).toEqual([true, false]);
    });
  });
});
