import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  buildNavigationGraph,
  buildRenderModel,
  clampViewport,
  computeSectionLayout,
  controlStyle,
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
  IDLE_GESTURE,
  isRtlLocale,
  isTextEntryTarget,
  keyboardViewport,
  KerusiControlStrings,
  KerusiMap,
  KerusiSeatmapColors,
  KerusiSession,
  KerusiState,
  KerusiValidationError,
  KerusiViewport,
  KerusiViolation,
  Money,
  NavigationGraph,
  reduceGesture,
  RenderMap,
  RenderSeat,
  RenderSection,
  resolveColors,
  resolveControlStrings,
  resolveMapLocale,
  revealRect,
  SeatAriaStrings,
  seatAriaLabel,
  SeatRenderStatus,
  SeatStyleFn,
  SeatTypeStyles,
  SectionLayout,
  stepViewport,
  summarizeSelection,
  toggleSeatSelection,
  validateDocumentSet,
  ViewportPoint,
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
import { KerusiSeatTemplateDirective } from './kerusi-seat-template.directive';

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
  hidden?: boolean;
  /** Overrides `Section.aspectRatio`. */
  aspectRatio?: string;
  /** Overrides the seat size for this section only. */
  seatSize?: number;
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
 * intermediate row model. Each `Section` becomes its own `<svg>` with its own
 * layout mode and proportions, seats take their color from the map's legend,
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
  imports: [KerusiSectionComponent, KerusiLegendComponent, NgTemplateOutlet],
  templateUrl: './kerusi-seatmap.component.html',
  styleUrl: './kerusi-seatmap.component.css',
})
export class KerusiSeatmapComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

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
  /** Grid cell edge, in viewBox units. */
  readonly seatSize = input<number>(28);
  /** Gap between grid cells, in viewBox units. */
  readonly seatGap = input<number>(6);
  /** Freeform viewBox width; height follows the section's aspect ratio. */
  readonly freeformBasis = input<number>(1000);
  /**
   * CSS pixels per viewBox unit. Caps each section at its natural size so a
   * narrow section and a wide one in the same map draw seats the same size.
   */
  readonly unitScale = input<number>(1);
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
  /** When false the map renders read-only: no pointer or keyboard interaction. */
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

  // --- validation -----------------------------------------------------------

  readonly validate = input<ValidationMode>('collect');

  // --- outputs --------------------------------------------------------------

  readonly seatSelect = output<SeatInteraction>();
  readonly seatDeselect = output<SeatInteraction>();
  readonly seatDisallowed = output<SeatDisallowed>();
  readonly seatFocus = output<RenderSeat>();
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

  /** Placed geometry per section, keyed by section id. */
  protected readonly layouts = computed<ReadonlyMap<string, SectionLayout>>(() => {
    const overrides = this.sectionOverrides();
    return new Map(
      this.renderMap().sections.map((section) => {
        const override = overrides[section.id] ?? {};
        return [
          section.id,
          computeSectionLayout(section, {
            seatSize: override.seatSize ?? this.seatSize(),
            seatGap: this.seatGap(),
            freeformBasis: this.freeformBasis(),
            aspectRatio: override.aspectRatio,
            rtl: this.isRtl(),
          }),
        ];
      }),
    );
  });

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

  protected layoutFor(section: RenderSection): SectionLayout {
    return this.layouts().get(section.id)!;
  }

  protected labelFor(section: RenderSection): string | undefined {
    return this.sectionOverrides()[section.id]?.label ?? section.label;
  }

  protected labelId(section: RenderSection): string {
    return `kerusi-section-${this.renderMap().id}-${section.id}`;
  }

  /** The seat holding this section's tab stop. */
  protected focusedSeatIn(section: RenderSection): string | null {
    return this.focusedSeatIds()[section.id] ?? null;
  }

  // --- interaction ----------------------------------------------------------

  protected onSeatActivate(seatId: string): void {
    const model = this.renderMap();
    const seat = model.seatsById.get(seatId);
    if (!seat) {
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
    if (this.zoomable()) {
      this.revealSeat(seatId);
    }
  }

  /**
   * Arrow keys walk the navigation graph, which orders seats by `col` in grid
   * and mixed sections — §4.3.1's logical adjacency — so the aisle that is a
   * skipped column is stepped across rather than into.
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
        this.onSeatActivate(seatId);
        return;
      case 'Escape':
        if (this.selection().length > 0) {
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

  /** Back to fit-to-container: the map's original view. No-op unless `zoomable`. */
  resetZoom(): void {
    const measured = this.measure();
    if (measured && this.zoomable()) {
      this.commit(fitViewport(measured.content, measured.container, this.limits()), true);
    }
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
