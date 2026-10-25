import {
  buildNavigationGraph,
  buildRenderModel,
  computeViewLayout,
  controlStyle,
  cssVar,
  DEFAULT_MAX_ZOOM,
  DEFAULT_SEAT_ARIA_STRINGS,
  disallowedAnnouncement,
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
  selectedWholeUnits,
  summarizeSelection,
  toggleSeatSelection,
  toggleWholeUnit,
  validateDocumentSet,
  viewportTouchAction,
  viewportTransform,
  wholeUnitAriaLabel,
  wholeUnitControlAction,
  wholeUnitControlGroups,
  wholeUnitDisallowedAnnouncement,
} from '@kerusiweb/core';
import type {
  KerusiState,
  KerusiViolation,
  MapLayout,
  Money,
  NavigationGraph,
  RenderGroup,
  RenderMap,
  RenderSection,
  SeatClickSource,
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
import { useSeatCards } from './use-seat-cards.js';
import { useViewport } from './use-viewport.js';

const NO_SELECTION: readonly string[] = [];
const DEFAULT_SELECTABLE_STATUSES = ['available'] as const;
const NO_OVERRIDES: Readonly<Record<string, SectionRenderOptions>> = {};

/**
 * Renders a Kerusi seat map.
 *
 * Takes a `KerusiMap` and its `KerusiState` directly — no adapter, no
 * intermediate row model. The map is one `<svg>` whose `viewBox` is the
 * document's canvas (§4.5), each `Section` is a group on it, every seat is
 * drawn exactly where and as large as the document says, seats take their
 * color from the map's legend,
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
      view = 'canonical',
      ariaStrings = DEFAULT_SEAT_ARIA_STRINGS,
      colors,
      typeColors = true,
      seatTypeStyles,
      seatStyle,
      renderSeat,
      unitScale = 1,
      showSectionLabels = true,
      showLegend = false,
      showLegendPrices = true,
      sectionIds,
      sectionOverrides = NO_OVERRIDES,
      selectableStatuses = DEFAULT_SELECTABLE_STATUSES,
      unitMode = 'auto',
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
      onSeatHover,
      onSeatClick,
      renderHoverCard,
      renderClickCard,
      renderWholeUnitHoverCard,
      renderWholeUnitClickCard,
      onWholeUnitDisallowed,
      wholeUnitPrice,
      seatCardPlacement = 'top',
      seatCardClassName,
      seatCardAppearance = 'default',
      hoverCardDelay,
      hoverCardOnFocus = false,
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

    /** Read by `commitSelection`, which is declared before the render model. */
    const renderMapRef = useRef<RenderMap | null>(null);

    const commitSelection = useCallback(
      (next: readonly string[]) => {
        if (!isControlled) {
          setUncontrolledSelection(next);
        }
        if (onSelectionChange) {
          const wholeUnits = renderMapRef.current
            ? selectedWholeUnits(renderMapRef.current, next)
            : [];
          onSelectionChange(next, { selection: next, wholeUnits });
        }
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
          session,
          unitMode,
        }),
      [
        map,
        effectiveState,
        locale,
        visibleSectionIds,
        selectableStatuses,
        seatSelectable,
        session,
        unitMode,
      ],
    );
    renderMapRef.current = renderMap;

    const resolvedLocale = useMemo(() => resolveMapLocale(map, locale), [map, locale]);
    const isRtl = rtl === 'auto' ? isRtlLocale(resolvedLocale) : rtl === true;
    const resolvedColors = useMemo(() => resolveColors(colors), [colors]);
    const selectionSet = useMemo(() => new Set(selection), [selection]);

    /**
     * Every seat and element placed on the canvas, mirrored as a whole in RTL
     * (D3): the document's own drawing, or the rows view (§4.5.1).
     */
    const layout = useMemo<MapLayout>(
      () => computeViewLayout(renderMap, view, { rtl: isRtl }),
      [renderMap, view, isRtl],
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

    /** Every group by id, for a whole unit's control to find its unit and seats. */
    const groupsById = useMemo<ReadonlyMap<string, RenderGroup>>(
      () =>
        new Map(
          renderMap.sections.flatMap((section) => section.groups.map((g) => [g.id, g] as const)),
        ),
      [renderMap],
    );

    /** The name and, while it cannot be booked, the reason of each whole unit's control (D19). */
    const wholeUnitLabels = useMemo<ReadonlyMap<string, { label: string; reason?: string }>>(
      () =>
        new Map(
          [...groupsById.values()].flatMap((group) =>
            group.wholeUnit
              ? [
                  [
                    group.id,
                    {
                      label: wholeUnitAriaLabel(
                        group.wholeUnit,
                        resolvedLocale,
                        ariaStrings,
                        wholeUnitPrice,
                      ),
                      reason: group.wholeUnit.selectable
                        ? undefined
                        : wholeUnitDisallowedAnnouncement(
                            group.wholeUnit,
                            'unit-unavailable',
                            ariaStrings,
                          ),
                    },
                  ] as const,
                ]
              : [],
          ),
        ),
      [groupsById, resolvedLocale, ariaStrings, wholeUnitPrice],
    );

    /** The groups whose shape is drawn as the control that books them whole (D19). */
    const controlGroups = useMemo<ReadonlyMap<string, RenderGroup>>(
      () => wholeUnitControlGroups(groupsById, interactive),
      [groupsById, interactive],
    );

    // --- focus and announcements --------------------------------------------

    const { focusedSeatIds, setFocusedSeat, moveFocusTo, focusSeat, getSeatNode, registerSeat } =
      useRovingFocus(renderMap, zoomable);

    // --- seat cards and hover (D10) -------------------------------------------

    const rootRef = useRef<HTMLDivElement | null>(null);
    const cards = useSeatCards({
      rootRef,
      renderMap,
      selection: selectionSet,
      locale: resolvedLocale,
      ariaStrings,
      getSeatNode,
      focusSeat,
      onSeatHover,
      renderHoverCard,
      renderClickCard,
      controlGroups,
      renderWholeUnitHoverCard,
      renderWholeUnitClickCard,
      wholeUnitPrice,
      placement: seatCardPlacement,
      className: seatCardClassName,
      appearance: seatCardAppearance,
      hoverCardDelay,
      hoverCardOnFocus,
    });

    /**
     * Whether a click behaviour is configured (D14): `onSeatClick` or a click
     * card. It is what keeps a read-only map's seats clickable and reachable.
     */
    const clickable = !!onSeatClick || !!renderClickCard;
    /** Seats take pointer and keyboard interaction: to select, to click, or to show a card. */
    const reachable = interactive || clickable || cards.tracksFocus;

    // --- zoom, pan and maximize -----------------------------------------------

    const zoom = useViewport({
      enabled: zoomable,
      maxZoom,
      onViewportChange,
      onGestureStart: cards.gesture,
    });
    // The two views share no geometry, so a zoom into one means nothing in the other.
    const shownView = useRef(view);
    useEffect(() => {
      if (shownView.current !== view) {
        shownView.current = view;
        zoom.resetZoom();
      }
    }, [view, zoom.resetZoom]);
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
      (seatId: string, source: SeatClickSource = 'pointer') => {
        const seat = renderMap.seatsById.get(seatId);
        if (!seat) {
          return;
        }

        // The click is reported first, with the selection as it stood before it,
        // and cannot change what follows (D13).
        onSeatClick?.({ seat, selected: selectionSet.has(seatId), source });
        cards.activate(seatId, source);

        // A read-only map stops here: selection is off (D14).
        if (!interactive) {
          return;
        }

        const outcome = toggleSeatSelection(selection, seatId, {
          seatsById: renderMap.seatsById,
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
        selectionSet,
        interactive,
        onSeatClick,
        cards.activate,
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

    /**
     * A whole unit's control (D19): books every seat of an `either` table, or
     * releases them all when the table is already booked whole. The seat events
     * do not fire, since no one seat was pressed; `onSelectionChange` does, and
     * `onWholeUnitDisallowed` when it is refused (D25).
     */
    const onWholeUnitActivate = useCallback(
      (groupId: string, source: SeatClickSource = 'pointer') => {
        const group = groupsById.get(groupId);
        const unit = group?.wholeUnit;
        if (!group || !unit || !interactive) {
          return;
        }
        cards.activateUnit(groupId, source);
        const outcome = toggleWholeUnit(selection, unit, {
          seatsById: renderMap.seatsById,
          maxSelection,
        });
        if (outcome.kind === 'disallowed') {
          announce(wholeUnitDisallowedAnnouncement(unit, outcome.reason!, ariaStrings));
          onWholeUnitDisallowed?.({ unit, group, reason: outcome.reason! });
          return;
        }
        commitSelection(outcome.selection);
        announceSelection(outcome.selection);
      },
      [
        groupsById,
        interactive,
        cards.activateUnit,
        selection,
        renderMap,
        maxSelection,
        announce,
        ariaStrings,
        onWholeUnitDisallowed,
        commitSelection,
        announceSelection,
      ],
    );

    /** Keys on a whole unit's control, by the map core shares with the Angular binding. */
    const onWholeUnitKeyDown = useCallback(
      (sectionId: string, groupId: string, event: ReactKeyboardEvent<SVGGElement>) => {
        switch (wholeUnitControlAction(event.key)) {
          case 'toggle':
            event.preventDefault();
            onWholeUnitActivate(groupId, 'keyboard');
            return;
          case 'enter-seats': {
            const first = groupsById.get(groupId)?.seatIds[0];
            if (first) {
              event.preventDefault();
              moveFocusTo(sectionId, first);
            }
            return;
          }
          case 'clear':
            if (cards.dismiss()) {
              event.preventDefault();
              return;
            }
            if (selection.length > 0) {
              event.preventDefault();
              commitSelection([]);
              announceSelection([]);
            }
            return;
        }
      },
      [
        onWholeUnitActivate,
        groupsById,
        moveFocusTo,
        cards.dismiss,
        selection,
        commitSelection,
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
        if (cards.tracksFocus) {
          cards.focus(seatId);
        }
        if (zoomable) {
          zoom.revealSeat(getSeatNode(seatId));
        }
      },
      [
        renderMap,
        setFocusedSeat,
        onSeatFocus,
        cards.tracksFocus,
        cards.focus,
        zoomable,
        zoom.revealSeat,
        getSeatNode,
      ],
    );

    /**
     * Arrow keys walk the navigation graph, which follows §4.3.5 adjacency:
     * along a row by `col`, across an aisle (a skipped `col`) rather than into
     * it, and between rows to the seat nearest on the canvas (D6).
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
            onSeatActivate(seatId, 'keyboard');
            return;
          case 'Escape':
            // An open card is dismissed before anything else gives way.
            if (cards.dismiss()) {
              event.preventDefault();
              return;
            }
            if (interactive && selection.length > 0) {
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
      [
        graphs,
        onSeatActivate,
        selection,
        interactive,
        cards.dismiss,
        commitSelection,
        announceSelection,
        moveFocusTo,
      ],
    );

    // --- public handle ------------------------------------------------------

    const summary = useMemo(() => summarizeSelection(renderMap, selection), [renderMap, selection]);

    const zoomToSection = useCallback(
      (sectionId: string) => {
        const placed = layout.sections.find((s) => s.section.id === sectionId);
        if (placed) {
          zoom.zoomToCanvasRect(placed.bounds, layout);
        }
      },
      [layout, zoom.zoomToCanvasRect],
    );

    useImperativeHandle(
      ref,
      () => ({
        summary,
        focusSeat,
        openSeatCard: cards.openSeatCard,
        closeSeatCard: cards.closeSeatCard,
        openSeatCardId: cards.openSeatCardId,
        viewport: zoom.viewport,
        zoomIn: zoom.zoomIn,
        zoomOut: zoom.zoomOut,
        resetZoom: zoom.resetZoom,
        zoomToSection,
        maximized,
        toggleMaximized,
      }),
      [
        summary,
        focusSeat,
        cards.openSeatCard,
        cards.closeSeatCard,
        cards.openSeatCardId,
        zoom.viewport,
        zoom.zoomIn,
        zoom.zoomOut,
        zoom.resetZoom,
        zoomToSection,
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
      if (event.key === 'Escape' && cards.dismiss()) {
        // A card in the way goes first; a second Escape leaves a maximized map.
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

    /** The whole map: one `<svg>` on the document's canvas, a group per section (D1). */
    const mapSvg = (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="kerusi-seatmap__svg"
        role="presentation"
        focusable="false"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        preserveAspectRatio="xMidYMid meet"
        style={
          {
            // The focus ring's middle tier: the stylesheet reads this property,
            // so the `colors` prop can reach a rule it cannot otherwise see.
            '--kerusi-focus-ring-input': resolvedColors.focusRing,
            // `unitScale` CSS pixels per canvas unit, at most.
            maxWidth: layout.width * unitScale,
          } as CSSProperties
        }
      >
        <rect
          x={0}
          y={0}
          width={layout.width}
          height={layout.height}
          style={{ fill: cssVar('backdrop', resolvedColors.backdrop) }}
        />
        {/* A hidden section's group is simply absent; the canvas keeps its
            size, so its space stays empty (D4). */}
        {layout.sections.map((placed) => (
          <KerusiSection
            key={placed.section.id}
            layout={placed}
            label={labelFor(placed.section)}
            showLabel={showSectionLabels}
            selection={selectionSet}
            focusedSeatId={focusedSeatIds[placed.section.id] ?? null}
            ariaLabels={ariaLabels}
            wholeUnitLabels={wholeUnitLabels}
            colors={resolvedColors}
            typeColors={typeColors}
            seatTypeStyles={seatTypeStyles}
            seatStyle={seatStyle}
            renderSeat={renderSeat}
            interactive={interactive}
            clickable={clickable}
            reachable={reachable}
            describedBy={cards.describedBy}
            onSeatActivate={onSeatActivate}
            onSeatFocused={onSeatFocused}
            onSeatBlurred={cards.tracksFocus ? cards.blur : undefined}
            onSeatKeyDown={(event) => onKeyDown(placed.section.id, event)}
            unitDescribedBy={cards.unitDescribedBy}
            onWholeUnitActivate={onWholeUnitActivate}
            onWholeUnitKeyDown={(groupId, event) =>
              onWholeUnitKeyDown(placed.section.id, groupId, event)
            }
            onWholeUnitPointer={cards.tracksUnitPointer ? cards.unitPointer : undefined}
            onWholeUnitFocused={cards.tracksUnitFocus ? cards.unitFocus : undefined}
            onWholeUnitBlurred={cards.tracksUnitFocus ? cards.unitBlur : undefined}
            onSeatPointer={cards.tracksPointer ? cards.pointer : undefined}
            registerSeat={registerSeat}
          />
        ))}
      </svg>
    );

    const focusRing = { '--kerusi-focus-ring-input': resolvedColors.focusRing } as CSSProperties;
    // The palette, handed to the stylesheet, which puts the `--kerusi-control-*`
    // tokens in front of it. Inline colours on the buttons would beat those.
    const toolbarStyle = {
      ...focusRing,
      '--kerusi-control-bg-input': controlColors.buttonBackground,
      '--kerusi-control-fg-input': controlColors.buttonColor,
      '--kerusi-control-border-input': controlColors.buttonBorder,
    } as CSSProperties;
    const classes = [
      'kerusi-seatmap',
      className,
      view === 'rows' && 'kerusi-seatmap--rows',
      maximized && 'kerusi-seatmap--maximized',
    ]
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
                style={toolbarStyle}
              >
                {zoomable && showZoomControls && (
                  <>
                    <button
                      type="button"
                      className="kerusi-control kerusi-control--zoom-in"
                      aria-label={strings.zoomIn}
                      aria-disabled={atMaxZoom}
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
                    // Lets a maximized map fit the whole canvas to the screen.
                    '--kerusi-canvas-aspect': layout.width / layout.height,
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
                  {mapSvg}
                </div>
              </div>
            ) : (
              mapSvg
            )}
          </div>
        ) : (
          mapSvg
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

        {/* Inside the root and outside the clipped viewport, so a card shows in
            full screen and inherits the map's `--kerusi-*` properties. */}
        {cards.elements}

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
