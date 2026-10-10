import { describe, expect, it } from 'vitest';
import {
  clampViewport,
  DEFAULT_MAX_ZOOM,
  FIT_VIEWPORT,
  fitViewport,
  KEYBOARD_PAN_STEP,
  keyboardViewport,
  panViewportBy,
  revealRect,
  stepViewport,
  viewportsEqual,
  viewportTouchAction,
  viewportTransform,
  wheelZoomFactor,
  ZOOM_STEP,
  zoomLimits,
  zoomViewportBy,
  zoomViewportTo,
} from './viewport.js';

/** A phone: the map lays out exactly as wide and as tall as its container. */
const CONTENT = { width: 375, height: 600 };
const CONTAINER = { width: 375, height: 600 };
const LIMITS = zoomLimits();
const CENTRE = { x: 187.5, y: 300 };

describe('clampViewport', () => {
  it('holds zoom between fit and the ceiling', () => {
    expect(clampViewport({ zoom: 0.4, x: 0, y: 0 }, CONTENT, CONTAINER).zoom).toBe(1);
    expect(clampViewport({ zoom: 9, x: 0, y: 0 }, CONTENT, CONTAINER).zoom).toBe(DEFAULT_MAX_ZOOM);
    expect(clampViewport({ zoom: 9, x: 0, y: 0 }, CONTENT, CONTAINER, zoomLimits(6)).zoom).toBe(6);
  });

  it('never lets a ceiling below fit shut fit out', () => {
    expect(zoomLimits(0.5)).toEqual({ minZoom: 1, maxZoom: 1 });
    expect(zoomLimits(Number.NaN).maxZoom).toBe(DEFAULT_MAX_ZOOM);
  });

  it('keeps the scaled map covering the container', () => {
    const zoomed = clampViewport({ zoom: 2, x: 500, y: 500 }, CONTENT, CONTAINER);
    expect(zoomed).toEqual({ zoom: 2, x: 0, y: 0 });

    const far = clampViewport({ zoom: 2, x: -9999, y: -9999 }, CONTENT, CONTAINER);
    expect(far).toEqual({ zoom: 2, x: -375, y: -600 });
  });

  it('allows any pan inside the bounds', () => {
    expect(clampViewport({ zoom: 2, x: -100, y: -250 }, CONTENT, CONTAINER)).toEqual({
      zoom: 2,
      x: -100,
      y: -250,
    });
  });

  it('centres an axis where the scaled map is smaller than the container', () => {
    const maximized = { width: 800, height: 900 };
    expect(clampViewport(FIT_VIEWPORT, CONTENT, maximized)).toEqual({ zoom: 1, x: 212.5, y: 150 });
  });

  it('survives non-finite input', () => {
    expect(clampViewport({ zoom: NaN, x: NaN, y: Infinity }, CONTENT, CONTAINER)).toEqual(
      FIT_VIEWPORT,
    );
  });
});

describe('zoomViewportTo / zoomViewportBy', () => {
  it('keeps the map point under the anchor fixed', () => {
    const anchor = { x: 100, y: 200 };
    const start = { zoom: 1, x: 0, y: 0 };
    const next = zoomViewportTo(start, 3, anchor, CONTENT, CONTAINER);
    // The map point under the anchor, before and after.
    const before = { x: (anchor.x - start.x) / start.zoom, y: (anchor.y - start.y) / start.zoom };
    const after = { x: (anchor.x - next.x) / next.zoom, y: (anchor.y - next.y) / next.zoom };
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(next.zoom).toBe(3);
  });

  it('clamps at the ceiling and at fit', () => {
    const top = zoomViewportBy({ zoom: 3, x: 0, y: 0 }, 10, CENTRE, CONTENT, CONTAINER);
    expect(top.zoom).toBe(DEFAULT_MAX_ZOOM);

    const bottom = zoomViewportBy({ zoom: 2, x: -100, y: -100 }, 0.01, CENTRE, CONTENT, CONTAINER);
    expect(bottom).toEqual(FIT_VIEWPORT);
  });

  it('can reach 3x on a 375px phone and stay in bounds', () => {
    const next = zoomViewportTo(FIT_VIEWPORT, 3, { x: 370, y: 590 }, CONTENT, CONTAINER);
    expect(next.zoom).toBe(3);
    expect(next.x).toBeGreaterThanOrEqual(CONTAINER.width - CONTENT.width * 3);
    expect(next.x).toBeLessThanOrEqual(0);
    expect(next.y).toBeGreaterThanOrEqual(CONTAINER.height - CONTENT.height * 3);
  });
});

describe('stepViewport', () => {
  it('zooms by one step about the centre, and back', () => {
    const inward = stepViewport(FIT_VIEWPORT, 1, CONTENT, CONTAINER);
    expect(inward.zoom).toBeCloseTo(ZOOM_STEP);
    const outward = stepViewport(inward, -1, CONTENT, CONTAINER);
    expect(viewportsEqual(outward, FIT_VIEWPORT)).toBe(true);
  });

  it('stops at the ceiling', () => {
    let vp = FIT_VIEWPORT;
    for (let i = 0; i < 12; i++) {
      vp = stepViewport(vp, 1, CONTENT, CONTAINER);
    }
    expect(vp.zoom).toBe(DEFAULT_MAX_ZOOM);
  });
});

describe('panViewportBy', () => {
  it('moves within the bounds and stops at the edge', () => {
    const zoomed = { zoom: 2, x: -100, y: -100 };
    expect(panViewportBy(zoomed, -50, 25, CONTENT, CONTAINER)).toEqual({
      zoom: 2,
      x: -150,
      y: -75,
    });
    expect(panViewportBy(zoomed, -5000, 5000, CONTENT, CONTAINER)).toEqual({
      zoom: 2,
      x: -375,
      y: 0,
    });
  });

  it('does nothing at fit', () => {
    expect(panViewportBy(FIT_VIEWPORT, 80, 80, CONTENT, CONTAINER)).toEqual(FIT_VIEWPORT);
  });
});

describe('revealRect', () => {
  const zoomed = { zoom: 3, x: -400, y: -400 };

  it('leaves a rect that is already inside alone', () => {
    const rect = { x: 100, y: 100, width: 30, height: 30 };
    expect(revealRect(zoomed, rect, CONTENT, CONTAINER)).toEqual(zoomed);
  });

  it('pans a rect off the left and top edges back in, with a margin', () => {
    const rect = { x: -60, y: -20, width: 30, height: 30 };
    const next = revealRect(zoomed, rect, CONTENT, CONTAINER, 16);
    expect(next.x).toBe(zoomed.x + 76);
    expect(next.y).toBe(zoomed.y + 36);
  });

  it('pans a rect off the right and bottom edges back in', () => {
    const rect = { x: 360, y: 590, width: 30, height: 30 };
    const next = revealRect(zoomed, rect, CONTENT, CONTAINER, 16);
    expect(next.x).toBe(zoomed.x - (390 - (375 - 16)));
    expect(next.y).toBe(zoomed.y - (620 - (600 - 16)));
  });

  it('is still held inside the bounds', () => {
    const next = revealRect(
      { zoom: 2, x: 0, y: 0 },
      { x: -60, y: 0, width: 30, height: 30 },
      CONTENT,
      CONTAINER,
    );
    expect(next.x).toBe(0);
  });
});

describe('wheelZoomFactor', () => {
  const wheel = (over: Partial<Parameters<typeof wheelZoomFactor>[0]>) => ({
    deltaY: 0,
    deltaMode: 0,
    ctrlKey: false,
    metaKey: false,
    ...over,
  });

  it('is not a zoom gesture without Ctrl or Cmd', () => {
    expect(wheelZoomFactor(wheel({ deltaY: -100 }))).toBeNull();
  });

  it('zooms in on a negative delta and out on a positive one', () => {
    expect(wheelZoomFactor(wheel({ ctrlKey: true, deltaY: -10 }))!).toBeGreaterThan(1);
    expect(wheelZoomFactor(wheel({ metaKey: true, deltaY: 10 }))!).toBeLessThan(1);
  });

  it('caps one event so a mouse notch is a single step, not a leap', () => {
    const notch = wheelZoomFactor(wheel({ ctrlKey: true, deltaY: -100 }))!;
    const huge = wheelZoomFactor(wheel({ ctrlKey: true, deltaY: -10000 }))!;
    expect(huge).toBe(notch);
    expect(notch).toBeLessThan(2);
  });

  it('reads line and page deltas', () => {
    const pixels = wheelZoomFactor(wheel({ ctrlKey: true, deltaY: -16 }))!;
    const lines = wheelZoomFactor(wheel({ ctrlKey: true, deltaY: -1, deltaMode: 1 }))!;
    expect(lines).toBeCloseTo(pixels);
  });

  it('clamps at the ceiling and at fit when applied repeatedly', () => {
    const anchor = { x: 120, y: 200 };
    let vp = FIT_VIEWPORT;
    for (let i = 0; i < 40; i++) {
      vp = zoomViewportBy(
        vp,
        wheelZoomFactor(wheel({ ctrlKey: true, deltaY: -100 }))!,
        anchor,
        CONTENT,
        CONTAINER,
      );
    }
    expect(vp.zoom).toBe(DEFAULT_MAX_ZOOM);
    for (let i = 0; i < 40; i++) {
      vp = zoomViewportBy(
        vp,
        wheelZoomFactor(wheel({ ctrlKey: true, deltaY: 100 }))!,
        anchor,
        CONTENT,
        CONTAINER,
      );
    }
    expect(vp).toEqual(FIT_VIEWPORT);
  });
});

describe('keyboardViewport', () => {
  const zoomed = { zoom: 2, x: -200, y: -200 };

  it('zooms with + and =, and out with -', () => {
    expect(keyboardViewport(FIT_VIEWPORT, { key: '+' }, CONTENT, CONTAINER)!.zoom).toBeCloseTo(
      ZOOM_STEP,
    );
    expect(keyboardViewport(FIT_VIEWPORT, { key: '=' }, CONTENT, CONTAINER)!.zoom).toBeCloseTo(
      ZOOM_STEP,
    );
    expect(keyboardViewport(zoomed, { key: '-' }, CONTENT, CONTAINER)!.zoom).toBeCloseTo(
      2 / ZOOM_STEP,
    );
  });

  it('resets to fit with 0', () => {
    expect(keyboardViewport(zoomed, { key: '0' }, CONTENT, CONTAINER)).toEqual(FIT_VIEWPORT);
  });

  it('leaves the browser its own zoom shortcuts', () => {
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(keyboardViewport(zoomed, { key: '+', [mod]: true }, CONTENT, CONTAINER)).toBeNull();
      expect(keyboardViewport(zoomed, { key: '0', [mod]: true }, CONTENT, CONTAINER)).toBeNull();
    }
  });

  it('pans on arrows only when the viewport itself has focus', () => {
    expect(keyboardViewport(zoomed, { key: 'ArrowRight' }, CONTENT, CONTAINER)).toBeNull();

    const focused = { viewportFocused: true };
    const right = keyboardViewport(zoomed, { key: 'ArrowRight', ...focused }, CONTENT, CONTAINER)!;
    expect(right.x).toBe(zoomed.x - KEYBOARD_PAN_STEP);
    const left = keyboardViewport(zoomed, { key: 'ArrowLeft', ...focused }, CONTENT, CONTAINER)!;
    expect(left.x).toBe(zoomed.x + KEYBOARD_PAN_STEP);
    const down = keyboardViewport(zoomed, { key: 'ArrowDown', ...focused }, CONTENT, CONTAINER)!;
    expect(down.y).toBe(zoomed.y - KEYBOARD_PAN_STEP);
    const up = keyboardViewport(zoomed, { key: 'ArrowUp', ...focused }, CONTENT, CONTAINER)!;
    expect(up.y).toBe(zoomed.y + KEYBOARD_PAN_STEP);
  });

  it('ignores every other key', () => {
    expect(
      keyboardViewport(zoomed, { key: 'a', viewportFocused: true }, CONTENT, CONTAINER),
    ).toBeNull();
  });
});

describe('reset', () => {
  it('returns the original view, centred only where the map is smaller', () => {
    expect(fitViewport(CONTENT, CONTAINER, LIMITS)).toEqual(FIT_VIEWPORT);
    expect(fitViewport(CONTENT, { width: 800, height: 600 }, LIMITS)).toEqual({
      zoom: 1,
      x: 212.5,
      y: 0,
    });
  });
});

describe('viewportTransform', () => {
  it('writes a translate then a scale about the top-left', () => {
    expect(viewportTransform({ zoom: 2, x: -10.5, y: -20 })).toBe(
      'translate(-10.5px, -20px) scale(2)',
    );
  });

  it('trims float noise and negative zero', () => {
    expect(viewportTransform({ zoom: 1.0000001, x: -0.0001, y: 0.1 + 0.2 })).toBe(
      'translate(0px, 0.3px) scale(1)',
    );
  });
});

describe('viewportTouchAction', () => {
  it('leaves vertical page scrolling to the browser at fit', () => {
    expect(viewportTouchAction(FIT_VIEWPORT, false)).toBe('pan-y');
  });

  it('takes every gesture once zoomed in or maximized', () => {
    expect(viewportTouchAction({ zoom: 1.5, x: 0, y: 0 }, false)).toBe('none');
    expect(viewportTouchAction(FIT_VIEWPORT, true)).toBe('none');
  });
});

describe('viewportsEqual', () => {
  it('ignores sub-pixel noise but not a real change', () => {
    expect(viewportsEqual({ zoom: 2, x: -10, y: -10 }, { zoom: 2, x: -10.001, y: -10 })).toBe(true);
    expect(viewportsEqual({ zoom: 2, x: -10, y: -10 }, { zoom: 2, x: -11, y: -10 })).toBe(false);
  });
});
