import { KerusiSession, KerusiState } from '@kerusiweb/core';
import { BANQUET_MAP } from './banquet.kerusi.fixture.js';

/**
 * A wedding in the banquet hall: the same `KerusiMap`, a different event.
 *
 * The map sells the hall by the seat. This session sells every table whole
 * instead (§4.12.1, §5.3): a guest books a table, not a chair, and pays the
 * table's whole price (§4.9.1). Nothing about the hall changed, so there is no
 * second copy of the map: overrides are by id, so the session lists each table.
 */
export const WEDDING_MAP = BANQUET_MAP;

const TABLE_IDS = (BANQUET_MAP.sections[0]!.groups ?? []).map((group) => group.id);

export const WEDDING_SESSION: KerusiSession = {
  kerusi: '1.0',
  id: 'banquet-hall-2026-12-12-wedding',
  mapId: BANQUET_MAP.id,
  label: 'Aisyah & Daniel — 12 Dec 2026',
  startsAt: '2026-12-12T19:30:00+08:00',
  bookingModes: {
    groups: Object.fromEntries(TABLE_IDS.map((id) => [id, 'whole'])),
  },
};

/**
 * Two tables already taken, and one with a single chair held: that whole table
 * cannot be booked until the hold lapses (§4.12.3).
 */
export const WEDDING_STATE: KerusiState = {
  kerusi: '1.0',
  sessionId: WEDDING_SESSION.id,
  updatedAt: '2026-11-02T10:00:00+08:00',
  seats: {
    ...Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`T1-${i + 1}`, { status: 'booked' as const }]),
    ),
    ...Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`H-${i + 1}`, { status: 'booked' as const }]),
    ),
    'T5-4': { status: 'held', holdExpires: '2026-11-02T10:08:00+08:00' },
  },
};
