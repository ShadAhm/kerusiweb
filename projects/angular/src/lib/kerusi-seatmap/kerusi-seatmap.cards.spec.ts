import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HoverCardDelay,
  KerusiState,
  RenderSeat,
  SeatCardAppearance,
  SeatCardPlacement,
  SeatClick,
} from '@kerusiweb/core';
import {
  PARITY_CARD_SIGNATURE,
  PARITY_MAP,
  PARITY_STATE,
  svgSignature,
} from '../../../../core/src/testing/parity.fixture';
import { KerusiSeatmapComponent } from './kerusi-seatmap.component';
import {
  KerusiSeatClickCardDirective,
  KerusiSeatHoverCardDirective,
} from './kerusi-seat-card.directive';

/**
 * Seat hover, seat click and seat cards (D10 to D15). The same scenarios as
 * `kerusi-seatmap.cards.spec.tsx` in the React binding, in the same order, so
 * the two are held to the same behaviour.
 *
 * The town hall from the parity fixture: A2 is booked, T1-2 held, L7 blocked,
 * and A1 is the first seat of the first section.
 */

/** Every card template is a flag, so one host covers each combination. */
const CARDS = `
  @if (hover()) {
    <ng-template kerusiSeatHoverCard let-ctx>
      @if (!bookedOnly() || ctx.seat.status === 'booked') {
        <span class="detail">{{ ctx.seat.id }}:{{ ctx.trigger }}</span>
      }
    </ng-template>
  }
  @if (click() === 'generic') {
    <ng-template kerusiSeatClickCard let-ctx>
      @if (!bookedOnly() || ctx.seat.status === 'booked') {
        <div>
          <span class="detail">{{ ctx.seat.id }}:{{ ctx.selected }}{{ ctx.seat.status }}</span>
          <button type="button" (click)="ctx.close()">Done</button>
        </div>
      }
    </ng-template>
  }
  @if (click() === 'parity') {
    <ng-template kerusiSeatClickCard let-ctx>
      <span class="detail">Booked {{ ctx.seat.id }}</span>
    </ng-template>
  }
`;

const INPUTS = `
  [map]="map"
  [state]="state()"
  [(selection)]="selection"
  [interactive]="interactive()"
  [zoomable]="zoomable()"
  [hoverCardOnFocus]="onFocus()"
  [hoverCardDelay]="delay()"
  [seatCardPlacement]="placement()"
  [seatCardClass]="cardClass()"
  [seatCardAppearance]="appearance()"
  [sectionOverrides]="overrides()"
  (seatHover)="hovered.push($event)"
  (seatSelect)="order.push('select')"
  (seatDeselect)="order.push('deselect')"
  (seatDisallowed)="order.push('disallowed')"
`;

abstract class HostBase {
  readonly map = PARITY_MAP;
  readonly state = signal<KerusiState>(PARITY_STATE);
  readonly selection = signal<readonly string[]>([]);
  readonly interactive = signal(true);
  readonly zoomable = signal(false);
  readonly onFocus = signal(false);
  readonly delay = signal<Partial<HoverCardDelay> | undefined>(undefined);
  readonly placement = signal<SeatCardPlacement>('top');
  readonly cardClass = signal<string | undefined>(undefined);
  readonly appearance = signal<SeatCardAppearance>('default');
  readonly overrides = signal<Record<string, { hidden?: boolean }>>({});
  readonly hover = signal(false);
  readonly click = signal<'none' | 'generic' | 'parity'>('none');
  readonly bookedOnly = signal(false);

  readonly hovered: (RenderSeat | null)[] = [];
  readonly order: string[] = [];
}

/** Binds `(seatClick)`, as a consumer who wants to hear about clicks does. */
@Component({
  selector: 'kerusi-test-host',
  imports: [KerusiSeatmapComponent, KerusiSeatHoverCardDirective, KerusiSeatClickCardDirective],
  template: `<kerusi-seatmap ${INPUTS} (seatClick)="clicks.push($event); order.push('click')"
    >${CARDS}</kerusi-seatmap
  >`,
})
class Host extends HostBase {
  readonly clicks: SeatClick[] = [];
}

/** Binds nothing for clicks: neither `(seatClick)` nor a click card unless a flag adds one. */
@Component({
  selector: 'kerusi-test-quiet-host',
  imports: [KerusiSeatmapComponent, KerusiSeatHoverCardDirective, KerusiSeatClickCardDirective],
  template: `<kerusi-seatmap ${INPUTS}>${CARDS}</kerusi-seatmap>`,
})
class QuietHost extends HostBase {}

const pointerInit = (pointerType: string, extra: PointerEventInit = {}): PointerEventInit => ({
  pointerType,
  pointerId: 1,
  button: 0,
  bubbles: true,
  cancelable: true,
  ...extra,
});

describe('KerusiSeatmapComponent: seat hover, click and cards', () => {
  let fixture: ComponentFixture<HostBase>;
  let host: Host;
  let el: HTMLElement;

  async function mount<T extends HostBase>(type: new () => T, setup?: (host: T) => void) {
    await TestBed.configureTestingModule({ imports: [Host, QuietHost] }).compileComponents();
    fixture = TestBed.createComponent(type) as unknown as ComponentFixture<HostBase>;
    setup?.(fixture.componentInstance as T);
    host = fixture.componentInstance as Host;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  /** Lets signals, effects and `afterEveryRender` settle, as a real app's change detection would. */
  const flush = async () => {
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  };

  const seat = (id: string) => el.querySelector<SVGGElement>(`[data-seat-id="${id}"]`)!;
  const root = () => el.querySelector<HTMLElement>('.kerusi-seatmap')!;
  const card = (kind?: 'hover' | 'click') =>
    el.querySelector<HTMLElement>(kind ? `.kerusi-seat-card--${kind}` : '.kerusi-seat-card');
  const tabStops = () =>
    [...el.querySelectorAll<SVGGElement>('g.kerusi-seat')]
      .filter((g) => g.getAttribute('tabindex') === '0')
      .map((g) => g.dataset['seatId']);

  const enter = async (target: Element, type = 'mouse') => {
    target.dispatchEvent(new PointerEvent('pointerover', pointerInit(type)));
    await flush();
  };
  const leave = async (target: Element, to: Element | null = null, type = 'mouse') => {
    target.dispatchEvent(new PointerEvent('pointerout', pointerInit(type, { relatedTarget: to })));
    await flush();
  };
  const move = async (target: Element, type = 'mouse') => {
    target.dispatchEvent(new PointerEvent('pointermove', pointerInit(type)));
    await flush();
  };
  const click = async (target: Element) => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flush();
  };
  const key = async (target: Element, k: string) => {
    const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    await flush();
    return event;
  };
  const tick = async (ms: number) => {
    vi.advanceTimersByTime(ms);
    await flush();
  };
  const ids = () => host.hovered.map((s) => s?.id ?? null);

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('seatHover', () => {
    beforeEach(() => mount(Host));

    it('reports the seat on enter and null on leave', async () => {
      await enter(seat('A1'));
      await leave(seat('A1'));
      expect(ids()).toEqual(['A1', null]);
    });

    it('hands over the same RenderSeat seatDisallowed gets', async () => {
      await enter(seat('A2'));
      expect(host.hovered[0]).toMatchObject({
        id: 'A2',
        label: 'A2',
        rowLabel: 'A',
        sectionId: 'stalls',
        status: 'booked',
        price: { amount: 2500, currency: 'MYR' },
      });
      expect(host.hovered[0]!.type.id).toBe('std');
    });

    it('is not called again while the pointer moves within a seat', async () => {
      await enter(seat('A1'));
      await move(seat('A1'));
      await move(seat('A1'));
      expect(ids()).toEqual(['A1']);
    });

    it('goes from one seat to the next as null then the seat', async () => {
      await enter(seat('A1'));
      await leave(seat('A1'), seat('A3'));
      await enter(seat('A3'));
      expect(ids()).toEqual(['A1', null, 'A3']);
    });

    it('reports a pen, and ignores touch', async () => {
      await enter(seat('A1'), 'touch');
      await leave(seat('A1'), null, 'touch');
      expect(ids()).toEqual([]);
      await enter(seat('A1'), 'pen');
      expect(ids()).toEqual(['A1']);
    });
  });

  describe('seatHover on other maps', () => {
    it('fires on a read-only map, and changes nothing about it', async () => {
      await mount(QuietHost, (h) => h.interactive.set(false));
      await enter(seat('A1'));
      await leave(seat('A1'));
      expect(fixture.componentInstance.hovered.map((s) => s?.id ?? null)).toEqual(['A1', null]);
      // Still the read-only markup it always was.
      expect(tabStops()).toEqual([]);
      expect(seat('A1').getAttribute('aria-pressed')).toBe('false');
      await click(seat('A1'));
      expect(seat('A1').getAttribute('aria-pressed')).toBe('false');
    });

    it('clears the hover once when a zoom starts, and resumes on the next pointer move', async () => {
      await mount(Host, (h) => h.zoomable.set(true));
      await enter(seat('A1'));
      const wheel = async () => {
        el.querySelector('.kerusi-viewport')!.dispatchEvent(
          new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -50 }),
        );
        await flush();
      };
      await wheel();
      await wheel();
      expect(ids()).toEqual(['A1', null]);
      // The seat under a stationary pointer is not re-reported until the pointer moves.
      await leave(seat('A1'));
      expect(ids()).toEqual(['A1', null]);
      await move(seat('A3'));
      expect(ids()).toEqual(['A1', null, 'A3']);
    });

    it('is quiet when nothing listens, adding no markup', async () => {
      await mount(QuietHost);
      await enter(seat('A1'));
      expect(card()).toBeNull();
    });
  });

  describe('seatClick', () => {
    beforeEach(() => mount(Host));

    it('fires before the selection outputs, with the selection as it was', async () => {
      await click(seat('A1'));
      expect(host.order).toEqual(['click', 'select']);
      expect(host.clicks[0]).toMatchObject({ selected: false, source: 'pointer' });
      expect(host.clicks[0]!.seat.id).toBe('A1');
      await click(seat('A1'));
      expect(host.order).toEqual(['click', 'select', 'click', 'deselect']);
      expect(host.clicks[1]!.selected).toBe(true);
    });

    it('fires for a booked, held or blocked seat, which still refuses the pick', async () => {
      for (const id of ['A2', 'T1-2', 'L7']) {
        await click(seat(id));
      }
      expect(host.clicks.map((c) => c.seat.id)).toEqual(['A2', 'T1-2', 'L7']);
      expect(host.order).toEqual([
        'click',
        'disallowed',
        'click',
        'disallowed',
        'click',
        'disallowed',
      ]);
      expect(el.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
    });

    it('reports Enter and Space as the keyboard', async () => {
      await key(seat('A1'), 'Enter');
      await key(seat('A1'), ' ');
      expect(host.clicks.map((c) => c.source)).toEqual(['keyboard', 'keyboard']);
      expect(host.clicks.map((c) => c.selected)).toEqual([false, true]);
    });

    it('does not change selection, whether or not it is listened to', async () => {
      await click(seat('A1'));
      const withListener = el.innerHTML;
      TestBed.resetTestingModule();
      await mount(QuietHost);
      await click(seat('A1'));
      expect(el.innerHTML.replaceAll(/ng-reflect-[^ >]*/g, '')).toBe(
        withListener.replaceAll(/ng-reflect-[^ >]*/g, ''),
      );
    });

    it('on a read-only map keeps seats clickable and keyboard-reachable, with selection off', async () => {
      host.interactive.set(false);
      await flush();
      expect(tabStops()).toEqual(['A1', 'L1']);
      expect(seat('A1').hasAttribute('aria-pressed')).toBe(false);
      await click(seat('A1'));
      await key(seat('A1'), 'Enter');
      expect(host.clicks.map((c) => [c.seat.id, c.selected, c.source])).toEqual([
        ['A1', false, 'pointer'],
        ['A1', false, 'keyboard'],
      ]);
      // Selection stays off: nothing toggles, nothing is announced as selected.
      expect(host.order).toEqual(['click', 'click']);
      expect(el.querySelectorAll('[aria-pressed]')).toHaveLength(0);
    });

    it('moves focus between seats of a read-only map with the arrow keys', async () => {
      host.interactive.set(false);
      await flush();
      seat('A1').focus();
      await key(seat('A1'), 'ArrowRight');
      expect(document.activeElement).toBe(seat('A2'));
    });

    it('reports nothing for a tap that became a pan', async () => {
      host.zoomable.set(true);
      await flush();
      const view = el.querySelector('.kerusi-viewport')!;
      const touch = async (type: string, x: number) => {
        view.dispatchEvent(
          new PointerEvent(type, pointerInit('touch', { clientX: x, clientY: 0 })),
        );
        await flush();
      };
      await touch('pointerdown', 10);
      await touch('pointermove', 80);
      await touch('pointerup', 80);
      await click(seat('A1'));
      expect(host.clicks).toEqual([]);
    });
  });

  describe('seatClick without a listener', () => {
    it('leaves a read-only map exactly as it was: nothing reachable, still a toggle', async () => {
      await mount(QuietHost, (h) => h.interactive.set(false));
      expect(tabStops()).toEqual([]);
      expect(seat('A1').getAttribute('aria-pressed')).toBe('false');
      expect(seat('A1').getAttribute('tabindex')).toBe('-1');
    });

    it('turns the read-only behaviour on again with a click card, and off when it goes', async () => {
      await mount(QuietHost, (h) => {
        h.interactive.set(false);
        h.click.set('generic');
      });
      expect(tabStops()).toEqual(['A1', 'L1']);
      fixture.componentInstance.click.set('none');
      await flush();
      expect(tabStops()).toEqual([]);
      expect(seat('A1').getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('hover card', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    const mountHover = (setup?: (h: Host) => void) =>
      mount(Host, (h) => {
        h.hover.set(true);
        setup?.(h);
      });

    it('opens after the open delay, named by the seat, and closes after the close delay', async () => {
      await mountHover();
      await enter(seat('A1'));
      expect(card()).toBeNull();
      await tick(149);
      expect(card()).toBeNull();
      await tick(1);
      expect(card('hover')!.textContent).toContain('A1:hover');
      expect(card('hover')!.getAttribute('role')).toBe('tooltip');
      expect(seat('A1').getAttribute('aria-describedby')).toBe(card('hover')!.id);

      await leave(seat('A1'));
      await tick(99);
      expect(card('hover')).not.toBeNull();
      await tick(1);
      expect(card()).toBeNull();
      expect(seat('A1').hasAttribute('aria-describedby')).toBe(false);
    });

    it('honours hoverCardDelay', async () => {
      await mountHover((h) => h.delay.set({ open: 0, close: 400 }));
      await enter(seat('A1'));
      expect(card('hover')).not.toBeNull();
      await leave(seat('A1'));
      await tick(399);
      expect(card('hover')).not.toBeNull();
      await tick(1);
      expect(card()).toBeNull();
    });

    it('lets the pointer travel into the card and stays while it is there (hoverable)', async () => {
      await mountHover();
      await enter(seat('A1'));
      await tick(150);
      await leave(seat('A1'));
      card('hover')!.dispatchEvent(new PointerEvent('pointerenter', pointerInit('mouse')));
      await tick(500);
      expect(card('hover')).not.toBeNull();
      card('hover')!.dispatchEvent(new PointerEvent('pointerleave', pointerInit('mouse')));
      await tick(100);
      expect(card()).toBeNull();
    });

    it('is dismissed by Escape and stays dismissed while the pointer stays on the seat', async () => {
      await mountHover();
      await enter(seat('A1'));
      await tick(150);
      const escape = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(escape);
      await flush();
      expect(card()).toBeNull();
      expect(escape.defaultPrevented).toBe(true);
      await move(seat('A1'));
      await tick(500);
      expect(card()).toBeNull();
      await leave(seat('A1'));
      await enter(seat('A1'));
      await tick(150);
      expect(card('hover')).not.toBeNull();
    });

    it('is closed when a pan or zoom starts', async () => {
      await mountHover((h) => h.zoomable.set(true));
      await enter(seat('A1'));
      await tick(150);
      el.querySelector('.kerusi-viewport')!.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -50 }),
      );
      await flush();
      expect(card()).toBeNull();
    });

    it('never shows for touch', async () => {
      await mountHover();
      await enter(seat('A1'), 'touch');
      await tick(1000);
      expect(card()).toBeNull();
    });

    it('shows no card for a seat whose template renders nothing', async () => {
      await mountHover((h) => h.bookedOnly.set(true));
      await enter(seat('A1'));
      await tick(150);
      // The shell is there to be measured, and hidden: nothing to see or hear.
      expect(card('hover') === null || card('hover')!.hasAttribute('hidden')).toBe(true);
      await leave(seat('A1'), seat('A2'));
      await enter(seat('A2'));
      expect(card('hover')!.hasAttribute('hidden')).toBe(false);
      expect(card('hover')!.textContent).toContain('A2');
    });

    it('works on a read-only map', async () => {
      await mountHover((h) => h.interactive.set(false));
      await enter(seat('A2'));
      await tick(150);
      expect(card('hover')!.textContent).toContain('A2:hover');
    });

    it('is hidden while the same seat has its click card open', async () => {
      await mountHover((h) => h.click.set('generic'));
      await enter(seat('A1'));
      await tick(150);
      expect(card('hover')).not.toBeNull();
      await click(seat('A1'));
      expect(card('click')).not.toBeNull();
      expect(card('hover')).toBeNull();
    });

    describe('on keyboard focus (D12)', () => {
      it('shows nothing by default', async () => {
        await mountHover();
        seat('A1').focus();
        await tick(1000);
        expect(card()).toBeNull();
      });

      it('shows at once with hoverCardOnFocus, with trigger "focus", and closes on blur', async () => {
        await mountHover((h) => h.onFocus.set(true));
        seat('A1').focus();
        await flush();
        expect(card('hover')!.textContent).toContain('A1:focus');
        expect(seat('A1').getAttribute('aria-describedby')).toBe(card('hover')!.id);
        seat('A1').blur();
        await flush();
        expect(card()).toBeNull();
      });

      it('makes the seats of a read-only map reachable, so focus has somewhere to go', async () => {
        await mountHover((h) => {
          h.onFocus.set(true);
          h.interactive.set(false);
        });
        expect(tabStops()).toEqual(['A1', 'L1']);
      });
    });
  });

  describe('click card', () => {
    const mountClick = (setup?: (h: Host) => void) =>
      mount(Host, (h) => {
        h.click.set('generic');
        setup?.(h);
      });

    it('opens on a click, as a non-modal dialog labelled by the seat', async () => {
      await mountClick();
      await click(seat('A2'));
      const dialog = card('click')!;
      expect(dialog.textContent).toContain('A2:falsebooked');
      expect(dialog.getAttribute('role')).toBe('dialog');
      expect(dialog.getAttribute('aria-label')).toBe(seat('A2').getAttribute('aria-label'));
      expect(dialog.hasAttribute('aria-modal')).toBe(false);
      expect(fixture.debugElement.children[0].componentInstance.openSeatCardId()).toBe('A2');
    });

    it('opens for a booked seat too, which is what a who-sits-where map needs', async () => {
      await mountClick((h) => h.interactive.set(false));
      await click(seat('A2'));
      expect(card('click')!.textContent).toContain('A2');
      expect(el.querySelectorAll('[aria-pressed]')).toHaveLength(0);
    });

    it('also toggles a selectable seat, and tells the card so', async () => {
      await mountClick();
      await click(seat('A1'));
      expect(seat('A1').getAttribute('aria-pressed')).toBe('true');
      expect(card('click')!.textContent).toContain('A1:trueavailable');
    });

    it('closes on a second click on the same seat, and moves to another seat’s click', async () => {
      await mountClick();
      await click(seat('A2'));
      await click(seat('A4'));
      expect(el.querySelectorAll('.kerusi-seat-card')).toHaveLength(1);
      expect(card('click')!.textContent).toContain('A4');
      await click(seat('A4'));
      expect(card()).toBeNull();
    });

    it('closes from its own buttons through ctx.close()', async () => {
      await mountClick();
      await click(seat('A2'));
      await click(card('click')!.querySelector('button')!);
      expect(card()).toBeNull();
    });

    it('closes on a press outside the card and the seats, not on one inside', async () => {
      await mountClick();
      await click(seat('A2'));
      const press = async (target: Element) => {
        target.dispatchEvent(new PointerEvent('pointerdown', pointerInit('mouse')));
        await flush();
      };
      await press(card('click')!.querySelector('.detail')!);
      expect(card('click')).not.toBeNull();
      await press(seat('A4'));
      expect(card('click')).not.toBeNull();
      await press(document.body);
      expect(card()).toBeNull();
    });

    it('opens from the keyboard with focus moved into it, and Escape returns focus to the seat', async () => {
      await mountClick();
      seat('A2').focus();
      await key(seat('A2'), 'Enter');
      await flush();
      expect(card('click')!.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).toBe(card('click')!.querySelector('button'));

      await key(document.activeElement!, 'Escape');
      expect(card()).toBeNull();
      await flush();
      expect(document.activeElement).toBe(seat('A2'));
    });

    it('closes on Escape from the seat without taking focus anywhere', async () => {
      await mountClick();
      await click(seat('A1'));
      seat('A1').focus();
      const escape = await key(seat('A1'), 'Escape');
      expect(card()).toBeNull();
      expect(escape.defaultPrevented).toBe(true);
      // The card took the Escape, so the selection it did not clear is still there.
      expect(seat('A1').getAttribute('aria-pressed')).toBe('true');
    });

    it('shows no card when the template renders nothing', async () => {
      await mountClick((h) => h.bookedOnly.set(true));
      await click(seat('A1'));
      expect(card() === null || card()!.hasAttribute('hidden')).toBe(true);
      await click(seat('A2'));
      expect(card('click')!.hasAttribute('hidden')).toBe(false);
      expect(card('click')!.textContent).toContain('booked');
    });

    it('re-renders with the seat’s new state, and closes if the seat goes', async () => {
      await mountClick();
      await click(seat('A1'));
      expect(card('click')!.textContent).toContain('available');
      host.state.set({
        ...PARITY_STATE,
        seats: { ...PARITY_STATE.seats, A1: { status: 'booked' } },
      });
      await flush();
      expect(card('click')!.textContent).toContain('booked');
      host.overrides.set({ stalls: { hidden: true } });
      await flush();
      expect(card()).toBeNull();
    });

    it('is opened and closed from the component', async () => {
      await mountClick();
      const map = fixture.debugElement.children[0].componentInstance as KerusiSeatmapComponent;
      map.openSeatCard('A4');
      await flush();
      expect(card('click')!.textContent).toContain('A4');
      expect(map.openSeatCardId()).toBe('A4');
      map.openSeatCard('no-such-seat');
      await flush();
      expect(map.openSeatCardId()).toBe('A4');
      map.closeSeatCard();
      await flush();
      expect(card()).toBeNull();
      expect(map.openSeatCardId()).toBeNull();
    });

    it('is not opened by the component without a click card', async () => {
      await mount(Host);
      const map = fixture.debugElement.children[0].componentInstance as KerusiSeatmapComponent;
      map.openSeatCard('A1');
      await flush();
      expect(card()).toBeNull();
    });
  });

  describe('styling hooks (D11)', () => {
    const open = async (setup?: (h: Host) => void) => {
      await mount(Host, (h) => {
        h.click.set('generic');
        setup?.(h);
      });
      await click(seat('A2'));
      return card('click')!;
    };

    it('mirrors the seat as data attributes, and the side actually used', async () => {
      const c = await open();
      expect(c.dataset).toMatchObject({
        seatId: 'A2',
        seatStatus: 'booked',
        seatType: 'std',
        sectionId: 'stalls',
      });
      expect(['top', 'bottom', 'left', 'right']).toContain(c.dataset['placement']);
    });

    it('carries the consumer’s own classes', async () => {
      const c = await open((h) => h.cardClass.set('my-card other'));
      expect(c.className).toBe('kerusi-seat-card kerusi-seat-card--click my-card other');
    });

    it('wraps the content in a body and ends with an arrow', async () => {
      const c = await open();
      expect(c.querySelector('.kerusi-seat-card__body')!.textContent).toContain('A2');
      expect(c.querySelector('.kerusi-seat-card__arrow')).not.toBeNull();
    });

    it('drops the chrome and the arrow with seatCardAppearance="none"', async () => {
      const c = await open((h) => h.appearance.set('none'));
      expect(c.classList.contains('kerusi-seat-card--bare')).toBe(true);
      expect(c.querySelector('.kerusi-seat-card__arrow')).toBeNull();
    });

    it('sits inside the map root, outside the clipped viewport', async () => {
      const c = await open((h) => h.zoomable.set(true));
      expect(c.parentElement).toBe(root());
      expect(c.closest('.kerusi-viewport')).toBeNull();
    });

    it('is placed with an inline left and top, and no colour of its own', async () => {
      const c = await open();
      expect(c.style.left).not.toBe('');
      expect(c.style.top).not.toBe('');
      expect(c.style.background).toBe('');
      expect(c.style.color).toBe('');
    });
  });

  describe('markup', () => {
    it('is unchanged with no card configured', async () => {
      await mount(QuietHost);
      const strip = (html: string) => html.replaceAll(/ ng-reflect-[^ >]*="[^"]*"/g, '');
      const plain = strip(el.innerHTML);
      TestBed.resetTestingModule();
      await mount(Host);
      // Listening adds no attribute, class or element to a map that takes selection.
      expect(strip(el.innerHTML)).toBe(plain);
    });

    it('draws one open click card the same way as the React binding (parity)', async () => {
      await mount(Host, (h) => h.click.set('parity'));
      await click(seat('A2'));
      expect(svgSignature(card('click')!)).toBe(PARITY_CARD_SIGNATURE);
    });
  });
});
