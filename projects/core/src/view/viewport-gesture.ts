import {
  clampViewport,
  KerusiViewport,
  ViewportLimits,
  ViewportPoint,
  ViewportSize,
  zoomLimits,
} from './viewport.js';

/**
 * Pointer gestures on a zoomable map, as a reducer.
 *
 * One pointer pans, two pinch. The rule that matters most is the one that keeps
 * seat selection intact: a touch that never leaves a small circle around where
 * it landed is a *tap* and changes nothing, so the `click` that follows still
 * reaches the seat. A binding feeds `down` / `move` / `up` / `cancel` in
 * container coordinates and applies what comes back; it never has to know what
 * a pinch is.
 */

/** How far a pointer may travel, in CSS pixels, and still be a tap. */
export const TAP_SLOP_PX = 8;

export type GestureEvent =
  | { type: 'down' | 'move'; id: number; point: ViewportPoint }
  | { type: 'up' | 'cancel'; id: number };

/** Where the gesture stands. Opaque to callers: pass it back in. */
export interface GestureState {
  /** Tracked pointer ids, oldest first. A pinch uses the first two. */
  readonly ids: readonly number[];
  /** Where each tracked pointer is now. */
  readonly points: Readonly<Record<number, ViewportPoint>>;
  /** The viewport and pointer positions the current movement is measured from. */
  readonly origin: {
    readonly viewport: KerusiViewport;
    readonly points: Readonly<Record<number, ViewportPoint>>;
  } | null;
  /** True once the gesture is a pan or a pinch rather than a possible tap. */
  readonly moved: boolean;
}

export const IDLE_GESTURE: GestureState = Object.freeze({
  ids: [],
  points: {},
  origin: null,
  moved: false,
});

export interface GestureContext {
  /** The live viewport. */
  viewport: KerusiViewport;
  /** The map's laid-out size, unscaled. */
  content: ViewportSize;
  /** The visible area. */
  container: ViewportSize;
  limits?: ViewportLimits;
  /** Overrides {@link TAP_SLOP_PX}. */
  slop?: number;
}

export interface GestureResult {
  state: GestureState;
  /** The viewport after this event; the very same object when nothing changed. */
  viewport: KerusiViewport;
  /**
   * True on the event that turns a possible tap into a gesture. A binding
   * captures the pointers then, not earlier: capturing on `down` would
   * retarget the tap's `click` away from the seat.
   */
  capture: boolean;
  /**
   * True on the `up` that ends a gesture. The browser still fires a `click`
   * after a drag, and it must not select the seat under the finger.
   */
  suppressClick: boolean;
}

export function reduceGesture(
  state: GestureState,
  event: GestureEvent,
  context: GestureContext,
): GestureResult {
  switch (event.type) {
    case 'down':
      return onDown(state, event.id, event.point, context);
    case 'move':
      return onMove(state, event.id, event.point, context);
    case 'up':
    case 'cancel':
      return onEnd(state, event.id, event.type === 'up', context);
  }
}

function onDown(
  state: GestureState,
  id: number,
  point: ViewportPoint,
  context: GestureContext,
): GestureResult {
  const ids = state.ids.includes(id) ? state.ids : [...state.ids, id];
  const points = { ...state.points, [id]: point };
  // A second finger makes it a pinch at once; there is no tap with two fingers.
  const moved = state.moved || ids.length > 1;
  return {
    // Re-baselined on every change to the pointer set, so nothing jumps.
    state: { ids, points, origin: { viewport: context.viewport, points }, moved },
    viewport: context.viewport,
    capture: moved && !state.moved,
    suppressClick: false,
  };
}

function onMove(
  state: GestureState,
  id: number,
  point: ViewportPoint,
  context: GestureContext,
): GestureResult {
  if (!state.ids.includes(id) || !state.origin) {
    return unchanged(state, context);
  }
  const points = { ...state.points, [id]: point };
  let moved = state.moved;
  let capture = false;

  if (!moved) {
    const slop = context.slop ?? TAP_SLOP_PX;
    const start = state.origin.points[id] ?? point;
    if (distance(start, point) <= slop) {
      return {
        state: { ...state, points },
        viewport: context.viewport,
        capture: false,
        suppressClick: false,
      };
    }
    moved = true;
    capture = true;
  }

  const next = transformFromOrigin(state, points, context);
  return {
    state: { ...state, points, moved },
    viewport: next,
    capture,
    suppressClick: false,
  };
}

function onEnd(
  state: GestureState,
  id: number,
  isUp: boolean,
  context: GestureContext,
): GestureResult {
  if (!state.ids.includes(id)) {
    return unchanged(state, context);
  }
  const ids = state.ids.filter((other) => other !== id);
  const points: Record<number, ViewportPoint> = { ...state.points };
  delete points[id];

  if (ids.length === 0) {
    return {
      state: IDLE_GESTURE,
      viewport: context.viewport,
      capture: false,
      // A cancel means the browser took the gesture (a page scroll), and no
      // click follows it.
      suppressClick: isUp && state.moved,
    };
  }

  // One finger of a pinch lifted: the other carries on as a pan from here.
  return {
    state: {
      ids,
      points,
      origin: { viewport: context.viewport, points },
      moved: state.moved,
    },
    viewport: context.viewport,
    capture: false,
    suppressClick: false,
  };
}

/** Pan for one pointer; pan and zoom about the midpoint for two. */
function transformFromOrigin(
  state: GestureState,
  points: Readonly<Record<number, ViewportPoint>>,
  context: GestureContext,
): KerusiViewport {
  const origin = state.origin!;
  const limits = context.limits ?? zoomLimits();
  const [first, second] = state.ids;

  const from = [origin.points[first]];
  const to = [points[first]];
  if (second !== undefined) {
    from.push(origin.points[second]);
    to.push(points[second]);
  }

  const fromCentre = centroid(from);
  const toCentre = centroid(to);
  const base = origin.viewport;

  let zoom = base.zoom;
  if (from.length === 2) {
    const fromSpan = distance(from[0], from[1]);
    if (fromSpan > 0) {
      zoom = clampZoom(base.zoom * (distance(to[0], to[1]) / fromSpan), limits);
    }
  }

  // The map point that sat under the gesture's start stays under its midpoint.
  const ratio = zoom / base.zoom;
  return clampViewport(
    {
      zoom,
      x: toCentre.x - (fromCentre.x - base.x) * ratio,
      y: toCentre.y - (fromCentre.y - base.y) * ratio,
    },
    context.content,
    context.container,
    limits,
  );
}

function unchanged(state: GestureState, context: GestureContext): GestureResult {
  return { state, viewport: context.viewport, capture: false, suppressClick: false };
}

function distance(a: ViewportPoint, b: ViewportPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centroid(points: readonly ViewportPoint[]): ViewportPoint {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function clampZoom(zoom: number, limits: ViewportLimits): number {
  return Math.min(limits.maxZoom, Math.max(limits.minZoom, zoom));
}
