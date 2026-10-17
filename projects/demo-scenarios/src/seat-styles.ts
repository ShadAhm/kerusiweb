import { buildRenderModel, KerusiMap, SeatTypeStyles } from '@kerusiweb/core';

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
