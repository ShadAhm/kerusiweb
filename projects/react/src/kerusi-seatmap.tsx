import {
  buildNavigationGraph,
  buildRenderModel,
  controlStyle,
  DEFAULT_MAX_ZOOM,
  DEFAULT_SEAT_ARIA_STRINGS,
  disallowedAnnouncement,
  computeSectionLayout,
  errorsOf,
  expireHolds as expireHoldsIn,
  formatMoney,
  isRtlLocale,
  isTextEntryTarget,
  KerusiValidationError,
  resolveColors,
  resolveControlStrings,
  resolveMapLocale,
  seatAriaLabel,
  summarizeSelection,
  toggleSeatSelection,
  validateDocumentSet,
  viewportTouchAction,
  viewportTransform,
} from '@kerusiweb/core';
import type {
  KerusiState,
  KerusiViolation,
  Money,
  NavigationGraph,
  RenderMap,
  RenderSection,
  SectionLayout,
} from '@kerusiweb/core';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { KerusiLegend } from './kerusi-legend.js';
import { KerusiSection } from './kerusi-section.js';
import type {
  KerusiSeatmapHandle,
  KerusiSeatmapProps,
  SeatInteraction,
  SectionRenderOptions,
} from './types.js';
import { useMaximized } from './use-maximized.js';
import { useRovingFocus } from './use-roving-focus.js';
import { useViewport } from './use-viewport.js';

const NO_SELECTION: readonly string[] = [];
const DEFAULT_SELECTABLE_STATUSES = ['available'] as const;
const NO_OVERRIDES: Readonly<Record<string, SectionRenderOptions>> = {};

/**
 * Renders a Kerusi seat map.
 *
 * Takes a `KerusiMap` and its `KerusiState` directly — no adapter, no
 * intermediate row model. Each `Section` becomes its own `<svg>` with its own
 * layout mode and proportions, seats take their color from the map's legend,
 * every seat is keyboard-reachable and announced with its type, price, status
 * and §4.3.4 accessibility properties, and selection is an immutable list of
 * seat ids.
 *
 * ```tsx
 * <KerusiSeatmap map={map} state={state} selection={picked} onSelectionChange={setPicked} />
 * ```
 *
 * Import the stylesheet once, anywhere in the app:
 * `import '@kerusiweb/react/styles.css'`.
 *
 * Two opt-in features sit on top, both off by default so an existing map is
 * unchanged: `zoomable` (pinch, wheel and drag, keys `+` `-` `0`, buttons) and
 * `maximizable` (a full-screen button). Their arithmetic is in
 * `@kerusiweb/core`; this file supplies the listeners and the state.
 */
export const KerusiSeatmap = forwardRef<KerusiSeatmapHandle, KerusiSeatmapProps>(
  function KerusiSeatmap(props, ref) {
    const {
      map,
      state,
      session,
      selection: controlledSelection,
      defaultSelection = NO_SELECTION,
      onSelectionChange,
      locale,
      rtl = 'auto',
      ariaStrings = DEFAULT_SEAT_ARIA_STRINGS,
      colors,
      typeColors = true,
      seatTypeStyles,
      seatStyle,
      renderSeat,
      seatSize = 28,
      seatGap = 6,
      freeformBasis = 1000,
      unitScale = 1,
      showSectionLabels = true,
      showLegend = false,
      showLegendPrices = true,
      sectionIds,
      sectionOverrides = NO_OVERRIDES,
      selectableStatuses = DEFAULT_SELECTABLE_STATUSES,
      companionMode = 'auto',
      maxSelection,
      seatSelectable,
      interactive = true,
      expireHolds = false,
      expiryIntervalMs = 1000,
      zoomable = false,
      maxZoom = DEFAULT_MAX_ZOOM,
      showZoomControls = true,
      maximizable = false,
      controlStrings,
      validate = 'collect',
      onSeatSelect,
      onSeatDeselect,
      onSeatDisallowed,
      onSeatFocus,
      onValidationIssues,
      onViewportChange,
      onMaximizedChange,
      className,
      style,
      children,
    } = props;

    // --- selection: controlled or not ---------------------------------------

    const [uncontrolledSelection, setUncontrolledSelection] =
      useState<readonly string[]>(defaultSelection);
    const isControlled = controlledSelection !== undefined;
    const selection = isControlled ? controlledSelection : uncontrolledSelection;

    const commitSelection = useCallback(
      (next: readonly string[]) => {
        if (!isControlled) {
          setUncontrolledSelection(next);
        }
        onSelectionChange?.(next);
      },
      [isControlled, onSelectionChange],
    );

    // --- validation ---------------------------------------------------------

    const issues = useMemo<readonly KerusiViolation[]>(
      () => (validate === 'off' ? [] : validateDocumentSet({ map, state, session })),
      [validate, map, state, session],
    );

    useEffect(() => {
      if (validate !== 'off') {
        onValidationIssues?.(issues);
      }
      // `onValidationIssues` is deliberately absent: an inline callback would
      // re-announce the same issues on every render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [issues, validate]);

    if (validate === 'throw') {
      // Thrown during render, not from an effect, so a React error boundary
      // catches it — the idiomatic equivalent of the Angular binding's throw.
      const [first] = errorsOf(issues);
      if (first) {
        throw new KerusiValidationError(first.message, first.rule, first.id, issues);
      }
    }

    // --- derived model ------------------------------------------------------

    /** Bumped by the hold ticker to force the state to be re-derived. */
    const [expiryTick, setExpiryTick] = useState(0);

    useEffect(() => {
      if (!expireHolds) {
        return;
      }
      const handle = setInterval(() => setExpiryTick((n) => n + 1), expiryIntervalMs);
      return () => clearInterval(handle);
    }, [expireHolds, expiryIntervalMs]);

    /** The state actually rendered — with lapsed holds reverted when asked. */
    const effectiveState = useMemo<KerusiState | undefined>(() => {
      if (!state || !expireHolds) {
        return state;
      }
      // `expireHolds` returns the same object when nothing lapsed, so the
      // memos downstream of this one stay stable across a quiet tick.
      void expiryTick;
      return expireHoldsIn(state);
    }, [state, expireHolds, expiryTick]);

    const visibleSectionIds = useMemo<readonly string[] | undefined>(() => {
      const hidden = Object.entries(sectionOverrides)
        .filter(([, o]) => o.hidden)
        .map(([id]) => id);

      if (sectionIds) {
        return sectionIds.filter((id) => !hidden.includes(id));
      }
      if (hidden.length === 0) {
        return undefined;
      }
      return (map.sections ?? []).map((s) => s.id).filter((id) => !hidden.includes(id));
    }, [map, sectionIds, sectionOverrides]);

    const renderMap = useMemo<RenderMap>(
      () =>
        buildRenderModel(map, effectiveState, {
          locale,
          sectionIds: visibleSectionIds,
          selectableStatuses,
          seatSelectable,
        }),
      [map, effectiveState, locale, visibleSectionIds, selectableStatuses, seatSelectable],
    );

    const resolvedLocale = useMemo(() => resolveMapLocale(map, locale), [map, locale]);
    const isRtl = rtl === 'auto' ? isRtlLocale(resolvedLocale) : rtl === true;
    const resolvedColors = useMemo(() => resolveColors(colors), [colors]);
    const selectionSet = useMemo(() => new Set(selection), [selection]);

    /** Placed geometry per section, keyed by section id. */
    const layouts = useMemo<ReadonlyMap<string, SectionLayout>>(
      () =>
        new Map(
          renderMap.sections.map((section) => {
            const override = sectionOverrides[section.id] ?? {};
            return [
              section.id,
              computeSectionLayout(section, {
                seatSize: override.seatSize ?? seatSize,
                seatGap,
                freeformBasis,
                aspectRatio: override.aspectRatio,
                rtl: isRtl,
              }),
            ];
          }),
        ),
      [renderMap, sectionOverrides, seatSize, seatGap, freeformBasis, isRtl],
    );

    /** Navigation graphs per section — arrows move within, Tab moves between. */
    const graphs = useMemo<ReadonlyMap<string, NavigationGraph>>(
      () =>
        new Map(
          renderMap.sections.map((section) => [
            section.id,
            buildNavigationGraph(section, { rtl: isRtl }),
          ]),
        ),
      [renderMap, isRtl],
    );

    const ariaLabels = useMemo<ReadonlyMap<string, string>>(
      () =>
        new Map(
          [...renderMap.seatsById.values()].map((seat) => [
            seat.id,
            seatAriaLabel(seat, resolvedLocale, ariaStrings),
          ]),
        ),
      [renderMap, resolvedLocale, ariaStrings],
    );

    // --- focus and announcements --------------------------------------------

    const { focusedSeatIds, setFocusedSeat, moveFocusTo, focusSeat, getSeatNode, registerSeat } =
      useRovingFocus(renderMap, zoomable);

    // --- zoom, pan and maximize -----------------------------------------------

    const rootRef = useRef<HTMLDivElement | null>(null);
    const zoom = useViewport({ enabled: zoomable, maxZoom, onViewportChange });
    const { maximized, toggleMaximized, setMaximized } = useMaximized({
      enabled: maximizable,
      rootRef,
      onChange: onMaximizedChange,
    });
    const strings = useMemo(() => resolveControlStrings(controlStrings), [controlStrings]);
    const controlColors = useMemo(() => controlStyle(colors), [colors]);
    const showToolbar = (zoomable && showZoomControls) || maximizable;
    const atFit = zoom.viewport.zoom <= 1 + 1e-4;
    const atMaxZoom = zoom.viewport.zoom >= zoom.limits.maxZoom - 1e-4;

    /**
     * The live-region text, plus a counter that makes a repeat of the same
     * message textually distinct.
     *
     * A live region that sees no text change stays silent, so announcing the
     * same thing twice — picking two seats and hearing "1 seat selected" both
     * times — needs the second one to differ somehow. The Angular binding
     * clears the region and refills it a microtask later; two commits, which
     * React would batch back into one unless deliberately escaped. Appending a
     * zero-width space on alternate announcements does the same job in a single
     * commit: the text differs, and no screen reader speaks the character.
     */
    const [announcement, setAnnouncement] = useState({ message: '', nonce: 0 });

    const announce = useCallback((message: string) => {
      setAnnouncement((current) => ({ message, nonce: current.nonce + 1 }));
    }, []);

    const liveMessage =
      announcement.nonce % 2 === 0 ? announcement.message : `${announcement.message}\u200b`;

    const announceSelection = useCallback(
      (next: readonly string[]) => {
        if (next.length === 0) {
          announce(ariaStrings.selectionEmpty);
          return;
        }
        const { total } = summarizeSelection(renderMap, next);
        announce(ariaStrings.selectionSummary(next.length, formatTotal(total, resolvedLocale)));
      },
      [announce, ariaStrings, renderMap, resolvedLocale],
    );

    // --- interaction --------------------------------------------------------

    const onSeatActivate = useCallback(
      (seatId: string) => {
        const seat = renderMap.seatsById.get(seatId);
        if (!seat) {
          return;
        }

        const outcome = toggleSeatSelection(selection, seatId, {
          seatsById: renderMap.seatsById,
          companionMode,
          maxSelection,
        });

        if (outcome.kind === 'disallowed') {
          announce(disallowedAnnouncement(seat, outcome.reason!, ariaStrings));
          onSeatDisallowed?.({ seat, reason: outcome.reason! });
          return;
        }

        commitSelection(outcome.selection);
        const event: SeatInteraction = {
          seat,
          selection: outcome.selection,
          changed: outcome.changed,
        };
        (outcome.kind === 'select' ? onSeatSelect : onSeatDeselect)?.(event);
        announceSelection(outcome.selection);
      },
      [
        renderMap,
        selection,
        companionMode,
        maxSelection,
        announce,
        ariaStrings,
        onSeatDisallowed,
        commitSelection,
        onSeatSelect,
        onSeatDeselect,
        announceSelection,
      ],
    );

    const onSeatFocused = useCallback(
      (seatId: string) => {
        const seat = renderMap.seatsById.get(seatId);
        if (!seat) {
          return;
        }
        setFocusedSeat(seat.sectionId, seatId);
        onSeatFocus?.(seat);
        if (zoomable) {
          zoom.revealSeat(getSeatNode(seatId));
        }
      },
      [renderMap, setFocusedSeat, onSeatFocus, zoomable, zoom.revealSeat, getSeatNode],
    );

    /**
     * Arrow keys walk the navigation graph, which orders seats by `col` in grid
     * and mixed sections — §4.3.1's logical adjacency — so the aisle that is a
     * skipped column is stepped across rather than into.
     */
    const onKeyDown = useCallback(
      (sectionId: string, event: ReactKeyboardEvent<SVGGElement>) => {
        const seatId = (event.target as HTMLElement | null)?.dataset?.['seatId'];
        if (!seatId) {
          return;
        }

        const graph = graphs.get(sectionId);
        if (!graph) {
          return;
        }
        const neighbours = graph.neighbours.get(seatId);

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
            onSeatActivate(seatId);
            return;
          case 'Escape':
            if (selection.length > 0) {
              event.preventDefault();
              commitSelection([]);
              announceSelection([]);
            }
            return;
          default:
            return;
        }

        if (target) {
          event.preventDefault();
          moveFocusTo(sectionId, target);
        }
      },
      [graphs, onSeatActivate, selection, commitSelection, announceSelection, moveFocusTo],
    );

    // --- public handle ------------------------------------------------------

    const summary = useMemo(() => summarizeSelection(renderMap, selection), [renderMap, selection]);

    useImperativeHandle(
      ref,
      () => ({
        summary,
        focusSeat,
        viewport: zoom.viewport,
        zoomIn: zoom.zoomIn,
        zoomOut: zoom.zoomOut,
        resetZoom: zoom.resetZoom,
        maximized,
        toggleMaximized,
      }),
      [
        summary,
        focusSeat,
        zoom.viewport,
        zoom.zoomIn,
        zoom.zoomOut,
        zoom.resetZoom,
        maximized,
        toggleMaximized,
      ],
    );

    /**
     * `+` `-` `0` zoom, and arrows pan when the viewport itself has focus; Esc
     * leaves a maximized map. A seat's own handler runs first, so an Esc that
     * cleared the selection is already `defaultPrevented` and stays at that.
     */
    const onRootKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.defaultPrevented || isTextEntryTarget(event.target as HTMLElement | null)) {
        return;
      }
      if (zoomable && zoom.handleKeyDown(event)) {
        event.preventDefault();
        return;
      }
      if (event.key === 'Escape' && maximized) {
        event.preventDefault();
        setMaximized(false);
      }
    };

    // --- render -------------------------------------------------------------

    const labelFor = (section: RenderSection): string | undefined =>
      sectionOverrides[section.id]?.label ?? section.label;
    const labelId = (section: RenderSection): string =>
      `kerusi-section-${renderMap.id}-${section.id}`;

    const sections = renderMap.sections.map((section) => {
      const label = labelFor(section);
      return (
        <section
          key={section.id}
          className={`kerusi-seatmap__section kerusi-seatmap__section--${section.layoutMode}`}
          role="group"
          aria-labelledby={label ? labelId(section) : undefined}
          aria-label={label ? undefined : section.id}
        >
          {showSectionLabels && label && (
            <h3 className="kerusi-section-label" id={labelId(section)}>
              {label}
            </h3>
          )}

          <KerusiSection
            section={section}
            layout={layouts.get(section.id)!}
            selection={selectionSet}
            focusedSeatId={focusedSeatIds[section.id] ?? null}
            ariaLabels={ariaLabels}
            colors={resolvedColors}
            typeColors={typeColors}
            seatTypeStyles={seatTypeStyles}
            seatStyle={seatStyle}
            renderSeat={renderSeat}
            unitScale={unitScale}
            interactive={interactive}
            onSeatActivate={onSeatActivate}
            onSeatFocused={onSeatFocused}
            onSeatKeyDown={(event) => onKeyDown(section.id, event)}
            registerSeat={registerSeat}
          />
        </section>
      );
    });

    const focusRing = { '--kerusi-focus-ring-input': resolvedColors.focusRing } as CSSProperties;
    const buttonStyle: CSSProperties = {
      background: controlColors.buttonBackground,
      color: controlColors.buttonColor,
      borderColor: controlColors.buttonBorder,
    };
    const classes = ['kerusi-seatmap', className, maximized && 'kerusi-seatmap--maximized']
      .filter(Boolean)
      .join(' ');

    return (
      <div
        ref={rootRef}
        className={classes}
        role="group"
        aria-label={renderMap.name ?? `Seat map ${renderMap.id}`}
        dir={isRtl ? 'rtl' : undefined}
        lang={resolvedLocale}
        style={
          maximized
            ? {
                ...style,
                background: controlColors.maximizedBackground,
                color: controlColors.maximizedColor,
              }
            : style
        }
        onKeyDown={onRootKeyDown}
      >
        {/* Only when a zoom or maximize feature is on, so a plain map's markup is
            exactly what it was before they existed. */}
        {zoomable || maximizable ? (
          <div className="kerusi-seatmap__stage">
            {showToolbar && (
              <div
                className="kerusi-toolbar"
                role="toolbar"
                aria-label={strings.toolbar}
                style={focusRing}
              >
                {zoomable && showZoomControls && (
                  <>
                    <button
                      type="button"
                      className="kerusi-control kerusi-control--zoom-in"
                      aria-label={strings.zoomIn}
                      aria-disabled={atMaxZoom}
                      style={buttonStyle}
                      onClick={zoom.zoomIn}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="kerusi-control kerusi-control--zoom-out"
                      aria-label={strings.zoomOut}
                      aria-disabled={atFit}
                      style={buttonStyle}
                      onClick={zoom.zoomOut}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M5 12h14" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="kerusi-control kerusi-control--zoom-reset"
                      aria-label={strings.zoomReset}
                      aria-disabled={atFit}
                      style={buttonStyle}
                      onClick={zoom.resetZoom}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
                      </svg>
                    </button>
                  </>
                )}
                {maximizable && (
                  <button
                    type="button"
                    className="kerusi-control kerusi-control--maximize"
                    aria-label={maximized ? strings.restore : strings.maximize}
                    style={buttonStyle}
                    onClick={toggleMaximized}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      {maximized ? (
                        <path d="M9 4v5H4M15 4v5h5M15 20v-5h5M9 20v-5H4" />
                      ) : (
                        <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
                      )}
                    </svg>
                  </button>
                )}
              </div>
            )}

            {zoomable ? (
              <div
                ref={zoom.viewRef}
                className="kerusi-viewport"
                role="group"
                tabIndex={0}
                aria-label={strings.viewport}
                style={
                  {
                    ...focusRing,
                    touchAction: viewportTouchAction(zoom.viewport, maximized),
                  } as CSSProperties
                }
              >
                <div
                  ref={zoom.contentRef}
                  className={
                    zoom.animated
                      ? 'kerusi-viewport__content kerusi-viewport__content--animated'
                      : 'kerusi-viewport__content'
                  }
                  style={{ transform: viewportTransform(zoom.viewport) }}
                >
                  {sections}
                </div>
              </div>
            ) : (
              sections
            )}
          </div>
        ) : (
          sections
        )}

        {showLegend && (
          <KerusiLegend
            legend={renderMap.legend}
            locale={resolvedLocale}
            colors={resolvedColors}
            typeColors={typeColors}
            seatTypeStyles={seatTypeStyles}
            showPrices={showLegendPrices}
          />
        )}

        <p className="kerusi-sr-only" aria-live="polite" aria-atomic="true">
          {liveMessage}
        </p>

        {children}
      </div>
    );
  },
);

function formatTotal(total: Money | undefined, locale: string): string {
  return total ? formatMoney(total, locale) : '';
}
