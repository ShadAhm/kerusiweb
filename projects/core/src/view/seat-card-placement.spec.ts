import { describe, expect, it } from 'vitest';
import { placeSeatCard, type CardRect } from './seat-card-placement.js';

/** A 400 × 300 map root, with a 100 × 40 card and 20 × 20 seats. */
const container: CardRect = { x: 0, y: 0, width: 400, height: 300 };
const card = { width: 100, height: 40 };
const seatAt = (x: number, y: number, size = 20): CardRect => ({ x, y, width: size, height: size });

describe('placeSeatCard: each side', () => {
  const seat = seatAt(190, 140);

  it('puts the card above the seat by default, centred on it', () => {
    const p = placeSeatCard({ seat, card, container });
    expect(p.side).toBe('top');
    expect(p.x).toBe(150);
    expect(p.y).toBe(140 - 8 - 40);
  });

  it('puts it below', () => {
    const p = placeSeatCard({ seat, card, container, placement: 'bottom' });
    expect(p).toMatchObject({ side: 'bottom', x: 150, y: 168 });
  });

  it('puts it to the left, centred vertically', () => {
    const p = placeSeatCard({ seat, card, container, placement: 'left' });
    expect(p).toMatchObject({ side: 'left', x: 190 - 8 - 100, y: 150 - 20 });
  });

  it('puts it to the right', () => {
    const p = placeSeatCard({ seat, card, container, placement: 'right' });
    expect(p).toMatchObject({ side: 'right', x: 218, y: 130 });
  });

  it('keeps the gap it is told to', () => {
    const p = placeSeatCard({ seat, card, container, offset: 20 });
    expect(p.y).toBe(140 - 20 - 40);
  });

  it('points the arrow at the seat centre', () => {
    expect(placeSeatCard({ seat, card, container }).arrowOffset).toBe(50);
    expect(placeSeatCard({ seat, card, container, placement: 'left' }).arrowOffset).toBe(20);
  });
});

describe('placeSeatCard: flip', () => {
  it('flips to the bottom when the top has no room', () => {
    const p = placeSeatCard({ seat: seatAt(190, 20), card, container });
    expect(p.side).toBe('bottom');
    expect(p.y).toBe(48);
  });

  it('flips to the top when the bottom has no room', () => {
    const p = placeSeatCard({ seat: seatAt(190, 270), card, container, placement: 'bottom' });
    expect(p.side).toBe('top');
  });

  it('flips left to right at the left edge, and right to left at the right edge', () => {
    expect(placeSeatCard({ seat: seatAt(20, 140), card, container, placement: 'left' }).side).toBe(
      'right',
    );
    expect(
      placeSeatCard({ seat: seatAt(360, 140), card, container, placement: 'right' }).side,
    ).toBe('left');
  });

  it('does not flip when it fits exactly', () => {
    // Room above is 48: the card (40) plus the gap (8).
    expect(placeSeatCard({ seat: seatAt(190, 48), card, container }).side).toBe('top');
    expect(placeSeatCard({ seat: seatAt(190, 47), card, container }).side).toBe('bottom');
  });

  it('stays on the preferred side when neither side fits and it has more room', () => {
    const tall = { width: 100, height: 290 };
    const p = placeSeatCard({ seat: seatAt(190, 200), card: tall, container });
    expect(p.side).toBe('top');
    expect(p.y).toBe(0);
  });

  it('takes the roomier side when neither fits', () => {
    const tall = { width: 100, height: 290 };
    const p = placeSeatCard({ seat: seatAt(190, 20), card: tall, container });
    expect(p.side).toBe('bottom');
  });
});

describe('placeSeatCard: auto', () => {
  it('prefers the top, then the bottom, then the right, then the left', () => {
    expect(placeSeatCard({ seat: seatAt(190, 140), card, container, placement: 'auto' }).side).toBe(
      'top',
    );
    expect(placeSeatCard({ seat: seatAt(190, 20), card, container, placement: 'auto' }).side).toBe(
      'bottom',
    );
  });

  it('goes sideways when the card is too tall for either end', () => {
    const tall = { width: 100, height: 200 };
    const p = placeSeatCard({ seat: seatAt(100, 140), card: tall, container, placement: 'auto' });
    expect(p.side).toBe('right');
  });

  it('falls back to the side with the most room when nothing fits', () => {
    const huge = { width: 380, height: 280 };
    const p = placeSeatCard({ seat: seatAt(10, 140), card: huge, container, placement: 'auto' });
    expect(['top', 'bottom', 'right']).toContain(p.side);
  });
});

describe('placeSeatCard: clamp', () => {
  it('slides along the edge instead of leaving the container', () => {
    const left = placeSeatCard({ seat: seatAt(0, 140), card, container });
    expect(left.x).toBe(0);
    const right = placeSeatCard({ seat: seatAt(380, 140), card, container });
    expect(right.x).toBe(300);
  });

  it('keeps the arrow on the seat after the card slides', () => {
    const p = placeSeatCard({ seat: seatAt(0, 140), card, container });
    // The seat centre is at 10, 10px into a card that starts at 0; kept off the corner.
    expect(p.arrowOffset).toBe(12);
    const far = placeSeatCard({ seat: seatAt(380, 140), card, container });
    expect(far.arrowOffset).toBe(88);
  });

  it('clamps vertically for a side placement near the top and bottom', () => {
    expect(placeSeatCard({ seat: seatAt(190, 0), card, container, placement: 'right' }).y).toBe(0);
    expect(placeSeatCard({ seat: seatAt(190, 280), card, container, placement: 'right' }).y).toBe(
      260,
    );
  });

  it('handles each corner', () => {
    const corners: [number, number][] = [
      [0, 0],
      [380, 0],
      [0, 280],
      [380, 280],
    ];
    for (const [x, y] of corners) {
      const p = placeSeatCard({ seat: seatAt(x, y), card, container });
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + card.width).toBeLessThanOrEqual(400);
      expect(p.y + card.height).toBeLessThanOrEqual(300);
    }
  });

  it('pins a card larger than the container to its top-left', () => {
    const p = placeSeatCard({
      seat: seatAt(190, 140),
      card: { width: 500, height: 400 },
      container,
    });
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
  });

  it('works in a container that does not start at the origin', () => {
    const offset: CardRect = { x: 100, y: 50, width: 400, height: 300 };
    const p = placeSeatCard({ seat: seatAt(100, 50), card, container: offset });
    expect(p.x).toBe(100);
    expect(p.y).toBeGreaterThanOrEqual(50);
  });
});

describe('placeSeatCard: rotated and zoomed seats', () => {
  it('anchors to a rotated seat by its bounding box', () => {
    // A 20 × 20 seat turned 45° covers about 28.3 × 28.3 on screen.
    const diagonal = 20 * Math.SQRT2;
    const box = seatAt(200 - diagonal / 2, 150 - diagonal / 2, diagonal);
    const p = placeSeatCard({ seat: box, card, container });
    expect(p.side).toBe('top');
    expect(p.y).toBeCloseTo(box.y - 8 - 40);
    expect(p.x + card.width / 2).toBeCloseTo(200);
  });

  it('anchors to a zoomed-in seat, which is simply a larger box', () => {
    const big = seatAt(150, 100, 80);
    const p = placeSeatCard({ seat: big, card, container });
    expect(p.y).toBe(100 - 8 - 40);
    expect(p.x + card.width / 2).toBe(190);
  });
});
