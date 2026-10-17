import {
  canvasRectToContent,
  clampViewport,
  FIT_VIEWPORT,
  fitViewport,
  IDLE_GESTURE,
  keyboardViewport,
  reduceGesture,
  revealRect,
  stepViewport,
  viewportForRect,
  viewportsEqual,
  wheelZoomFactor,
  zoomLimits,
  zoomViewportBy,
  zoomViewportTo,
} from '@kerusiweb/core';
import type {
  GestureEvent,
  GestureState,
  KerusiViewport,
  ViewportLimits,
  ViewportPoint,
  ViewportRect,
  ViewportSize,
} from '@kerusiweb/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';

export interface UseViewportOptions {
  /** The map's `zoomable` prop. When false nothing is attached and the viewport is fit. */
  enabled: boolean;
  maxZoom: number;
  onViewportChange?: (viewport: KerusiViewport) => void;
}

/** The slice of a key event {@link ViewportControls.handleKeyDown} reads. */
export interface ViewportKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

export interface ViewportControls {
  viewport: KerusiViewport;
  /** True for a discrete change (button, key, reveal), false while a finger or wheel drives. */
  animated: boolean;
  limits: ViewportLimits;
  /** Attach to the clipping window. */
  viewRef: RefObject<HTMLDivElement | null>;
  /** Attach to the element the transform is applied to. */
  contentRef: RefObject<HTMLDivElement | null>;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  /** Zooms to a rect in canvas units — a section's bounds — on a canvas of the given size. */
  zoomToCanvasRect(rect: ViewportRect, canvas: ViewportSize): void;
  /** Pans a keyboard-focused seat into view. */
  revealSeat(node: Element | null): void;
  /** Applies `+` `-` `0` and, when the viewport has focus, the arrows. True if it acted. */
  handleKeyDown(event: ViewportKeyEvent): boolean;
}

/**
 * The zoom and pan of a `zoomable` map.
 *
 * What a wheel tick, a pinch or a key means is `@kerusiweb/core`'s; this hook
 * supplies the React half: state to render from, a ref for the value the
 * native listeners read between renders, and the listeners themselves. They
 * are native, not `onWheel` / `onClick` props, for two reasons React's
 * synthetic events cannot meet: wheel must be non-passive to `preventDefault`
 * a page zoom, and the click that ends a drag must be stopped in the capture
 * phase, before it reaches the seat.
 */
export function useViewport({
  enabled,
  maxZoom,
  onViewportChange,
}: UseViewportOptions): ViewportControls {
  const limits = useMemo(() => zoomLimits(maxZoom), [maxZoom]);
  const [viewport, setViewport] = useState<KerusiViewport>(FIT_VIEWPORT);
  const [animated, setAnimated] = useState(false);
  const viewRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  /**
   * The truth between renders. Several wheel events can land before React
   * re-renders, and each must start from the one before.
   */
  const viewportRef = useRef<KerusiViewport>(FIT_VIEWPORT);
  const settings = useRef({ enabled, limits, onViewportChange });
  settings.current = { enabled, limits, onViewportChange };

  const commit = useCallback((next: KerusiViewport, animate: boolean) => {
    if (viewportsEqual(next, viewportRef.current)) {
      return;
    }
    viewportRef.current = next;
    setAnimated(animate);
    setViewport(next);
    settings.current.onViewportChange?.(next);
  }, []);

  /** Sizes in CSS pixels, read when needed: `offset*` ignores the zoom transform. */
  const measure = useCallback((): { content: ViewportSize; container: ViewportSize } | null => {
    const view = viewRef.current;
    const content = contentRef.current;
    if (!view || !content) {
      return null;
    }
    return {
      container: { width: view.clientWidth, height: view.clientHeight },
      content: { width: content.offsetWidth, height: content.offsetHeight },
    };
  }, []);

  const stepZoom = useCallback(
    (direction: 1 | -1) => {
      const measured = measure();
      if (measured && settings.current.enabled) {
        commit(
          stepViewport(
            viewportRef.current,
            direction,
            measured.content,
            measured.container,
            settings.current.limits,
          ),
          true,
        );
      }
    },
    [commit, measure],
  );

  const zoomIn = useCallback(() => stepZoom(1), [stepZoom]);
  const zoomOut = useCallback(() => stepZoom(-1), [stepZoom]);

  const resetZoom = useCallback(() => {
    const measured = measure();
    if (measured && settings.current.enabled) {
      commit(fitViewport(measured.content, measured.container, settings.current.limits), true);
    }
  }, [commit, measure]);

  const zoomToCanvasRect = useCallback(
    (rect: ViewportRect, canvas: ViewportSize) => {
      const measured = measure();
      if (!measured || !settings.current.enabled || !(canvas.width > 0 && canvas.height > 0)) {
        return;
      }
      // The map's <svg> is the content's only child and sets its height; its
      // width can stop short of the content's (`unitScale` caps it), so the
      // drawn width comes from the height and the canvas's proportions.
      const drawn = {
        width: (measured.content.height * canvas.width) / canvas.height,
        height: measured.content.height,
      };
      commit(
        viewportForRect(
          canvasRectToContent(rect, canvas, drawn),
          measured.content,
          measured.container,
          undefined,
          settings.current.limits,
        ),
        true,
      );
    },
    [commit, measure],
  );

  const reclamp = useCallback(() => {
    const measured = measure();
    if (measured && settings.current.enabled) {
      commit(
        clampViewport(
          viewportRef.current,
          measured.content,
          measured.container,
          settings.current.limits,
        ),
        false,
      );
    }
  }, [commit, measure]);

  // Re-clamp when the box or the ceiling changes: a rotated phone, a maximized
  // map, a lowered `maxZoom`.
  useEffect(() => {
    if (!enabled) {
      return;
    }
    reclamp();
    const view = viewRef.current;
    if (!view || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => reclamp());
    observer.observe(view);
    if (contentRef.current) {
      observer.observe(contentRef.current);
    }
    return () => observer.disconnect();
  }, [enabled, limits, reclamp]);

  // Switching `zoomable` off puts the map back as it was.
  useEffect(() => {
    if (!enabled && !viewportsEqual(viewportRef.current, FIT_VIEWPORT)) {
      viewportRef.current = FIT_VIEWPORT;
      setViewport(FIT_VIEWPORT);
    }
  }, [enabled]);

  // --- pointer, wheel and trackpad listeners --------------------------------

  useEffect(() => {
    const view = viewRef.current;
    if (!enabled || !view) {
      return;
    }

    let gesture: GestureState = IDLE_GESTURE;
    let suppressClick = false;
    let gestureBase: KerusiViewport | null = null;

    const containerPoint = (event: { clientX: number; clientY: number }): ViewportPoint => {
      const box = view.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };

    const feed = (event: GestureEvent) => {
      const measured = measure();
      if (!measured) {
        return;
      }
      const result = reduceGesture(gesture, event, {
        viewport: viewportRef.current,
        content: measured.content,
        container: measured.container,
        limits: settings.current.limits,
      });
      gesture = result.state;

      // Capture only once a tap has become a gesture: capturing on `down` would
      // retarget the tap's click away from the seat.
      if (result.capture) {
        for (const id of result.state.ids) {
          try {
            view.setPointerCapture(id);
          } catch {
            // The pointer already ended, or there is no capture here.
          }
        }
      }
      if (result.viewport !== viewportRef.current) {
        commit(result.viewport, false);
      }
      if (result.suppressClick) {
        // The click a drag ends with arrives right after `pointerup`, before this timer.
        suppressClick = true;
        setTimeout(() => {
          suppressClick = false;
        });
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) {
        return;
      }
      suppressClick = false;
      feed({ type: 'down', id: e.pointerId, point: containerPoint(e) });
    };
    const onPointerMove = (e: PointerEvent) => {
      if (gesture.ids.length > 0) {
        feed({ type: 'move', id: e.pointerId, point: containerPoint(e) });
      }
    };
    const onPointerUp = (e: PointerEvent) => feed({ type: 'up', id: e.pointerId });
    const onPointerCancel = (e: PointerEvent) => feed({ type: 'cancel', id: e.pointerId });

    const onClick = (e: Event) => {
      if (suppressClick) {
        suppressClick = false;
        e.stopPropagation();
        e.preventDefault();
      }
    };

    const onWheel = (e: WheelEvent) => {
      const factor = wheelZoomFactor(e);
      const measured = measure();
      if (factor === null || !measured) {
        return; // A plain wheel is the page's to scroll.
      }
      e.preventDefault();
      commit(
        zoomViewportBy(
          viewportRef.current,
          factor,
          containerPoint(e),
          measured.content,
          measured.container,
          settings.current.limits,
        ),
        false,
      );
    };

    // Safari reports a trackpad pinch as gesture events, not Ctrl + wheel.
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureBase = viewportRef.current;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const measured = measure();
      const { scale, clientX, clientY } = e as unknown as {
        scale: number;
        clientX: number;
        clientY: number;
      };
      if (!gestureBase || !measured) {
        return;
      }
      commit(
        zoomViewportTo(
          gestureBase,
          gestureBase.zoom * scale,
          containerPoint({ clientX, clientY }),
          measured.content,
          measured.container,
          settings.current.limits,
        ),
        false,
      );
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      gestureBase = null;
    };

    const listeners: [string, EventListener, boolean | AddEventListenerOptions][] = [
      ['pointerdown', onPointerDown as EventListener, false],
      ['pointermove', onPointerMove as EventListener, false],
      ['pointerup', onPointerUp as EventListener, false],
      ['pointercancel', onPointerCancel as EventListener, false],
      ['wheel', onWheel as EventListener, { passive: false }],
      ['click', onClick, true],
      ['gesturestart', onGestureStart, { passive: false }],
      ['gesturechange', onGestureChange, { passive: false }],
      ['gestureend', onGestureEnd, { passive: false }],
    ];
    for (const [type, listener, options] of listeners) {
      view.addEventListener(type, listener, options);
    }
    return () => {
      for (const [type, listener, options] of listeners) {
        view.removeEventListener(type, listener, options);
      }
    };
  }, [enabled, commit, measure]);

  // --- keyboard and focus ---------------------------------------------------

  const handleKeyDown = useCallback(
    (event: ViewportKeyEvent): boolean => {
      const measured = measure();
      if (!settings.current.enabled || !measured) {
        return false;
      }
      const next = keyboardViewport(
        viewportRef.current,
        {
          key: event.key,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          viewportFocused: event.target === viewRef.current,
        },
        measured.content,
        measured.container,
        settings.current.limits,
      );
      if (!next) {
        return false;
      }
      commit(next, true);
      return true;
    },
    [commit, measure],
  );

  /**
   * A click or tap also focuses a seat, but should not move the map under the
   * finger, so only a `:focus-visible` focus counts.
   */
  const revealSeat = useCallback(
    (node: Element | null) => {
      const view = viewRef.current;
      const measured = measure();
      if (!settings.current.enabled || !view || !node || !measured || !focusIsVisible(node)) {
        return;
      }
      const seat = node.getBoundingClientRect();
      const frame = view.getBoundingClientRect();
      commit(
        revealRect(
          viewportRef.current,
          {
            x: seat.left - frame.left,
            y: seat.top - frame.top,
            width: seat.width,
            height: seat.height,
          },
          measured.content,
          measured.container,
          undefined,
          settings.current.limits,
        ),
        true,
      );
    },
    [commit, measure],
  );

  return {
    viewport,
    animated,
    limits,
    viewRef,
    contentRef,
    zoomIn,
    zoomOut,
    resetZoom,
    zoomToCanvasRect,
    revealSeat,
    handleKeyDown,
  };
}

/** `:focus-visible` where the engine knows it; otherwise assume the focus is the keyboard's. */
function focusIsVisible(node: Element): boolean {
  try {
    return node.matches(':focus-visible');
  } catch {
    return true;
  }
}
