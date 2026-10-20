import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  DestroyRef,
  effect,
  ElementRef,
  EventEmitter,
  inject,
  input,
  model,
  NgZone,
  output,
  Output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  buildNavigationGraph,
  buildRenderModel,
  canvasRectToContent,
  clampViewport,
  computeMapLayout,
  controlStyle,
  cssVar,
  DEFAULT_MAX_ZOOM,
  DEFAULT_SEAT_ARIA_STRINGS,
  DisallowedReason,
  disallowedAnnouncement,
  errorsOf,
  expireHolds,
  FIT_VIEWPORT,
  fitViewport,
  formatMoney,
  GestureEvent,
  GestureState,
  HoverCardDelay,
  IDLE_GESTURE,
  IDLE_SEAT_HOVER,
  isRtlLocale,
  isTextEntryTarget,
  keyboardViewport,
  KerusiControlStrings,
  KerusiMap,
  KerusiSeatCardContext,
  KerusiSeatmapColors,
  KerusiSession,
  KerusiState,
  KerusiValidationError,
  KerusiViewport,
  KerusiViolation,
  MapLayout,
  Money,
  NavigationGraph,
  reduceGesture,
  reduceSeatHover,
  RenderMap,
  RenderSeat,
  RenderSection,
  resolveColors,
  resolveControlStrings,
  resolveHoverCardDelay,
  resolveMapLocale,
  revealRect,
  SeatAriaStrings,
  seatAriaLabel,
  SeatCardAppearance,
  seatCardId,
  SeatCardPlacement,
  SeatClick,
  SeatClickSource,
  SeatHoverEvent,
  SeatHoverState,
  SeatRenderStatus,
  SeatStyleFn,
  SeatTypeStyles,
  stepViewport,
  summarizeSelection,
  toggleSeatSelection,
  validateDocumentSet,
  viewportForRect,
  ViewportPoint,
  ViewportRect,
  ViewportSize,
  viewportsEqual,
  viewportTouchAction,
  viewportTransform,
  wheelZoomFactor,
  zoomLimits,
  zoomViewportBy,
  zoomViewportTo,
} from '@kerusiweb/core';
import { KerusiSectionComponent } from './kerusi-section.component';
import { KerusiLegendComponent } from './kerusi-legend.component';
import { KerusiSeatCardComponent } from './kerusi-seat-card.component';
import {
  KerusiSeatClickCardDirective,
  KerusiSeatHoverCardDirective,
} from './kerusi-seat-card.directive';
import { KerusiSeatTemplateDirective } from './kerusi-seat-template.directive';

/** Gives each map a prefix for the `id`s of its cards. */
let nextMapId = 0;

/** How a document with validation errors is handled. */
export type ValidationMode =
  /** Report through `validationIssues` and render anyway. The default. */
  | 'collect'
  /** Throw a `KerusiValidationError`, as `validateKerusiMap` does. */
  | 'throw'
  /** Skip validation entirely, for a document validated upstream. */
  | 'off';

/** Per-section rendering overrides, keyed by `Section.id`. */
export interface SectionRenderOptions {
  /** Leaves the section out. Its space on the canvas stays empty (D4). */
  hidden?: boolean;
  /** Overrides the localized `Section.label`. */
  label?: string;
}

/** What a seat event carries. Everything the document knows, already resolved. */
export interface SeatInteraction {
  seat: RenderSeat;
  /** The selection after this event. */
  selection: readonly string[];
  /** Seats whose membership changed, including companions (§4.6). */
  changed: readonly string[];
}

export interface SeatDisallowed {
  seat: RenderSeat;
  reason: DisallowedReason;
}

/**
 * Renders a Kerusi seat map.
 *
 * Takes a `KerusiMap` and its `KerusiState` directly — no adapter, no
 * intermediate row model. The map is one `<svg>` whose `viewBox` is the
 * document's canvas (§4.5), each `Section` is a group on it, every seat is
 * drawn exactly where and as large as the document says, seats take their
 * color from the map's legend,
 * every seat is keyboard-reachable and announced with its type, price, status
 * and §4.3.4 accessibility properties, and selection is an immutable set of
 * seat ids the caller can two-way bind.
 *
 * ```html
 * <kerusi-seatmap [map]="map" [state]="state" [(selection)]="picked" />
 * ```
 *
 * Two opt-in features sit on top, both off by default so an existing map is
 * unchanged: `[zoomable]` (pinch, wheel and drag, keys `+` `-` `0`, buttons)
 * and `[maximizable]` (a full-screen button). Their arithmetic is in
 * `@kerusiweb/core`; this class supplies the listeners and the signals.
 */
@Component({
  selector: 'kerusi-seatmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    KerusiSectionComponent,
    KerusiLegendComponent,
    KerusiSeatCardComponent,
    NgTemplateOutlet,
  ],
  templateUrl: './kerusi-seatmap.component.html',
  styleUrl: './kerusi-seatmap.component.css',
})
export class KerusiSeatmapComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);

  // --- documents ------------------------------------------------------------

  readonly map = input.required<KerusiMap>();
  readonly state = input<KerusiState | undefined>(undefined);
  /** The optional map↔event join (§5.3). Validated against the map and state. */
  readonly session = input<KerusiSession | undefined>(undefined);

  // --- selection ------------------------------------------------------------

  /** Selected seat ids. Two-way: `[(selection)]`, or read-only with `[selection]`. */
  readonly selection = model<readonly string[]>([]);

  // --- localization ---------------------------------------------------------

  /** Overrides `KerusiMap.locale` (BCP-47). */
  readonly locale = input<string | undefined>(undefined);
  /** Right-to-left rendering. `auto` derives it from the resolved locale. */
  readonly rtl = input<boolean | 'auto'>('auto');
  /** Overrides the built-in English announcement strings. */
  readonly ariaStrings = input<SeatAriaStrings>(DEFAULT_SEAT_ARIA_STRINGS);

  // --- appearance -----------------------------------------------------------

  readonly colors = input<KerusiSeatmapColors>({});
  /** Let an available seat take its `SeatType.color` (§4.7). */
  readonly typeColors = input<boolean>(true);
  /**
   * Styles for every seat of a type, keyed by `SeatType.id`: fill, label colour
   * and classes. Never changes a selected or blocked seat's fill. Also shown in
   * the legend.
   */
  readonly seatTypeStyles = input<SeatTypeStyles | undefined>(undefined);
  /**
   * A style for one seat, laid over its `seatTypeStyles` entry; return nothing
   * to leave a seat be. Never changes a selected or blocked seat's fill.
   */
  readonly seatStyle = input<SeatStyleFn | undefined>(undefined);
  /**
   * A `<ng-template kerusiSeat let-seat>` placed inside the map draws the inside
   * of every seat in place of the stock glyph. See {@link KerusiSeatTemplateDirective}.
   */
  protected readonly seatTemplate = contentChild(KerusiSeatTemplateDirective);
  /**
   * CSS pixels per canvas unit, at most: the map never draws wider than
   * `canvas.width × unitScale`, and scales down to a narrower container. The
   * document fixes every seat's size and position (§4.5); this is the only
   * sizing control. Default `1`.
   */
  readonly unitScale = input<number>(1);
  /**
   * Draws each section's label inside the map, at the top-left of its `bounds`.
   * Only sections that declare `bounds` get one; every section's label is its
   * group's accessible name either way. Default `true`.
   */
  readonly showSectionLabels = input<boolean>(true);
  readonly showLegend = input<boolean>(false);
  readonly showLegendPrices = input<boolean>(true);

  // --- section control ------------------------------------------------------

  /** Render only these sections, in this order. Default: all, by `Section.index`. */
  readonly sectionIds = input<readonly string[] | undefined>(undefined);
  readonly sectionOverrides = input<Readonly<Record<string, SectionRenderOptions>>>({});

  // --- interaction ----------------------------------------------------------

  /** Statuses in which a seat may be picked. Default: `['available']`. */
  readonly selectableStatuses = input<readonly SeatRenderStatus[]>(['available']);
  /** `auto` selects a seat's companion closure together (§4.6). */
  readonly companionMode = input<'auto' | 'independent'>('auto');
  readonly maxSelection = input<number | undefined>(undefined);
  /** A final say on selectability, applied after the status test. */
  readonly seatSelectable = input<((seat: RenderSeat) => boolean) | undefined>(undefined);
  /**
   * `false` turns selection off. Seats still take clicks, and stay
   * keyboard-reachable, while `(seatClick)` is bound or a click card template is
   * set (D14). With neither, a read-only map has no pointer or keyboard
   * interaction.
   */
  readonly interactive = input<boolean>(true);
  /**
   * Revert a lapsed `holdExpires` to available on a ticker (§5.1). Off by
   * default — a renderer should stay passive unless asked.
   */
  readonly expireHolds = input<boolean>(false);
  readonly expiryIntervalMs = input<number>(1000);

  // --- zoom, pan and maximize (both opt in) ---------------------------------

  /**
   * Pinch, Ctrl/Cmd + wheel and drag to zoom and pan, `+` `-` `0` on the keyboard,
   * and on-screen buttons. A tap still selects at every zoom level.
   */
  readonly zoomable = input<boolean>(false);
  /** The zoom ceiling, relative to fit-to-container. The floor is always fit. */
  readonly maxZoom = input<number>(DEFAULT_MAX_ZOOM);
  /**
   * The built-in zoom buttons. Turn this off to supply your own, anywhere on the
   * page, and call `zoomIn()`, `zoomOut()` and `resetZoom()` on the component.
   */
  readonly showZoomControls = input<boolean>(true);
  /** A button that maximizes the map to fill the screen. */
  readonly maximizable = input<boolean>(false);
  /** Overrides the built-in English names of the zoom and maximize controls. */
  readonly controlStrings = input<Partial<KerusiControlStrings>>({});

  // --- seat cards (both optional, both off by default) ----------------------

  /**
   * A `<ng-template kerusiSeatHoverCard let-ctx>` placed inside the map is shown
   * while a seat is hovered, anchored to it. See {@link KerusiSeatHoverCardDirective}.
   */
  protected readonly hoverCardTemplate = contentChild(KerusiSeatHoverCardDirective);
  /**
   * A `<ng-template kerusiSeatClickCard let-ctx>` placed inside the map is opened
   * by a click, a tap or Enter/Space on a seat. See {@link KerusiSeatClickCardDirective}.
   */
  protected readonly clickCardTemplate = contentChild(KerusiSeatClickCardDirective);
  /** The side a card prefers; it flips when it would overflow the map. Default `top`. */
  readonly seatCardPlacement = input<SeatCardPlacement>('top');
  /** Extra classes on the card element, for Tailwind or a design-system class (D11). */
  readonly seatCardClass = input<string | undefined>(undefined);
  /**
   * `none` drops the card's background, border, padding, shadow and arrow,
   * leaving only positioning, so your content is the card (D11). Default `default`.
   */
  readonly seatCardAppearance = input<SeatCardAppearance>('default');
  /** Milliseconds before a hover card opens and closes. Default `{ open: 150, close: 100 }`. */
  readonly hoverCardDelay = input<Partial<HoverCardDelay> | undefined>(undefined);
  /**
   * Also show the hover card when a seat takes keyboard focus (D12). Default
   * `false`. Setting it makes seats keyboard-reachable even on a read-only map.
   */
  readonly hoverCardOnFocus = input<boolean>(false);

  // --- validation -----------------------------------------------------------

  readonly validate = input<ValidationMode>('collect');

  // --- outputs --------------------------------------------------------------

  readonly seatSelect = output<SeatInteraction>();
  readonly seatDeselect = output<SeatInteraction>();
  readonly seatDisallowed = output<SeatDisallowed>();
  readonly seatFocus = output<RenderSeat>();
  /**
   * The seat under the pointer when it enters a seat, and `null` when it leaves
   * the seat or the map. Not repeated while the pointer moves within a seat.
   * Pointer devices only (mouse and pen), never during a pan or zoom, and
   * unaffected by `interactive` (D10).
   */
  readonly seatHover = output<RenderSeat | null>();
  /**
   * Every activation of any seat, whether or not it can be selected: booked,
   * held and blocked seats included. Fires before the selection outputs, with
   * `selected` as it was before the click. A read-only notification: it cannot
   * cancel or change what the click does (D13).
   *
   * An `EventEmitter` rather than `output()`, on purpose: Angular offers no
   * public way to ask whether an `output()` is bound, and a read-only map has to
   * know whether `(seatClick)` is, to keep its seats clickable (D14). RxJS
   * `observed` answers it. Templates bind it exactly as they would an `output()`.
   */
  @Output() readonly seatClick = new EventEmitter<SeatClick>();
  /** Emitted whenever the documents change, in `collect` mode. */
  readonly validationIssues = output<readonly KerusiViolation[]>();
  /** The zoom and pan, whenever they change. For a host that persists or shows them. */
  readonly viewportChange = output<KerusiViewport>();
  readonly maximizedChange = output<boolean>();

  // --- internal state -------------------------------------------------------

  /**
   * The seat holding each section's tab stop, keyed by section id.
   *
   * Per section, not per map: arrow keys never cross a section boundary, so a
   * single map-wide tab stop would leave every section after the first
   * unreachable by keyboard. Tab moves between sections, arrows move within.
   */
  private readonly focusedSeatIds = signal<Readonly<Record<string, string>>>({});
  private readonly announcement = signal('');
  /** Bumped by the hold ticker to force the state to be re-derived. */
  private readonly expiryTick = signal(0);

  /** Which seat a hover card is for, with the open and close timing around it. */
  private readonly hoverState = signal<SeatHoverState>(IDLE_SEAT_HOVER);
  private hoverRaw: SeatHoverState = IDLE_SEAT_HOVER;
  private hoverTimer: ReturnType<typeof setTimeout> | undefined;
  /** The seat whose click card is open. */
  private readonly clickId = signal<string | null>(null);
  /** Set when the card is opened from the keyboard, so focus moves into it. */
  protected readonly clickFromKeyboard = signal(false);
  private readonly cardPrefix = `kerusi-${nextMapId++}`;
  private readonly rootRef = viewChild<ElementRef<HTMLElement>>('root');

  private readonly viewportState = signal<KerusiViewport>(FIT_VIEWPORT);
  private readonly maximizedState = signal(false);
  /** True for a discrete change (button, key, reveal), false while a finger or wheel drives. */
  protected readonly animated = signal(false);
  private readonly viewportEl = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly contentEl = viewChild<ElementRef<HTMLElement>>('content');
  private gesture: GestureState = IDLE_GESTURE;
  private suppressClick = false;
  private gestureBase: KerusiViewport | null = null;
  private nativeFullscreen = false;

  /** The current zoom and pan. Read-only: drive it with the methods below. */
  readonly viewport = this.viewportState.asReadonly();
  /** Whether the map is currently maximized. */
  readonly maximized = this.maximizedState.asReadonly();

  constructor() {
    effect(() => {
      const issues = this.issues();
      if (this.validate() !== 'off') {
        this.validationIssues.emit(issues);
      }
      if (this.validate() === 'throw') {
        const [first] = errorsOf(issues);
        if (first) {
          throw new KerusiValidationError(first.message, first.rule, first.id, issues);
        }
      }
    });

    // Keep every section's tab stop pointing at a seat that still exists.
    effect(() => {
      const model = this.renderMap();
      const current = this.focusedSeatIds();
      const next: Record<string, string> = {};
      let changed = Object.keys(current).length !== model.sections.length;

      for (const section of model.sections) {
        const held = current[section.id];
        const valid = held && section.seats.some((seat) => seat.id === held);
        const resolved = valid ? held : section.seats[0]?.id;
        if (resolved) {
          next[section.id] = resolved;
          changed ||= resolved !== held;
        }
      }

      if (changed) {
        this.focusedSeatIds.set(next);
      }
    });

    effect((onCleanup) => {
      if (!this.expireHolds()) {
        return;
      }
      const handle = setInterval(
        () => this.expiryTick.update((n) => n + 1),
        this.expiryIntervalMs(),
      );
      onCleanup(() => clearInterval(handle));
    });

    // Seat hover is read off the map's root by delegation, natively and outside
    // the zone: one listener per event type rather than three per seat, and a
    // pointer moving over the map does not run change detection.
    effect((onCleanup) => {
      const root = this.rootRef()?.nativeElement;
      if (!root) {
        return;
      }
      const seatOf = (target: EventTarget | null): SVGGElement | null =>
        (target as Element | null)?.closest?.('g[data-seat-id]') ?? null;
      const over = (type: 'enter' | 'leave' | 'move') => (e: Event) => {
        const event = e as PointerEvent;
        const seat = seatOf(event.target);
        const seatId = seat?.dataset['seatId'];
        // Moving between a seat's own parts is not leaving it.
        if (!seat || !seatId || (type !== 'move' && seatOf(event.relatedTarget) === seat)) {
          return;
        }
        this.feedHover({ type, seatId, pointerType: event.pointerType });
      };
      const listeners: [string, (event: Event) => void][] = [
        ['pointerover', over('enter')],
        ['pointerout', over('leave')],
        ['pointermove', over('move')],
      ];
      this.zone.runOutsideAngular(() => {
        for (const [type, listener] of listeners) {
          root.addEventListener(type, listener);
        }
      });
      onCleanup(() => {
        for (const [type, listener] of listeners) {
          root.removeEventListener(type, listener);
        }
      });
    });

    // A seat that goes away (a hidden section, a new map) takes its cards with it.
    effect(() => {
      const seats = this.renderMap().seatsById;
      untracked(() => {
        const click = this.clickId();
        if (click !== null && !seats.has(click)) {
          this.closeClick(false);
        }
        const hovered = this.hoverRaw.cardId;
        if (hovered !== null && !seats.has(hovered)) {
          this.feedHover({ type: 'reset' });
        }
      });
    });

    // A card whose template is taken away has nothing to show.
    effect(() => {
      if (!this.clickCardTemplate() && untracked(this.clickId) !== null) {
        untracked(() => this.closeClick(false));
      }
    });

    // Escape anywhere dismisses a card, including with focus outside the map: a
    // hover card the pointer opened must be dismissible without moving it (WCAG
    // 1.4.13). The map's own key handling runs first and marks the event handled.
    effect((onCleanup) => {
      if (this.hoverState().cardId === null && this.clickId() === null) {
        return;
      }
      const doc = this.host.nativeElement.ownerDocument as Document;
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && !event.defaultPrevented && this.dismissCards()) {
          event.preventDefault();
        }
      };
      doc.addEventListener('keydown', onKeyDown);
      onCleanup(() => doc.removeEventListener('keydown', onKeyDown));
    });

    // A press outside the click card and outside every seat closes it. A press on
    // a seat is that seat's own click, which opens or closes a card by itself.
    effect((onCleanup) => {
      if (this.clickId() === null) {
        return;
      }
      const doc = this.host.nativeElement.ownerDocument as Document;
      const onPointerDown = (event: PointerEvent) => {
        const target = event.target as Element | null;
        const root = this.rootRef()?.nativeElement;
        if (!target || !root) {
          return;
        }
        const inCard = target.closest?.('.kerusi-seat-card--click');
        const onSeat = root.contains(target) && target.closest?.('[data-seat-id]');
        if (!inCard && !onSeat) {
          this.zone.run(() => this.closeClick(false));
        }
      };
      doc.addEventListener('pointerdown', onPointerDown, true);
      onCleanup(() => doc.removeEventListener('pointerdown', onPointerDown, true));
    });

    inject(DestroyRef).onDestroy(() => clearTimeout(this.hoverTimer));

    // Gesture listeners go on natively, not through the template: the wheel
    // listener must be non-passive to `preventDefault` a page zoom, and the
    // click listener must be in the capture phase to swallow the click that
    // follows a drag before the seat sees it.
    effect((onCleanup) => {
      const el = this.viewportEl()?.nativeElement;
      if (!el) {
        return;
      }
      const listeners: [string, (event: Event) => void, boolean | AddEventListenerOptions][] = [
        ['pointerdown', (e) => this.onPointerDown(e as PointerEvent), false],
        ['pointermove', (e) => this.onPointerMove(e as PointerEvent), false],
        ['pointerup', (e) => this.onPointerEnd(e as PointerEvent, 'up'), false],
        ['pointercancel', (e) => this.onPointerEnd(e as PointerEvent, 'cancel'), false],
        ['wheel', (e) => this.onWheel(e as WheelEvent), { passive: false }],
        ['click', (e) => this.onClickCapture(e), true],
        // Safari reports a trackpad pinch as gesture events, not Ctrl + wheel.
        ['gesturestart', (e) => this.onGestureStart(e), { passive: false }],
        ['gesturechange', (e) => this.onGestureChange(e as SafariGestureEvent), { passive: false }],
        ['gestureend', (e) => this.onGestureEnd(e), { passive: false }],
      ];
      for (const [type, listener, options] of listeners) {
        el.addEventListener(type, listener, options);
      }
      onCleanup(() => {
        for (const [type, listener, options] of listeners) {
          el.removeEventListener(type, listener, options);
        }
      });
    });

    // Re-clamp when the box or the ceiling changes: a rotated phone, a
    // maximized map, a lowered `maxZoom`.
    effect((onCleanup) => {
      this.limits();
      const view = this.viewportEl()?.nativeElement;
      untracked(() => this.reclamp());
      if (!view || typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(() => this.reclamp());
      observer.observe(view);
      const content = this.contentEl()?.nativeElement;
      if (content) {
        observer.observe(content);
      }
      onCleanup(() => observer.disconnect());
    });

    // Switching `zoomable` or `maximizable` off puts the map back as it was.
    effect(() => {
      if (!this.zoomable() && !viewportsEqual(untracked(this.viewportState), FIT_VIEWPORT)) {
        this.viewportState.set(FIT_VIEWPORT);
      }
    });
    effect(() => {
      if (!this.maximizable() && untracked(this.maximizedState)) {
        untracked(() => this.setMaximized(false));
      }
    });

    // While maximized: freeze the page behind, and follow the browser leaving
    // native full screen (Esc) so the two never disagree.
    effect((onCleanup) => {
      if (!this.maximizedState()) {
        return;
      }
      const host = this.host.nativeElement as HTMLElement;
      const doc = host.ownerDocument;
      const previousOverflow = doc.body.style.overflow;
      doc.body.style.overflow = 'hidden';

      const onFullscreenChange = () => {
        if (doc.fullscreenElement === host) {
          this.nativeFullscreen = true;
        } else if (this.nativeFullscreen) {
          this.nativeFullscreen = false;
          this.setMaximized(false);
        }
      };
      doc.addEventListener('fullscreenchange', onFullscreenChange);

      onCleanup(() => {
        doc.body.style.overflow = previousOverflow;
        doc.removeEventListener('fullscreenchange', onFullscreenChange);
        this.nativeFullscreen = false;
        if (doc.fullscreenElement === host) {
          doc.exitFullscreen?.().catch(() => undefined);
        }
      });
    });
  }

  // --- derived model --------------------------------------------------------

  protected readonly issues = computed<readonly KerusiViolation[]>(() =>
    this.validate() === 'off'
      ? []
      : validateDocumentSet({
          map: this.map(),
          state: this.state(),
          session: this.session(),
        }),
  );

  /** The state actually rendered — with lapsed holds reverted when asked. */
  private readonly effectiveState = computed<KerusiState | undefined>(() => {
    const state = this.state();
    if (!state || !this.expireHolds()) {
      return state;
    }
    this.expiryTick();
    return expireHolds(state);
  });

  protected readonly renderMap = computed<RenderMap>(() =>
    buildRenderModel(this.map(), this.effectiveState(), {
      locale: this.locale(),
      sectionIds: this.visibleSectionIds(),
      selectableStatuses: this.selectableStatuses(),
      seatSelectable: this.seatSelectable(),
    }),
  );

  protected readonly resolvedLocale = computed(() => resolveMapLocale(this.map(), this.locale()));

  protected readonly isRtl = computed(() =>
    this.rtl() === 'auto' ? isRtlLocale(this.resolvedLocale()) : this.rtl() === true,
  );

  protected readonly resolvedColors = computed<Required<KerusiSeatmapColors>>(() =>
    resolveColors(this.colors()),
  );

  protected readonly selectionSet = computed(() => new Set(this.selection()));

  // --- seat cards -----------------------------------------------------------

  private readonly cardDelay = computed(() => resolveHoverCardDelay(this.hoverCardDelay()));

  private readonly hoverCardId = seatCardId(this.cardPrefix, 'hover');
  protected readonly clickCardId = seatCardId(this.cardPrefix, 'click');
  protected readonly hoverCardElementId = this.hoverCardId;

  /** The seat whose hover card is showing, as the render model knows it. */
  private readonly hoverSeat = computed(() => {
    const id = this.hoverState().cardId;
    return id === null ? undefined : this.renderMap().seatsById.get(id);
  });
  private readonly clickSeat = computed(() => {
    const id = this.clickId();
    return id === null ? undefined : this.renderMap().seatsById.get(id);
  });

  /** A click card open for a seat hides that seat's hover card. */
  protected readonly hoverCardSeats = computed<readonly RenderSeat[]>(() => {
    const seat = this.hoverSeat();
    return seat && this.hoverCardTemplate() && seat.id !== this.clickId() ? [seat] : [];
  });
  protected readonly clickCardSeats = computed<readonly RenderSeat[]>(() => {
    const seat = this.clickSeat();
    return seat && this.clickCardTemplate() ? [seat] : [];
  });

  protected readonly hoverContext = computed<KerusiSeatCardContext | null>(() => {
    const seat = this.hoverCardSeats()[0];
    return seat
      ? {
          seat,
          group: seat.group,
          selected: this.selectionSet().has(seat.id),
          trigger: this.hoverState().cardTrigger === 'focus' ? 'focus' : 'hover',
          close: () => this.feedHover({ type: 'escape' }),
        }
      : null;
  });
  protected readonly clickContext = computed<KerusiSeatCardContext | null>(() => {
    const seat = this.clickCardSeats()[0];
    return seat
      ? {
          seat,
          group: seat.group,
          selected: this.selectionSet().has(seat.id),
          trigger: 'click',
          close: () => this.closeClick(true),
        }
      : null;
  });

  protected readonly clickCardLabel = computed(() => {
    const seat = this.clickCardSeats()[0];
    return seat ? seatAriaLabel(seat, this.resolvedLocale(), this.ariaStrings()) : '';
  });

  /** The seat → card `id` link, for the seat showing a hover card. */
  protected readonly describedBy = computed(() => {
    const seat = this.hoverCardSeats()[0];
    return seat ? { seatId: seat.id, id: this.hoverCardId } : null;
  });

  /** The seat whose click card is showing, or `null`. */
  readonly openSeatCardId = computed(() => this.clickCardSeats()[0]?.id ?? null);

  /** Whether seats need focus and blur handling for a hover card (D12). */
  private tracksFocus(): boolean {
    return this.hoverCardOnFocus() && !!this.hoverCardTemplate();
  }

  /**
   * Whether a click behaviour is configured (D14): `(seatClick)` bound, or a
   * click card template. It is what keeps a read-only map's seats clickable and
   * reachable. A method, not a `computed`: `observed` is not a signal.
   */
  protected clickable(): boolean {
    return this.seatClick.observed || !!this.clickCardTemplate();
  }

  /** Seats take pointer and keyboard interaction: to select, to click, or to show a card. */
  protected reachable(): boolean {
    return this.interactive() || this.clickable() || this.tracksFocus();
  }

  protected readonly seatNodeOf = (seatId: string): SVGGElement | null => this.seatNode(seatId);
  protected readonly rootElement = computed(() => this.rootRef()?.nativeElement);

  protected readonly limits = computed(() => zoomLimits(this.maxZoom()));
  protected readonly strings = computed(() => resolveControlStrings(this.controlStrings()));
  protected readonly controlColors = computed(() => controlStyle(this.colors()));
  protected readonly transform = computed(() => viewportTransform(this.viewportState()));
  protected readonly touchAction = computed(() =>
    viewportTouchAction(this.viewportState(), this.maximizedState()),
  );
  protected readonly showToolbar = computed(
    () => (this.zoomable() && this.showZoomControls()) || this.maximizable(),
  );
  protected readonly atMaxZoom = computed(
    () => this.viewportState().zoom >= this.limits().maxZoom - 1e-4,
  );
  protected readonly atFit = computed(() => this.viewportState().zoom <= 1 + 1e-4);

  /** Every seat and element placed on the canvas, mirrored as a whole in RTL (D3). */
  protected readonly layout = computed<MapLayout>(() =>
    computeMapLayout(this.renderMap(), { rtl: this.isRtl() }),
  );

  protected readonly viewBox = computed(() => `0 0 ${this.layout().width} ${this.layout().height}`);

  /** `unitScale` CSS pixels per canvas unit, at most. */
  protected readonly naturalWidth = computed(() => this.layout().width * this.unitScale());

  /** The canvas's width over its height, so a maximized map can fit the whole canvas. */
  protected readonly canvasAspect = computed(() =>
    String(this.layout().width / this.layout().height),
  );

  protected readonly backdrop = computed(() => cssVar('backdrop', this.resolvedColors().backdrop));

  /** Navigation graphs per section — arrows move within, Tab moves between. */
  private readonly graphs = computed<ReadonlyMap<string, NavigationGraph>>(
    () =>
      new Map(
        this.renderMap().sections.map((section) => [
          section.id,
          buildNavigationGraph(section, { rtl: this.isRtl() }),
        ]),
      ),
  );

  protected readonly ariaLabels = computed<ReadonlyMap<string, string>>(() => {
    const locale = this.resolvedLocale();
    const strings = this.ariaStrings();
    return new Map(
      [...this.renderMap().seatsById.values()].map((seat) => [
        seat.id,
        seatAriaLabel(seat, locale, strings),
      ]),
    );
  });

  protected readonly mapLabel = computed(
    () => this.renderMap().name ?? `Seat map ${this.renderMap().id}`,
  );

  /** Live-region text: the running selection, or the last disallowed reason. */
  protected readonly liveMessage = computed(() => this.announcement());

  /** The selection's seats and total, for callers that want it off the template. */
  readonly summary = computed(() => summarizeSelection(this.renderMap(), this.selection()));

  // --- template helpers -----------------------------------------------------

  protected labelFor(section: RenderSection): string | undefined {
    return this.sectionOverrides()[section.id]?.label ?? section.label;
  }

  /** The seat holding this section's tab stop. */
  protected focusedSeatIn(section: RenderSection): string | null {
    return this.focusedSeatIds()[section.id] ?? null;
  }

  // --- interaction ----------------------------------------------------------

  protected onSeatActivate(seatId: string, source: SeatClickSource = 'pointer'): void {
    const model = this.renderMap();
    const seat = model.seatsById.get(seatId);
    if (!seat) {
      return;
    }

    // The click is reported first, with the selection as it stood before it,
    // and cannot change what follows (D13).
    this.seatClick.emit({ seat, selected: this.selectionSet().has(seatId), source });
    this.activateCard(seatId, source);

    // A read-only map stops here: selection is off (D14).
    if (!this.interactive()) {
      return;
    }

    const outcome = toggleSeatSelection(this.selection(), seatId, {
      seatsById: model.seatsById,
      companionMode: this.companionMode(),
      maxSelection: this.maxSelection(),
    });

    if (outcome.kind === 'disallowed') {
      this.announce(disallowedAnnouncement(seat, outcome.reason!, this.ariaStrings()));
      this.seatDisallowed.emit({ seat, reason: outcome.reason! });
      return;
    }

    this.selection.set(outcome.selection);
    const event: SeatInteraction = {
      seat,
      selection: outcome.selection,
      changed: outcome.changed,
    };
    (outcome.kind === 'select' ? this.seatSelect : this.seatDeselect).emit(event);
    this.announceSelection(outcome.selection);
  }

  protected onSeatFocused(seatId: string): void {
    const seat = this.renderMap().seatsById.get(seatId);
    if (!seat) {
      return;
    }
    this.setFocusedSeat(seat.sectionId, seatId);
    this.seatFocus.emit(seat);
    if (this.tracksFocus()) {
      this.feedHover({ type: 'focus', seatId });
    }
    if (this.zoomable()) {
      this.revealSeat(seatId);
    }
  }

  /**
   * Arrow keys walk the navigation graph, which follows §4.3.5 adjacency:
   * along a row by `col`, across an aisle (a skipped `col`) rather than into
   * it, and between rows to the seat nearest on the canvas (D6).
   */
  protected onKeydown(section: RenderSection, event: KeyboardEvent): void {
    const seatId = (event.target as HTMLElement)?.dataset?.['seatId'];
    if (!seatId) {
      return;
    }

    const graph = this.graphs().get(section.id);
    const neighbours = graph?.neighbours.get(seatId);
    if (!graph) {
      return;
    }

    let target: string | undefined;
    switch (event.key) {
      case 'ArrowLeft':
        target = neighbours?.left;
        break;
      case 'ArrowRight':
        target = neighbours?.right;
        break;
      case 'ArrowUp':
        target = neighbours?.up;
        break;
      case 'ArrowDown':
        target = neighbours?.down;
        break;
      case 'Home':
        target = event.ctrlKey ? graph.first : neighbours?.rowStart;
        break;
      case 'End':
        target = event.ctrlKey ? graph.last : neighbours?.rowEnd;
        break;
      case 'PageUp':
        target = graph.first;
        break;
      case 'PageDown':
        target = graph.last;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.onSeatActivate(seatId, 'keyboard');
        return;
      case 'Escape':
        // An open card is dismissed before anything else gives way.
        if (this.dismissCards()) {
          event.preventDefault();
          return;
        }
        if (this.interactive() && this.selection().length > 0) {
          event.preventDefault();
          this.selection.set([]);
          this.announceSelection([]);
        }
        return;
      default:
        return;
    }

    if (target) {
      event.preventDefault();
      this.moveFocusTo(section.id, target);
    }
  }

  protected onSeatBlurred(seatId: string): void {
    if (this.tracksFocus()) {
      this.feedHover({ type: 'blur', seatId });
    }
  }

  // --- hover and seat cards (D10) -----------------------------------------------

  /**
   * Feeds the hover reducer, runs the one timer it asks for, and reports the
   * hovered seat. The rules are core's (`reduceSeatHover()`); this holds the
   * state. Called from native listeners outside the zone, so it goes back in
   * only when something changed.
   */
  private feedHover(event: SeatHoverEvent): void {
    const result = reduceSeatHover(this.hoverRaw, event, this.cardDelay());
    if (result.state === this.hoverRaw && !result.timer && !result.report) {
      return;
    }
    this.zone.run(() => {
      this.hoverRaw = result.state;
      this.hoverState.set(result.state);

      if (result.timer) {
        clearTimeout(this.hoverTimer);
        this.hoverTimer = undefined;
        if (result.timer.action === 'start') {
          const { kind, ms } = result.timer;
          this.hoverTimer = setTimeout(() => this.feedHover({ type: 'timer', kind }), ms);
        }
      }
      if (result.report) {
        const { seatId } = result.report;
        const seat = seatId === null ? null : (this.renderMap().seatsById.get(seatId) ?? null);
        if (seatId === null || seat) {
          this.seatHover.emit(seat);
        }
      }
    });
  }

  protected onCardEnter(): void {
    this.feedHover({ type: 'card-enter' });
  }

  protected onCardLeave(): void {
    this.feedHover({ type: 'card-leave' });
  }

  /** Opens or closes the click card for an activated seat. */
  private activateCard(seatId: string, source: SeatClickSource): void {
    if (!this.clickCardTemplate()) {
      return;
    }
    if (this.clickId() === seatId) {
      this.closeClick(true);
      return;
    }
    this.clickId.set(seatId);
    this.clickFromKeyboard.set(source === 'keyboard');
  }

  /**
   * Closes the click card. Focus goes back to the seat only when it was inside
   * the card, so a press elsewhere on the page keeps the focus it just took.
   */
  private closeClick(restoreFocus: boolean): void {
    const current = this.clickId();
    if (current !== null && restoreFocus) {
      const card = this.rootRef()?.nativeElement.querySelector('.kerusi-seat-card--click');
      if (card?.contains(card.ownerDocument.activeElement)) {
        // After the card is gone, so nothing fights the focus move.
        queueMicrotask(() => this.seatNode(current)?.focus?.({ preventScroll: true }));
      }
    }
    this.clickId.set(null);
    this.clickFromKeyboard.set(false);
  }

  /** Closes what is open, click card first. True if a card was showing. */
  private dismissCards(): boolean {
    if (this.clickId() !== null) {
      const showing = this.clickCardSeats().length > 0;
      this.closeClick(true);
      return showing;
    }
    if (this.hoverRaw.cardId !== null || this.hoverRaw.pendingId !== null) {
      const showing = this.hoverCardSeats().length > 0;
      this.feedHover({ type: 'escape' });
      return showing;
    }
    return false;
  }

  /**
   * Opens the click card for a seat, for example from a search result. No-op
   * without a click card template, or for a seat that is not rendered.
   */
  openSeatCard(seatId: string): void {
    if (this.clickCardTemplate() && this.renderMap().seatsById.has(seatId)) {
      this.clickId.set(seatId);
      this.clickFromKeyboard.set(false);
    }
  }

  /** Closes the click card. */
  closeSeatCard(): void {
    this.closeClick(true);
  }

  private setFocusedSeat(sectionId: string, seatId: string): void {
    if (this.focusedSeatIds()[sectionId] === seatId) {
      return;
    }
    this.focusedSeatIds.update((all) => ({ ...all, [sectionId]: seatId }));
  }

  /**
   * Moves the roving tab stop, then the DOM focus that follows it.
   *
   * When zoomable, the browser's own scroll-into-view is suppressed: the map
   * moves by transform, so `onSeatFocused` pans it into view instead.
   */
  private moveFocusTo(sectionId: string, seatId: string): void {
    this.setFocusedSeat(sectionId, seatId);
    const node = this.seatNode(seatId);
    if (this.zoomable()) {
      node?.focus?.({ preventScroll: true });
    } else {
      node?.focus?.();
    }
  }

  /**
   * Seat ids come from the document, so they cannot be interpolated into a
   * selector unescaped — and `CSS.escape` is absent in jsdom and under SSR.
   * Scanning the rendered nodes avoids both problems.
   */
  private seatNode(seatId: string): SVGGElement | null {
    const nodes = (this.host.nativeElement as HTMLElement).querySelectorAll<SVGGElement>(
      '[data-seat-id]',
    );
    for (const node of Array.from(nodes)) {
      if (node.dataset['seatId'] === seatId) {
        return node;
      }
    }
    return null;
  }

  // --- zoom and pan ---------------------------------------------------------

  /** Zooms in one step about the centre. No-op unless `zoomable`. */
  zoomIn(): void {
    this.stepZoom(1);
  }

  /** Zooms out one step about the centre. No-op unless `zoomable`. */
  zoomOut(): void {
    this.stepZoom(-1);
  }

  /** Back to fit-to-container: the whole canvas. No-op unless `zoomable`. */
  resetZoom(): void {
    const measured = this.measure();
    if (measured && this.zoomable()) {
      this.commit(fitViewport(measured.content, measured.container, this.limits()), true);
    }
  }

  /**
   * Zooms to one section: its declared `bounds`, or the box around its seats
   * and elements when it declares none. No-op unless `zoomable`, or for a
   * section that is not rendered.
   */
  zoomToSection(sectionId: string): void {
    const layout = this.layout();
    const placed = layout.sections.find((s) => s.section.id === sectionId);
    if (placed) {
      this.zoomToCanvasRect(placed.bounds, layout);
    }
  }

  private zoomToCanvasRect(rect: ViewportRect, canvas: ViewportSize): void {
    const measured = this.measure();
    if (!measured || !this.zoomable() || !(canvas.width > 0 && canvas.height > 0)) {
      return;
    }
    // The map's <svg> is the content's only child and sets its height; its
    // width can stop short of the content's (`unitScale` caps it), so the
    // drawn width comes from the height and the canvas's proportions.
    const drawn = {
      width: (measured.content.height * canvas.width) / canvas.height,
      height: measured.content.height,
    };
    const next = viewportForRect(
      canvasRectToContent(rect, canvas, drawn),
      measured.content,
      measured.container,
      undefined,
      this.limits(),
    );
    this.commit(next, true);
  }

  private stepZoom(direction: 1 | -1): void {
    const measured = this.measure();
    if (measured && this.zoomable()) {
      const next = stepViewport(
        this.viewportState(),
        direction,
        measured.content,
        measured.container,
        this.limits(),
      );
      this.commit(next, true);
    }
  }

  /** Sizes in CSS pixels, read when needed: `offset*` ignores the zoom transform. */
  private measure(): { content: ViewportSize; container: ViewportSize } | null {
    const view = this.viewportEl()?.nativeElement;
    const content = this.contentEl()?.nativeElement;
    if (!view || !content) {
      return null;
    }
    return {
      container: { width: view.clientWidth, height: view.clientHeight },
      content: { width: content.offsetWidth, height: content.offsetHeight },
    };
  }

  private commit(next: KerusiViewport, animate: boolean): void {
    if (viewportsEqual(next, this.viewportState())) {
      return;
    }
    this.animated.set(animate);
    this.viewportState.set(next);
    this.viewportChange.emit(next);
  }

  private reclamp(): void {
    const measured = this.measure();
    if (measured && this.zoomable()) {
      const next = clampViewport(
        this.viewportState(),
        measured.content,
        measured.container,
        this.limits(),
      );
      this.commit(next, false);
    }
  }

  /** A point in the viewport's own coordinates, which is what the core functions take. */
  private containerPoint(event: { clientX: number; clientY: number }): ViewportPoint {
    const box = this.viewportEl()!.nativeElement.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  /**
   * Pans a seat that took keyboard focus into view. A click or tap also
   * focuses the seat, but should not move the map under the finger, so only a
   * `:focus-visible` focus counts.
   */
  private revealSeat(seatId: string): void {
    const view = this.viewportEl()?.nativeElement;
    const node = this.seatNode(seatId);
    const measured = this.measure();
    if (!view || !node || !measured || !focusIsVisible(node)) {
      return;
    }
    const seat = node.getBoundingClientRect();
    const frame = view.getBoundingClientRect();
    const next = revealRect(
      this.viewportState(),
      {
        x: seat.left - frame.left,
        y: seat.top - frame.top,
        width: seat.width,
        height: seat.height,
      },
      measured.content,
      measured.container,
      undefined,
      this.limits(),
    );
    this.commit(next, true);
  }

  // --- pointer gestures -----------------------------------------------------

  private onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    this.suppressClick = false;
    this.feedGesture({ type: 'down', id: event.pointerId, point: this.containerPoint(event) });
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.gesture.ids.length > 0) {
      this.feedGesture({ type: 'move', id: event.pointerId, point: this.containerPoint(event) });
    }
  }

  private onPointerEnd(event: PointerEvent, type: 'up' | 'cancel'): void {
    this.feedGesture({ type, id: event.pointerId });
  }

  private feedGesture(event: GestureEvent): void {
    const measured = this.measure();
    if (!measured) {
      return;
    }
    const result = reduceGesture(this.gesture, event, {
      viewport: this.viewportState(),
      content: measured.content,
      container: measured.container,
      limits: this.limits(),
    });
    this.gesture = result.state;

    // Capture only once a tap has become a gesture: capturing on `down` would
    // retarget the tap's click away from the seat.
    if (result.capture) {
      this.feedHover({ type: 'gesture' });
      const view = this.viewportEl()?.nativeElement;
      for (const id of result.state.ids) {
        try {
          view?.setPointerCapture(id);
        } catch {
          // The pointer already ended; nothing to capture.
        }
      }
    }
    if (result.viewport !== this.viewportState()) {
      this.commit(result.viewport, false);
    }
    if (result.suppressClick) {
      // The click a drag ends with arrives right after `pointerup`, before this timer.
      this.suppressClick = true;
      setTimeout(() => (this.suppressClick = false));
    }
  }

  private onClickCapture(event: Event): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      event.stopPropagation();
      event.preventDefault();
    }
  }

  private onWheel(event: WheelEvent): void {
    const factor = wheelZoomFactor(event);
    const measured = this.measure();
    if (factor === null || !measured) {
      return; // A plain wheel is the page's to scroll.
    }
    event.preventDefault();
    this.feedHover({ type: 'gesture' });
    const next = zoomViewportBy(
      this.viewportState(),
      factor,
      this.containerPoint(event),
      measured.content,
      measured.container,
      this.limits(),
    );
    this.commit(next, false);
  }

  private onGestureStart(event: Event): void {
    event.preventDefault();
    this.gestureBase = this.viewportState();
  }

  private onGestureChange(event: SafariGestureEvent): void {
    event.preventDefault();
    const measured = this.measure();
    if (!this.gestureBase || !measured) {
      return;
    }
    this.feedHover({ type: 'gesture' });
    const next = zoomViewportTo(
      this.gestureBase,
      this.gestureBase.zoom * event.scale,
      this.containerPoint(event),
      measured.content,
      measured.container,
      this.limits(),
    );
    this.commit(next, false);
  }

  private onGestureEnd(event: Event): void {
    event.preventDefault();
    this.gestureBase = null;
  }

  // --- keyboard on the map as a whole ----------------------------------------

  /**
   * `+` `-` `0` zoom, and arrows pan when the viewport itself has focus; Esc
   * leaves a maximized map. A seat's own handler runs first, so an Esc that
   * cleared the selection is already `defaultPrevented` and stays at that.
   */
  protected onRootKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || isTextEntryTarget(event.target as HTMLElement | null)) {
      return;
    }
    if (this.zoomable()) {
      const measured = this.measure();
      const next =
        measured &&
        keyboardViewport(
          this.viewportState(),
          {
            key: event.key,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            altKey: event.altKey,
            viewportFocused: event.target === this.viewportEl()?.nativeElement,
          },
          measured.content,
          measured.container,
          this.limits(),
        );
      if (next) {
        event.preventDefault();
        this.commit(next, true);
        return;
      }
    }
    if (event.key === 'Escape' && this.dismissCards()) {
      // A card in the way goes first; a second Escape leaves a maximized map.
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && this.maximizedState()) {
      event.preventDefault();
      this.setMaximized(false);
    }
  }

  // --- maximize -------------------------------------------------------------

  /** Maximizes or restores the map. Maximizing needs `maximizable`. */
  toggleMaximized(): void {
    this.setMaximized(!this.maximizedState());
  }

  setMaximized(next: boolean): void {
    if (next === this.maximizedState() || (next && !this.maximizable())) {
      return;
    }
    this.maximizedState.set(next);
    this.maximizedChange.emit(next);

    // Native full screen is an enhancement over the fixed-position layout, which
    // is all iPhone Safari offers. It is requested here, inside the click that
    // got us here, because browsers only grant it to a user gesture.
    const host = this.host.nativeElement as HTMLElement;
    const doc = host.ownerDocument;
    if (next && !doc.fullscreenElement) {
      host.requestFullscreen?.()?.catch(() => undefined);
    } else if (!next && doc.fullscreenElement === host) {
      doc.exitFullscreen?.()?.catch(() => undefined);
    }
  }

  private announceSelection(selection: readonly string[]): void {
    const strings = this.ariaStrings();
    if (selection.length === 0) {
      this.announce(strings.selectionEmpty);
      return;
    }
    const { total } = summarizeSelection(this.renderMap(), selection);
    this.announce(
      strings.selectionSummary(selection.length, formatTotal(total, this.resolvedLocale())),
    );
  }

  private announce(message: string): void {
    // Re-announce an identical message by clearing first; a live region that
    // sees no text change stays silent.
    this.announcement.set('');
    queueMicrotask(() => this.announcement.set(message));
  }

  private visibleSectionIds(): readonly string[] | undefined {
    const explicit = this.sectionIds();
    const overrides = this.sectionOverrides();
    const hidden = Object.entries(overrides)
      .filter(([, o]) => o.hidden)
      .map(([id]) => id);

    if (explicit) {
      return explicit.filter((id) => !hidden.includes(id));
    }
    if (hidden.length === 0) {
      return undefined;
    }
    return (this.map().sections ?? []).map((s) => s.id).filter((id) => !hidden.includes(id));
  }
}

function formatTotal(total: Money | undefined, locale: string): string {
  return total ? formatMoney(total, locale) : '';
}

/** Safari's trackpad pinch. Not in lib.dom; `scale` is relative to the gesture's start. */
interface SafariGestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

/** `:focus-visible` where the engine knows it; otherwise assume the focus is the keyboard's. */
function focusIsVisible(node: Element): boolean {
  try {
    return node.matches(':focus-visible');
  } catch {
    return true;
  }
}
