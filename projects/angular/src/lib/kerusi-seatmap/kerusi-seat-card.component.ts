import { NgTemplateOutlet } from '@angular/common';
import {
  afterEveryRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  TemplateRef,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import {
  cssLengthToPx,
  placeSeatCard,
  RenderGroup,
  RenderSeat,
  SeatCardAppearance,
  seatCardClassName,
  seatCardDataAttributes,
  SeatCardPlacement,
  SeatCardPosition,
  wholeUnitCardDataAttributes,
} from '@kerusiweb/core';
import { SeatCardOutletContext, WholeUnitCardOutletContext } from './kerusi-seat-card.directive';

const DEFAULT_OFFSET = 8;
const DEFAULT_ARROW = 6;

/**
 * One seat card: a floating element anchored to a seat, or, given a `group` in
 * place of a `seat`, to that whole unit's control (D25).
 *
 * It sits inside the map's root, outside the clipped viewport, so it shows in
 * full screen and inherits the map's `--kerusi-*` properties. Where it goes is
 * `placeSeatCard()`'s; this component measures the seat, the card and the root,
 * and re-measures after every render and whenever the root or the card changes
 * size, which is how it follows zoom, pan, maximize and full screen.
 *
 * It sets no colour, no padding and no font: that is the stylesheet's, and then
 * the consumer's (D11). Its styles are not encapsulated, for the same reason:
 * an emulated attribute selector would outrank the consumer's own classes.
 *
 * The same markup as the React binding's `SeatCard`, held to it by the parity
 * fixture.
 */
@Component({
  selector: 'div[kerusi-seat-card]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [NgTemplateOutlet],
  templateUrl: './kerusi-seat-card.component.html',
  styleUrl: './kerusi-seat-card.component.css',
  host: {
    '[class]': 'cardClass()',
    '[attr.id]': 'id()',
    '[attr.role]': "kind() === 'hover' ? 'tooltip' : 'dialog'",
    '[attr.aria-label]': "kind() === 'click' ? label() : null",
    '[attr.tabindex]': "kind() === 'click' ? -1 : null",
    '[attr.data-placement]': 'side()',
    '[attr.data-seat-id]': 'data()["data-seat-id"] ?? null',
    '[attr.data-seat-status]': 'data()["data-seat-status"] ?? null',
    '[attr.data-seat-type]': 'data()["data-seat-type"] ?? null',
    '[attr.data-group-id]': 'data()["data-group-id"] ?? null',
    '[attr.data-group-kind]': 'data()["data-group-kind"] ?? null',
    '[attr.data-section-id]': 'data()["data-section-id"] ?? null',
    '[attr.hidden]': "empty() ? '' : null",
    '[style.left.px]': 'position()?.x ?? 0',
    '[style.top.px]': 'position()?.y ?? 0',
    '[style.--kerusi-seat-card-arrow-shift]': "(position()?.arrowOffset ?? 0) + 'px'",
    '(pointerenter)': 'cardEnter.emit()',
    '(pointerleave)': 'cardLeave.emit()',
  },
})
export class KerusiSeatCardComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly kind = input.required<'hover' | 'click'>();
  /** The card's `id`: a hover card is named by the seat's `aria-describedby`. */
  readonly id = input.required<string>();
  /** The seat the card is for. */
  readonly seat = input<RenderSeat | undefined>(undefined);
  /** In place of `seat`: the group whose whole-unit control the card is for (D25). */
  readonly group = input<RenderGroup | undefined>(undefined);
  /** Names a click card's dialog. */
  readonly label = input<string>('');
  readonly placement = input<SeatCardPlacement>('top');
  readonly appearance = input<SeatCardAppearance>('default');
  readonly extraClass = input<string | undefined>(undefined);
  /** The content: the consumer's template, and what it is handed. */
  readonly template = input.required<
    TemplateRef<SeatCardOutletContext> | TemplateRef<WholeUnitCardOutletContext>
  >();
  readonly context = input.required<
    SeatCardOutletContext['$implicit'] | WholeUnitCardOutletContext['$implicit']
  >();
  /** The map's root element: the card is positioned in it and kept inside it. */
  readonly rootEl = input.required<HTMLElement>();
  readonly seatNode = input.required<(seatId: string) => SVGGElement | null>();
  /** Finds a whole unit's control by its group id, for a card given a `group`. */
  readonly controlNode = input<((groupId: string) => SVGGElement | null) | undefined>(undefined);
  /** Moves focus into the card on mount: a click card opened from the keyboard. */
  readonly focusOnOpen = input<boolean>(false);

  /** A hover card is hoverable (WCAG 1.4.13): the pointer may enter it. */
  readonly cardEnter = output<void>();
  readonly cardLeave = output<void>();

  private readonly body = viewChild<ElementRef<HTMLElement>>('body');

  protected readonly position = signal<SeatCardPosition | null>(null);
  /** False when the consumer set `--kerusi-seat-card-arrow-size: 0`. */
  protected readonly arrowShown = signal(true);
  /** True when the template drew nothing for this seat: no card for it. */
  protected readonly empty = signal(false);

  protected readonly cardClass = computed(() =>
    seatCardClassName(this.kind(), this.appearance(), this.extraClass()),
  );
  protected readonly data = computed<Readonly<Partial<Record<string, string>>>>(() => {
    const seat = this.seat();
    const group = this.group();
    return seat ? seatCardDataAttributes(seat) : group ? wholeUnitCardDataAttributes(group) : {};
  });
  protected readonly side = computed(
    () => this.position()?.side ?? (this.placement() === 'auto' ? 'top' : this.placement()),
  );
  protected readonly showArrow = computed(() => this.appearance() !== 'none' && this.arrowShown());
  protected readonly outletContext = computed(() => ({ $implicit: this.context() }));

  constructor() {
    // After every render, before paint: the card is in place when it first
    // shows, and a zoom or pan (which re-renders the map) moves it with the seat.
    afterEveryRender(() => {
      this.measure();
      this.checkEmpty();
    });

    // A change the render did not announce: the root resized (maximize, full
    // screen, a rotated phone), or the card's own content did.
    effect((onCleanup) => {
      const root = this.rootEl();
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(() => this.measure());
      observer.observe(root);
      observer.observe(this.host.nativeElement);
      onCleanup(() => observer.disconnect());
    });

    effect(() => {
      if (!this.focusOnOpen()) {
        return;
      }
      // After this render, so the card's content exists to be focused.
      queueMicrotask(() => this.focusInto());
    });
  }

  private measure(): void {
    const root = this.rootEl();
    const card = this.host.nativeElement;
    const seat = this.seat();
    const group = this.group();
    const seatNode = seat
      ? this.seatNode()(seat.id)
      : group
        ? (this.controlNode()?.(group.id) ?? null)
        : null;
    if (!seatNode) {
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
    const next = placeSeatCard({
      seat: {
        x: seatBox.left - originX,
        y: seatBox.top - originY,
        width: seatBox.width,
        height: seatBox.height,
      },
      card: { width: card.offsetWidth, height: card.offsetHeight },
      container: { x: 0, y: 0, width: root.clientWidth, height: root.clientHeight },
      placement: this.placement(),
      offset: cssLengthToPx(
        styles.getPropertyValue('--kerusi-seat-card-offset'),
        DEFAULT_OFFSET,
        fontSizes,
      ),
      arrowInset: Math.max(12, arrowSize * 2),
    });

    if (this.arrowShown() !== arrowSize > 0) {
      this.arrowShown.set(arrowSize > 0);
    }
    const current = this.position();
    if (
      !current ||
      current.side !== next.side ||
      current.x !== next.x ||
      current.y !== next.y ||
      current.arrowOffset !== next.arrowOffset
    ) {
      this.position.set(next);
    }
  }

  /** Angular cannot ask a template whether it drew anything, so the DOM is asked. */
  private checkEmpty(): void {
    const body = this.body()?.nativeElement;
    if (!body) {
      return;
    }
    const empty = body.children.length === 0 && (body.textContent ?? '').trim() === '';
    if (empty !== this.empty()) {
      this.empty.set(empty);
    }
  }

  private focusInto(): void {
    const card = this.host.nativeElement;
    const first = card.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (first ?? card).focus({ preventScroll: true });
  }
}
