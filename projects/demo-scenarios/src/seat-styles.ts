import { buildRenderModel, KerusiMap, SeatBox, SeatStyleFn, SeatTypeStyles } from '@kerusiweb/core';

/** How far each of the blob's lobes reaches, as a fraction of the half-box; uneven on purpose. */
const BLOB_REACH = [0.98, 0.72, 0.92, 0.66, 0.96, 0.78, 0.88];

/**
 * The demos' "Custom seat shape" toggle: a lumpy blob, to show that a function
 * `shape` can draw anything. A smooth closed curve through points of uneven
 * reach around the box's centre. The core calls a function shape for the
 * seat's box and again for the selected core's smaller box, so every
 * coordinate comes from `box`.
 */
export function blobSeatShape(box: SeatBox): string {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const half = Math.min(box.width, box.height) / 2;
  const n = BLOB_REACH.length;
  const pts = BLOB_REACH.map((reach, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return { x: cx + half * reach * Math.cos(angle), y: cy + half * reach * Math.sin(angle) };
  });
  // Catmull-Rom through the points, as cubic Béziers.
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`;
  }
  return `${d} Z`;
}

/** Every seat as a blob, through `seatStyle`. */
export const blobSeats: SeatStyleFn = () => ({ shape: blobSeatShape });

/**
 * The demos' "Gold premium seats" toggle: `seatTypeStyles` for whichever seat
 * type costs most in the venue, so the same toggle means something in each of
 * the six documents. The legend follows, because it reads the same styles.
 */
export function premiumTypeStyles(map: KerusiMap): SeatTypeStyles {
  const [top] = buildRenderModel(map)
    .legend.filter((entry) => entry.price)
    .sort((a, b) => b.price!.amount - a.price!.amount);
  return top ? { [top.id]: { fill: '#d4a017', labelColor: '#000000' } } : {};
}
