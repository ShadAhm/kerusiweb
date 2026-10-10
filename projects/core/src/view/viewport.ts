/**
 * The zoom-and-pan model behind a `zoomable` seat map.
 *
 * A viewport is a CSS transform applied to the whole map: `translate(x, y)
 * scale(zoom)` about the map's top-left corner. Everything here is arithmetic on
 * numbers the caller measured, so it holds no DOM and every function is pure.
 * The bindings own the measuring and the event listeners; this owns what a
 * wheel tick, a key press or a pinch *means*.
 *
 * Zoom 1 is "fit": the map exactly as it lays out without zooming. It is also
 * the minimum, so the map can never be shrunk below the container.
 */

/** Zoom and pan of the map, as a CSS transform about its top-left corner. */
export interface KerusiViewport {
  /** Scale relative to fit. 1 is fit-to-container. */
  zoom: number;
  /** Translation in CSS pixels, applied before the scale. */
  x: number;
  y: number;
}

export interface ViewportPoint {
  x: number;
  y: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ViewportRect extends ViewportPoint, ViewportSize {}

export interface ViewportLimits {
  minZoom: number;
  maxZoom: number;
}

/** The map exactly as laid out: no zoom, no pan. */
export const FIT_VIEWPORT: KerusiViewport = Object.freeze({ zoom: 1, x: 0, y: 0 });

/** Zoom is relative to fit, so the floor is always 1. */
export const MIN_ZOOM = 1;

/** The default ceiling: enough to make a seat on a 375px phone comfortably tappable. */
export const DEFAULT_MAX_ZOOM = 4;

/** What one press of a zoom button or the `+` / `-` key multiplies the zoom by. */
export const ZOOM_STEP = 1.5;

/** How far an arrow key pans, in CSS pixels. */
export const KEYBOARD_PAN_STEP = 48;

/** The gap kept between a revealed seat and the container's edge, in CSS pixels. */
export const REVEAL_MARGIN = 16;

/** Wheel zoom: the exponent per pixel of `deltaY`, so a pinch's small deltas stay smooth. */
export const WHEEL_ZOOM_SENSITIVITY = 0.01;

/** A single wheel event never moves further than this, so a mouse notch is one step. */
export const WHEEL_MAX_DELTA = 50;

/** The limits for a given ceiling. A ceiling below fit still leaves fit reachable. */
export function zoomLimits(maxZoom: number = DEFAULT_MAX_ZOOM): ViewportLimits {
  return { minZoom: MIN_ZOOM, maxZoom: Math.max(MIN_ZOOM, finiteOr(maxZoom, DEFAULT_MAX_ZOOM)) };
}

/**
 * Brings a viewport back inside its limits.
 *
 * Zoom is clamped to the limits. Pan is clamped so the scaled map never leaves
 * the container, and on an axis where the scaled map is *smaller* than the
 * container (a maximized map on a large screen) it is centred instead.
 */
export function clampViewport(
  viewport: KerusiViewport,
  content: ViewportSize,
  container: ViewportSize,
  limits: ViewportLimits = zoomLimits(),
): KerusiViewport {
  const zoom = clamp(finiteOr(viewport.zoom, 1), limits.minZoom, limits.maxZoom);
  return {
    zoom,
    x: clampAxis(finiteOr(viewport.x, 0), content.width * zoom, container.width),
    y: clampAxis(finiteOr(viewport.y, 0), content.height * zoom, container.height),
  };
}

/** Fit, centred where the map is smaller than its container. */
export function fitViewport(
  content: ViewportSize,
  container: ViewportSize,
  limits: ViewportLimits = zoomLimits(),
): KerusiViewport {
  return clampViewport(FIT_VIEWPORT, content, container, limits);
}

/**
 * Zooms to an absolute level, keeping the map point under `anchor` where it is.
 * `anchor` is in container coordinates — the pointer, the midpoint of a pinch,
 * or the container's centre for a button.
 */
export function zoomViewportTo(
  viewport: KerusiViewport,
  zoom: number,
  anchor: ViewportPoint,
  content: ViewportSize,
  container: ViewportSize,
  limits: ViewportLimits = zoomLimits(),
): KerusiViewport {
  const current = finiteOr(viewport.zoom, 1) || 1;
  const next = clamp(finiteOr(zoom, current), limits.minZoom, limits.maxZoom);
  const ratio = next / current;
  return clampViewport(
    {
      zoom: next,
      x: anchor.x - (anchor.x - viewport.x) * ratio,
      y: anchor.y - (anchor.y - viewport.y) * ratio,
    },
    content,
    container,
    limits,
  );
}

/** Zooms by a factor about `anchor`. See {@link zoomViewportTo}. */
export function zoomViewportBy(
  viewport: KerusiViewport,
  factor: number,
  anchor: ViewportPoint,
  content: ViewportSize,
  container: ViewportSize,
  limits: ViewportLimits = zoomLimits(),
): KerusiViewport {
  return zoomViewportTo(viewport, viewport.zoom * factor, anchor, content, container, limits);
}

/** One zoom-button step about the container's centre: `1` in, `-1` out. */
export function stepViewport(
  viewport: KerusiViewport,
  direction: 1 | -1,
  content: ViewportSize,
  container: ViewportSize,
  limits: ViewportLimits = zoomLimits(),
): KerusiViewport {
  const centre = { x: container.width / 2, y: container.height / 2 };
  const factor = direction === 1 ? ZOOM_STEP : 1 / ZOOM_STEP;
  return zoomViewportBy(viewport, factor, centre, content, container, limits);
}

/** Pans by a delta in CSS pixels, held inside the map's bounds. */
export function panViewportBy(
  viewport: KerusiViewport,
  dx: number,
  dy: number,
  content: ViewportSize,
  container: ViewportSize,
  limits: ViewportLimits = zoomLimits(),
): KerusiViewport {
  return clampViewport(
    { zoom: viewport.zoom, x: viewport.x + dx, y: viewport.y + dy },
    content,
    container,
    limits,
  );
}

/**
 * Pans just far enough to bring `rect` inside the container, with a margin.
 *
 * `rect` is where the thing is on screen *now*, in container coordinates — a
 * seat's bounding box minus the container's. Measuring the result of the
 * current transform, rather than computing a position from the layout, is what
 * keeps this correct whatever the section widths and unit scale are. A rect
 * bigger than the container is aligned by its leading edge.
 */
export function revealRect(
  viewport: KerusiViewport,
  rect: ViewportRect,
  content: ViewportSize,
  container: ViewportSize,
  margin: number = REVEAL_MARGIN,
  limits: ViewportLimits = zoomLimits(),
): KerusiViewport {
  const dx = revealAxis(rect.x, rect.width, container.width, margin);
  const dy = revealAxis(rect.y, rect.height, container.height, margin);
  return panViewportBy(viewport, dx, dy, content, container, limits);
}

/**
 * The zoom factor a wheel event asks for, or `null` if it is not a zoom
 * gesture.
 *
 * Only Ctrl/Cmd + wheel zooms. Browsers report a trackpad pinch as a wheel
 * event with `ctrlKey` set, so one rule covers both. A plain wheel returns
 * `null`, which is the cue for a binding to leave it alone so the page still
 * scrolls — and only a non-null result should be `preventDefault`ed.
 */
export function wheelZoomFactor(event: {
  deltaY: number;
  deltaMode?: number;
  ctrlKey: boolean;
  metaKey: boolean;
}): number | null {
  if (!event.ctrlKey && !event.metaKey) {
    return null;
  }
  // deltaMode: 0 pixels, 1 lines, 2 pages.
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
  const delta = clamp(finiteOr(event.deltaY, 0) * unit, -WHEEL_MAX_DELTA, WHEEL_MAX_DELTA);
  return Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY);
}

/** The keys {@link keyboardViewport} understands, for a binding's own filtering. */
export interface ViewportKeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /**
   * Whether the viewport itself, rather than a seat inside it, has focus.
   * Arrow keys pan only then: on a seat they keep moving seat focus.
   */
  viewportFocused?: boolean;
}

/**
 * What a key press does to the viewport, or `null` if it does nothing.
 *
 * `+` / `=` zoom in, `-` zoom out, `0` resets to fit, and — only when the
 * viewport itself has focus — the arrow keys pan. Ctrl, Cmd and Alt
 * combinations are the browser's own zoom shortcuts and are left alone.
 */
export function keyboardViewport(
  viewport: KerusiViewport,
  input: ViewportKeyInput,
  content: ViewportSize,
  container: ViewportSize,
  limits: ViewportLimits = zoomLimits(),
): KerusiViewport | null {
  if (input.ctrlKey || input.metaKey || input.altKey) {
    return null;
  }
  switch (input.key) {
    case '+':
    case '=':
      return stepViewport(viewport, 1, content, container, limits);
    case '-':
    case '_':
      return stepViewport(viewport, -1, content, container, limits);
    case '0':
      return fitViewport(content, container, limits);
  }
  if (!input.viewportFocused) {
    return null;
  }
  // The arrow names the direction the *view* moves, so the map moves the other way.
  switch (input.key) {
    case 'ArrowLeft':
      return panViewportBy(viewport, KEYBOARD_PAN_STEP, 0, content, container, limits);
    case 'ArrowRight':
      return panViewportBy(viewport, -KEYBOARD_PAN_STEP, 0, content, container, limits);
    case 'ArrowUp':
      return panViewportBy(viewport, 0, KEYBOARD_PAN_STEP, content, container, limits);
    case 'ArrowDown':
      return panViewportBy(viewport, 0, -KEYBOARD_PAN_STEP, content, container, limits);
    default:
      return null;
  }
}

/** Whether two viewports are the same view, ignoring sub-pixel noise. */
export function viewportsEqual(a: KerusiViewport, b: KerusiViewport): boolean {
  return (
    Math.abs(a.zoom - b.zoom) < 1e-4 && Math.abs(a.x - b.x) < 1e-2 && Math.abs(a.y - b.y) < 1e-2
  );
}

/** The CSS `transform` for a viewport. Apply with `transform-origin: 0 0`. */
export function viewportTransform(viewport: KerusiViewport): string {
  return `translate(${round(viewport.x)}px, ${round(viewport.y)}px) scale(${round(viewport.zoom)})`;
}

/**
 * The `touch-action` a zoomable map sets on its viewport.
 *
 * At fit there is nothing to pan, so a one-finger vertical swipe stays the
 * page's: `pan-y` leaves vertical scrolling to the browser while still handing
 * us pinch. Once zoomed in, one finger means pan, and a maximized map covers
 * the page, so both take every gesture with `none`.
 */
export function viewportTouchAction(viewport: KerusiViewport, maximized: boolean): string {
  return maximized || viewport.zoom > 1 + 1e-4 ? 'none' : 'pan-y';
}

// --- internals ------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Holds a translation so a scaled span covers the container, or centres it if smaller. */
function clampAxis(offset: number, scaled: number, container: number): number {
  if (scaled <= container) {
    return (container - scaled) / 2;
  }
  return clamp(offset, container - scaled, 0);
}

/** How far to shift a span of `size` at `start` to sit inside `[margin, container - margin]`. */
function revealAxis(start: number, size: number, container: number, margin: number): number {
  const edge = Math.min(Math.max(0, margin), container / 2);
  const low = edge;
  const high = container - edge;
  if (size >= high - low) {
    return low - start;
  }
  if (start < low) {
    return low - start;
  }
  if (start + size > high) {
    return high - (start + size);
  }
  return 0;
}

/** Trims float noise out of a CSS number, and `-0` out of a translation. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000 + 0;
}
