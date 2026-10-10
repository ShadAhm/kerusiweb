import { describe, expect, it } from 'vitest';
import {
  GestureContext,
  GestureEvent,
  GestureResult,
  IDLE_GESTURE,
  reduceGesture,
  TAP_SLOP_PX,
} from './viewport-gesture.js';
import { DEFAULT_MAX_ZOOM, FIT_VIEWPORT, KerusiViewport } from './viewport.js';

const CONTENT = { width: 375, height: 600 };
const CONTAINER = { width: 375, height: 600 };

/** Feeds events through the reducer, threading state and viewport like a binding does. */
function run(events: GestureEvent[], start: KerusiViewport = FIT_VIEWPORT) {
  let state = IDLE_GESTURE;
  let viewport = start;
  const results: GestureResult[] = [];
  for (const event of events) {
    const context: GestureContext = { viewport, content: CONTENT, container: CONTAINER };
    const result = reduceGesture(state, event, context);
    state = result.state;
    viewport = result.viewport;
    results.push(result);
  }
  return { state, viewport, results, last: results[results.length - 1] };
}

const down = (id: number, x: number, y: number): GestureEvent => ({
  type: 'down',
  id,
  point: { x, y },
});
const move = (id: number, x: number, y: number): GestureEvent => ({
  type: 'move',
  id,
  point: { x, y },
});
const up = (id: number): GestureEvent => ({ type: 'up', id });
const cancel = (id: number): GestureEvent => ({ type: 'cancel', id });

const ZOOMED: KerusiViewport = { zoom: 3, x: -300, y: -300 };

describe('tap versus drag', () => {
  it('treats a touch that stays inside the slop as a tap: no change, no suppressed click', () => {
    const { viewport, results, last } = run(
      [down(1, 100, 100), move(1, 100 + TAP_SLOP_PX - 1, 100), up(1)],
      ZOOMED,
    );
    expect(viewport).toBe(ZOOMED);
    expect(results.some((r) => r.capture)).toBe(false);
    expect(last.suppressClick).toBe(false);
    expect(last.state).toBe(IDLE_GESTURE);
  });

  it('treats a touch beyond the slop as a drag that pans and swallows the click', () => {
    const { viewport, results, last } = run(
      [down(1, 100, 100), move(1, 130, 100), move(1, 150, 120), up(1)],
      ZOOMED,
    );
    expect(viewport.x).toBe(ZOOMED.x + 50);
    expect(viewport.y).toBe(ZOOMED.y + 20);
    expect(viewport.zoom).toBe(3);
    expect(last.suppressClick).toBe(true);
    // Capture is asked for once, on the move that crossed the slop.
    expect(results.filter((r) => r.capture)).toHaveLength(1);
    expect(results[1].capture).toBe(true);
  });

  it('measures slop from where the touch landed, not from the last move', () => {
    const { results } = run([
      down(1, 100, 100),
      move(1, 105, 100),
      move(1, 110, 100),
      move(1, 115, 100),
    ]);
    // 5px in: still a tap. 10px in, measured from the landing point: a drag.
    expect(results[1].capture).toBe(false);
    expect(results[2].capture).toBe(true);
  });

  it('holds a drag inside the map bounds', () => {
    const { viewport } = run([down(1, 100, 100), move(1, 9000, 9000), up(1)], ZOOMED);
    expect(viewport).toEqual({ zoom: 3, x: 0, y: 0 });
  });

  it('still reports a drag at fit, so the seat under the finger is not selected', () => {
    const { viewport, last } = run([down(1, 50, 50), move(1, 120, 50), up(1)]);
    expect(viewport).toEqual(FIT_VIEWPORT);
    expect(last.suppressClick).toBe(true);
  });

  it('does not suppress a click after a cancel: the browser took the gesture', () => {
    const { last } = run([down(1, 50, 50), move(1, 50, 120), cancel(1)]);
    expect(last.suppressClick).toBe(false);
    expect(last.state).toBe(IDLE_GESTURE);
  });

  it('ignores a pointer it never saw go down', () => {
    const { viewport, results } = run([move(7, 10, 10), up(7)], ZOOMED);
    expect(viewport).toBe(ZOOMED);
    expect(results.every((r) => !r.capture && !r.suppressClick)).toBe(true);
  });

  it('starts fresh after a gesture ends', () => {
    const { last } = run([down(1, 0, 0), move(1, 60, 0), up(1), down(2, 10, 10), up(2)]);
    expect(last.suppressClick).toBe(false);
  });
});

describe('pinch', () => {
  /** Two fingers 100px apart, centred on (187.5, 300). */
  const START = [down(1, 137.5, 300), down(2, 237.5, 300)];

  it('turns a second finger into a gesture at once', () => {
    const { results } = run(START);
    expect(results[0].capture).toBe(false);
    expect(results[1].capture).toBe(true);
  });

  it('zooms by the ratio of the finger spread', () => {
    const { viewport } = run([...START, move(1, 87.5, 300), move(2, 287.5, 300)]);
    expect(viewport.zoom).toBeCloseTo(2);
  });

  it('keeps the point between the fingers where it was', () => {
    const { viewport } = run([...START, move(1, 87.5, 300), move(2, 287.5, 300)]);
    const centre = { x: 187.5, y: 300 };
    const mapPoint = { x: (centre.x - 0) / 1, y: (centre.y - 0) / 1 };
    expect((centre.x - viewport.x) / viewport.zoom).toBeCloseTo(mapPoint.x);
    expect((centre.y - viewport.y) / viewport.zoom).toBeCloseTo(mapPoint.y);
  });

  it('pans when the fingers travel together', () => {
    const { viewport } = run([...START, move(1, 117.5, 280), move(2, 217.5, 280)], {
      zoom: 2,
      x: -150,
      y: -150,
    });
    expect(viewport.zoom).toBeCloseTo(2);
    expect(viewport.x).toBeCloseTo(-170);
    expect(viewport.y).toBeCloseTo(-170);
  });

  it('clamps at the ceiling however far the fingers spread', () => {
    const { viewport } = run([...START, move(1, -500, 300), move(2, 900, 300)]);
    expect(viewport.zoom).toBe(DEFAULT_MAX_ZOOM);
  });

  it('clamps at fit however far the fingers close', () => {
    const { viewport } = run([...START, move(1, 186.5, 300), move(2, 188.5, 300)], {
      zoom: 2,
      x: -100,
      y: -100,
    });
    expect(viewport).toEqual(FIT_VIEWPORT);
  });

  it('never taps: lifting both fingers still swallows the click', () => {
    const { last } = run([...START, up(2), up(1)]);
    expect(last.suppressClick).toBe(true);
  });

  it('carries on as a pan from the remaining finger, without a jump', () => {
    const { viewport, results } = run(
      [...START, move(1, 87.5, 300), move(2, 287.5, 300), up(2), move(1, 77.5, 300)],
      FIT_VIEWPORT,
    );
    const afterPinch = results[3].viewport;
    expect(results[4].viewport).toBe(afterPinch);
    expect(viewport.zoom).toBeCloseTo(afterPinch.zoom);
    expect(viewport.x).toBeCloseTo(afterPinch.x - 10);
  });

  it('reaches 3x from fit on a 375px map and each point stays reachable', () => {
    const { viewport } = run([...START, move(1, 37.5, 300), move(2, 337.5, 300)]);
    expect(viewport.zoom).toBeCloseTo(3);
    expect(viewport.x).toBeLessThanOrEqual(0);
    expect(viewport.x).toBeGreaterThanOrEqual(CONTAINER.width - CONTENT.width * 3);
  });
});
