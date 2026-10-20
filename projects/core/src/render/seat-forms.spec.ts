import { describe, expect, it } from 'vitest';
import {
  KerusiSeatFormShape,
  seatBodyPath,
  seatFormShape,
  seatMarkerAnchor,
  seatOccupantPath,
  seatShapePath,
} from './seat-shapes.js';

/** Every registered form but `chair`, which is the default `'seat'` outline. */
const FORMS: readonly KerusiSeatFormShape[] = [
  'armchair',
  'stool',
  'recliner',
  'beanbag',
  'cushion',
  'wheelchair-space',
  'sofa',
  'bench',
];

type Pt = readonly [number, number];

/**
 * The first subpath of a `d` string as a polygon: lines kept, arcs and
 * quadratics sampled. Handles the commands the seat shapes emit (`M L A Q Z`).
 * A form with a hole (`wheelchair-space`) has the hole as a second subpath,
 * which this leaves out, so a point test on the result asks "inside the rim".
 */
function outline(d: string): Pt[] {
  const t = d.trim().split(/\s+/);
  const out: Pt[] = [];
  let i = 0;
  let cur: Pt = [0, 0];
  const num = (k: number) => Number(t[i + k]);
  while (i < t.length) {
    const c = t[i];
    if (c === 'M' && out.length > 0) break;
    if (c === 'M' || c === 'L') {
      cur = [num(1), num(2)];
      out.push(cur);
      i += 3;
    } else if (c === 'Q') {
      const [cx, cy, ex, ey] = [num(1), num(2), num(3), num(4)];
      for (let s = 1; s <= 8; s++) {
        const u = s / 8;
        out.push([
          (1 - u) ** 2 * cur[0] + 2 * (1 - u) * u * cx + u * u * ex,
          (1 - u) ** 2 * cur[1] + 2 * (1 - u) * u * cy + u * u * ey,
        ]);
      }
      cur = [ex, ey];
      i += 5;
    } else if (c === 'A') {
      const [rx, large, sweep, ex, ey] = [num(1), num(4), num(5), num(6), num(7)];
      // Circular arcs only: every arc a seat shape draws has rx === ry.
      const [x0, y0] = cur;
      const mx = (x0 + ex) / 2;
      const my = (y0 + ey) / 2;
      const half = Math.hypot(ex - x0, ey - y0) / 2;
      const lift = Math.sqrt(Math.max(rx * rx - half * half, 0));
      const nx = -(ey - y0) / (2 * half);
      const ny = (ex - x0) / (2 * half);
      const sign = (large === 1) === (sweep === 1) ? -1 : 1;
      const cx = mx + sign * nx * lift;
      const cy = my + sign * ny * lift;
      const a0 = Math.atan2(y0 - cy, x0 - cx);
      let a1 = Math.atan2(ey - cy, ex - cx);
      if (sweep === 1 && a1 < a0) a1 += Math.PI * 2;
      if (sweep === 0 && a1 > a0) a1 -= Math.PI * 2;
      for (let s = 1; s <= 12; s++) {
        const a = a0 + ((a1 - a0) * s) / 12;
        out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * rx]);
      }
      cur = [ex, ey];
      i += 8;
    } else {
      i += 1;
    }
  }
  return out;
}

/** Even-odd point-in-polygon. */
function contains(poly: readonly Pt[], px: number, py: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const ring = (cx: number, cy: number, radius: number): Pt[] =>
  Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius] as const;
  });

describe('seatFormShape', () => {
  it('draws a chair, an absent form and an unknown form as the stock seat (D17)', () => {
    expect(seatFormShape('chair')).toBe('seat');
    expect(seatFormShape(undefined)).toBe('seat');
    expect(seatFormShape('hammock')).toBe('seat');
    // Not forms: an inherited name and one of the other presets must not slip through.
    expect(seatFormShape('toString')).toBe('seat');
    expect(seatFormShape('circle')).toBe('seat');
  });

  it('maps every other registered form to the preset of the same name', () => {
    for (const form of FORMS) expect(seatFormShape(form)).toBe(form);
  });
});

describe('form outlines', () => {
  for (const form of FORMS) {
    describe(form, () => {
      const d = seatShapePath(form, 0, 0, 100, 100);

      it('is a closed path that differs from the seat and from every other form', () => {
        expect(d).toMatch(/^M [\d. -]+/);
        expect(d.trim().endsWith('Z')).toBe(true);
        expect(d).not.toBe(seatBodyPath(0, 0, 100, 100));
        for (const other of FORMS.filter((f) => f !== form)) {
          expect(d, other).not.toBe(seatShapePath(other, 0, 0, 100, 100));
        }
      });

      it('stays inside the seat square (§4.7.1)', () => {
        for (const [px, py] of outline(d)) {
          expect(px).toBeGreaterThanOrEqual(-0.5);
          expect(px).toBeLessThanOrEqual(100.5);
          expect(py).toBeGreaterThanOrEqual(-0.5);
          expect(py).toBeLessThanOrEqual(100.5);
        }
      });

      it('is a scaled, translated copy on any square box, so the selected core nests', () => {
        const small = seatShapePath(form, 40, 20, 10, 10);
        const scaled = outline(d).map(([px, py]) => [40 + px / 10, 20 + py / 10] as Pt);
        const got = outline(small);
        expect(got).toHaveLength(scaled.length);
        got.forEach(([px, py], k) => {
          expect(px).toBeCloseTo(scaled[k]![0], 2);
          expect(py).toBeCloseTo(scaled[k]![1], 2);
        });
      });

      it('keeps the wheelchair marker’s dot on the outline', () => {
        const a = seatMarkerAnchor(form);
        const poly = outline(d);
        for (const [px, py] of ring(a.x * 100, a.y * 100, 13)) {
          expect(contains(poly, px, py), `${px.toFixed(1)},${py.toFixed(1)}`).toBe(true);
        }
      });

      if (form !== 'wheelchair-space') {
        it('holds a seated figure whole, so held, booked and selected still read', () => {
          const poly = outline(d);
          const nums = seatOccupantPath(0, 0, 100, 100)
            .match(/-?\d+(\.\d+)?/g)!
            .map(Number);
          // The head is the first subpath: `M x y a r r 0 1 1 dx 0 a ...`, then the torso.
          const [hx, hy, radius] = nums as [number, number, number];
          const points: Pt[] = ring(hx + radius, hy, radius);
          // Skip the head's own numbers (16 of them); the rest are the torso's coordinates.
          for (let k = 16; k + 1 < nums.length; k += 2) points.push([nums[k]!, nums[k + 1]!]);
          for (const [px, py] of points) {
            expect(contains(poly, px, py), `${px.toFixed(1)},${py.toFixed(1)}`).toBe(true);
          }
        });
      }
    });
  }

  it('leaves a wheelchair space open: a rim with the middle empty', () => {
    const d = seatShapePath('wheelchair-space', 0, 0, 100, 100);
    expect(d.match(/M /g)).toHaveLength(2);
    const hole = d.slice(d.lastIndexOf('M '));
    expect(contains(outline(hole), 50, 50)).toBe(true);
    expect(contains(outline(hole), 5, 5)).toBe(false);
    // The outer subpath is the whole square, hole or not.
    expect(contains(outline(d), 5, 5)).toBe(true);
  });

  it('faces up: an armchair’s arms and a recliner’s footrest are at the top edge', () => {
    // The dip between an armchair's arms is at the front; its back is solid.
    const armchair = outline(seatShapePath('armchair', 0, 0, 100, 100));
    expect(contains(armchair, 50, 3)).toBe(false);
    expect(contains(armchair, 50, 97)).toBe(true);
    // A recliner's footrest is narrower than its body, and it is at the front.
    const recliner = outline(seatShapePath('recliner', 0, 0, 100, 100));
    expect(contains(recliner, 10, 10)).toBe(false);
    expect(contains(recliner, 10, 60)).toBe(true);
  });
});
