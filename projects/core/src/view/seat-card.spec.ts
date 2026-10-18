import { describe, expect, it } from 'vitest';
import { buildRenderModel } from '../render/build-render-model.js';
import { KerusiMap } from '../kerusi/kerusi-map.model.js';
import {
  canHover,
  cssLengthToPx,
  DEFAULT_HOVER_CARD_DELAY,
  resolveHoverCardDelay,
  seatCardClassName,
  seatCardDataAttributes,
  seatCardId,
} from './seat-card.js';

const map: KerusiMap = {
  kerusi: '1.0',
  id: 'm',
  canvas: { width: 100, height: 100 },
  seatSize: 20,
  legend: [{ id: 'std', label: 'Standard' }],
  sections: [
    { id: 's1', label: 'One', index: 0, seats: [{ id: 'A1', x: 20, y: 20, type: 'std' }] },
  ],
};

describe('resolveHoverCardDelay', () => {
  it('defaults to 150 ms open and 100 ms close', () => {
    expect(resolveHoverCardDelay()).toEqual({ open: 150, close: 100 });
    expect(DEFAULT_HOVER_CARD_DELAY).toEqual({ open: 150, close: 100 });
  });

  it('fills in whichever half is missing', () => {
    expect(resolveHoverCardDelay({ open: 0 })).toEqual({ open: 0, close: 100 });
    expect(resolveHoverCardDelay({ close: 400 })).toEqual({ open: 150, close: 400 });
  });

  it('turns a negative or non-numeric delay into a usable one', () => {
    expect(resolveHoverCardDelay({ open: -5 })).toEqual({ open: 0, close: 100 });
    expect(resolveHoverCardDelay({ open: Number.NaN })).toEqual({ open: 150, close: 100 });
  });
});

describe('canHover', () => {
  it('is true for a mouse and a pen only', () => {
    expect(canHover('mouse')).toBe(true);
    expect(canHover('pen')).toBe(true);
    expect(canHover('touch')).toBe(false);
    expect(canHover('')).toBe(false);
    expect(canHover(undefined)).toBe(false);
  });
});

describe('seat card attributes', () => {
  it('derives an id per card kind from the prefix', () => {
    expect(seatCardId('kerusi-1', 'hover')).toBe('kerusi-1-seat-card-hover');
    expect(seatCardId('kerusi-1', 'click')).toBe('kerusi-1-seat-card-click');
  });

  it('mirrors the seat onto the card as data attributes', () => {
    const seat = buildRenderModel(map).seatsById.get('A1')!;
    expect(seatCardDataAttributes(seat)).toEqual({
      'data-seat-id': 'A1',
      'data-seat-status': 'available',
      'data-seat-type': 'std',
      'data-section-id': 's1',
    });
  });

  it('builds the class list: hooks first, then the consumer’s own', () => {
    expect(seatCardClassName('hover', 'default')).toBe('kerusi-seat-card kerusi-seat-card--hover');
    expect(seatCardClassName('click', 'default', 'mine other')).toBe(
      'kerusi-seat-card kerusi-seat-card--click mine other',
    );
    expect(seatCardClassName('click', 'none')).toBe(
      'kerusi-seat-card kerusi-seat-card--click kerusi-seat-card--bare',
    );
  });
});

describe('cssLengthToPx', () => {
  it('reads px, rem, em and bare numbers', () => {
    expect(cssLengthToPx('8px', 0)).toBe(8);
    expect(cssLengthToPx(' 12.5px ', 0)).toBe(12.5);
    expect(cssLengthToPx('6', 0)).toBe(6);
    expect(cssLengthToPx('0.5rem', 0)).toBe(8);
    expect(cssLengthToPx('0.5rem', 0, { root: 20 })).toBe(10);
    expect(cssLengthToPx('2em', 0, { root: 16, element: 10 })).toBe(20);
    expect(cssLengthToPx('0', 5)).toBe(0);
  });

  it('falls back for anything else', () => {
    expect(cssLengthToPx('', 8)).toBe(8);
    expect(cssLengthToPx(undefined, 8)).toBe(8);
    expect(cssLengthToPx(null, 8)).toBe(8);
    expect(cssLengthToPx('calc(1px + 2px)', 8)).toBe(8);
    expect(cssLengthToPx('50%', 8)).toBe(8);
  });
});
