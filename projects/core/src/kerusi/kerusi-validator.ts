import { BookingMode, Element, KerusiMap, RowMeta, Seat, Section } from './kerusi-map.model.js';
import { KerusiSession, KerusiState, KerusiStateDelta, SeatStatus } from './kerusi-state.model.js';
import { resolveSeatPrice } from './kerusi-price.js';
import {
  Footprint,
  discOverlapsFootprint,
  footprintOf,
  footprintsOverlap,
  rectOverlapsFootprint,
  seatSizeOf,
  turnedRectOf,
} from './kerusi-geometry.js';
import { error, errorsOf, KerusiViolation, warning } from './kerusi-violation.js';

export { errorsOf } from './kerusi-violation.js';
export type { KerusiViolation, ViolationSeverity } from './kerusi-violation.js';

/** The spec major version this library implements. */
const SUPPORTED_MAJOR = 1;

/** Valid `transferArmrest` values (§4.3.4). */
const TRANSFER_ARMREST = new Set(['left', 'right', 'both', 'fixed', 'none']);

/** Valid `booking` values on the map, a section or a group, and in a session (§4.12). */
const BOOKING_MODES: ReadonlySet<string> = new Set<BookingMode>(['seats', 'whole', 'either']);

/**
 * Thrown when a Kerusi document violates a MUST-level rule in the standard.
 * The message names the failing rule and the id that triggered it, so a
 * malformed document is diagnosable rather than surfacing as a generic parse
 * error (spec §4.6, §7).
 *
 * `violations` carries every finding from the same pass, not just the one that
 * was thrown — useful when reporting a document's problems all at once. Use the
 * non-throwing `checkKerusi*` functions when that is the primary goal.
 */
export class KerusiValidationError extends Error {
  constructor(
    message: string,
    /** Short slug of the violated rule, e.g. "seat-type-reference". */
    readonly rule: string,
    /** The id (seat, section, tier, ...) that triggered the failure, if any. */
    readonly id?: string,
    /** Every violation found in the same pass, in document order. */
    readonly violations: readonly KerusiViolation[] = [],
  ) {
    super(message);
    this.name = 'KerusiValidationError';
  }
}

// --- Non-throwing surface ---------------------------------------------------

/**
 * Collects every conformance violation in a {@link KerusiMap}, in document
 * order, without throwing. An empty array means the map is valid.
 *
 * Accepts `unknown` so it can be pointed at freshly parsed JSON: a value that
 * isn't a usable map yields a shape violation rather than a crash.
 */
export function checkKerusiMap(map: unknown): readonly KerusiViolation[] {
  return collectMapViolations(map as KerusiMap);
}

/** Collects every violation in a {@link KerusiState} without throwing. */
export function checkKerusiState(state: unknown): readonly KerusiViolation[] {
  const violations = collectStateEnvelope(state as KerusiState, 'KerusiState');
  const doc = state as KerusiState;
  if (doc && typeof doc === 'object' && (!doc.seats || typeof doc.seats !== 'object')) {
    violations.push(error('state-seats', 'KerusiState is missing the required "seats" object.'));
  } else if (doc && typeof doc === 'object') {
    violations.push(...collectSeatStatusViolations(doc.seats, 'seats'));
  }
  return violations;
}

/** Collects every violation in a {@link KerusiStateDelta} without throwing. */
export function checkKerusiStateDelta(delta: unknown): readonly KerusiViolation[] {
  const violations = collectStateEnvelope(delta as KerusiStateDelta, 'KerusiStateDelta');
  const doc = delta as KerusiStateDelta;
  if (doc && typeof doc === 'object' && (!doc.changes || typeof doc.changes !== 'object')) {
    violations.push(
      error('delta-changes', 'KerusiStateDelta is missing the required "changes" object.'),
    );
  } else if (doc && typeof doc === 'object') {
    violations.push(...collectSeatStatusViolations(doc.changes, 'changes'));
  }
  return violations;
}

/**
 * §5.1.1 applies to every timestamp in a document, `holdExpires` included: a
 * consumer that cannot parse it cannot show a correct hold countdown, which is
 * the one thing the field exists for.
 */
function collectSeatStatusViolations(
  seats: Record<string, SeatStatus> | undefined,
  member: 'seats' | 'changes',
): KerusiViolation[] {
  const violations: KerusiViolation[] = [];
  for (const [seatId, status] of Object.entries(seats ?? {})) {
    if (status?.holdExpires !== undefined && !isRfc3339(status.holdExpires)) {
      violations.push(
        error(
          'seat-status-hold-expires-format',
          `Seat "${seatId}" has "holdExpires": "${status.holdExpires}", which is not ` +
            'an RFC 3339 date-time (§5.1.1).',
          { id: seatId, path: `${member}.${seatId}` },
        ),
      );
    }
  }
  return violations;
}

/** Collects every violation in a {@link KerusiSession} without throwing (§5.3). */
export function checkKerusiSession(session: unknown): readonly KerusiViolation[] {
  const doc = session as KerusiSession;
  if (!doc || typeof doc !== 'object') {
    return [error('session-shape', 'KerusiSession is missing or not an object.')];
  }
  const violations: KerusiViolation[] = [];
  if (!doc.kerusi) {
    violations.push(
      error('session-version', 'KerusiSession is missing the required "kerusi" version member.'),
    );
  } else {
    violations.push(...checkVersion(doc.kerusi, 'KerusiSession', 'session'));
  }
  if (!doc.id) {
    violations.push(error('session-id', 'KerusiSession is missing the required "id" member.'));
  }
  if (!doc.mapId) {
    violations.push(
      error('session-mapid', 'KerusiSession is missing the required "mapId" member.', {
        id: doc.id,
      }),
    );
  }
  for (const member of ['startsAt', 'endsAt'] as const) {
    const value = doc[member];
    if (value !== undefined && !isRfc3339(value)) {
      violations.push(
        error(
          `session-${member.toLowerCase()}-format`,
          `KerusiSession "${member}" is "${value}", which is not an RFC 3339 ` +
            'date-time (§5.1.1).',
          { id: doc.id },
        ),
      );
    }
  }
  violations.push(...collectSessionBookingModeViolations(doc));
  return violations;
}

/**
 * §5.3: `bookingModes`, when present, is an object whose `map` is a booking
 * mode and whose `sections` and `groups` map ids to booking modes. A mode this
 * library does not know would leave the level's own mode in force, quietly
 * undoing what the event set out to sell, so it is rejected rather than ignored.
 */
function collectSessionBookingModeViolations(session: KerusiSession): KerusiViolation[] {
  const modes: unknown = session.bookingModes;
  if (modes === undefined) {
    return [];
  }
  const invalid = (path: string, value: unknown) =>
    error(
      'session-booking-mode-invalid',
      `KerusiSession "${session.id}" sets ${path} to ${JSON.stringify(value)}, which is not ` +
        'one of seats | whole | either (§4.12, §5.3).',
      { id: session.id, path },
    );
  if (!isObject(modes)) {
    return [invalid('bookingModes', modes)];
  }
  const violations: KerusiViolation[] = [];
  if (modes['map'] !== undefined && !BOOKING_MODES.has(modes['map'] as string)) {
    violations.push(invalid('bookingModes.map', modes['map']));
  }
  for (const key of ['sections', 'groups'] as const) {
    const byId = modes[key];
    if (byId === undefined) continue;
    if (!isObject(byId)) {
      violations.push(invalid(`bookingModes.${key}`, byId));
      continue;
    }
    for (const [id, mode] of Object.entries(byId)) {
      if (!BOOKING_MODES.has(mode as string)) {
        violations.push(invalid(`bookingModes.${key}.${id}`, mode));
      }
    }
  }
  return violations;
}

/**
 * §4.12.2: every key of a session's `bookingModes.sections` and
 * `bookingModes.groups` names a section or a group of its map. An override
 * that named nothing would change nothing, and an event's "every table sold
 * whole" would quietly not happen.
 */
function collectSessionOverrideViolations(
  session: KerusiSession,
  map: KerusiMap,
): KerusiViolation[] {
  const modes: unknown = session.bookingModes;
  if (!isObject(modes) || !Array.isArray(map.sections)) {
    return [];
  }
  const sections = map.sections.filter((section): section is Section => isObject(section));
  const known = {
    sections: new Set(sections.map((section) => section.id)),
    groups: new Set(
      sections.flatMap((section) =>
        (Array.isArray(section.groups) ? section.groups : []).map((group) => group?.id),
      ),
    ),
  };
  const violations: KerusiViolation[] = [];
  for (const [key, kind] of [
    ['sections', 'section'],
    ['groups', 'group'],
  ] as const) {
    const byId = modes[key];
    if (!isObject(byId)) continue;
    for (const id of Object.keys(byId)) {
      if (known[key].has(id)) continue;
      violations.push(
        error(
          'session-booking-mode-unresolved',
          `KerusiSession "${session.id}" sets the booking mode of ${kind} "${id}", which ` +
            `map "${map.id}" does not declare (§4.12.2).`,
          { id: session.id, path: `bookingModes.${key}.${id}` },
        ),
      );
    }
  }
  return violations;
}

/**
 * An RFC 3339 `date-time` (§5.1.1) — the profile `format: "date-time"` has
 * always meant in the published JSON Schemas.
 *
 * "ISO 8601", which the spec said before rev 13, admits forms a consumer cannot
 * reliably parse: seconds omitted, the basic format without separators, ordinal
 * and week dates, and local times carrying no offset at all. The regex fixes
 * the shape; the calendar check then rejects a date the shape allows but the
 * calendar does not, such as a 31st of February. `Date.parse` cannot stand in
 * for that — it rolls such a date silently into the next month.
 */
const RFC_3339 =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/;

function isRfc3339(value: string): boolean {
  const match = RFC_3339.exec(value);
  if (!match) {
    return false;
  }

  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = match
    .slice(1)
    .map((part) => Number(part ?? 0));

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return false;
  }
  // A second of 60 is a leap second, which RFC 3339 permits.
  if (hour > 23 || minute > 59 || second > 60) {
    return false;
  }
  return offsetHour <= 23 && offsetMinute <= 59;
}

function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/**
 * Validates a map together with the session and/or state that reference it,
 * checking the joins the individual validators cannot see (§5.1, §5.3): a
 * state's `mapId` must be the map's id, its `sessionId` the session's, and the
 * session's `mapId` the map's, and every section and group the session's
 * `bookingModes` names must be one of the map's (§4.12.2).
 */
export function validateDocumentSet(docs: {
  map: KerusiMap;
  state?: KerusiState;
  session?: KerusiSession;
}): readonly KerusiViolation[] {
  const { map, state, session } = docs;
  const violations: KerusiViolation[] = [...collectMapViolations(map)];

  if (session) {
    violations.push(...checkKerusiSession(session));
    if (map?.id && session.mapId && session.mapId !== map.id) {
      violations.push(
        error(
          'session-map-mismatch',
          `KerusiSession "${session.id}" references mapId "${session.mapId}", but the ` +
            `supplied map is "${map.id}" (§5.3).`,
          { id: session.id },
        ),
      );
    }
    if (map && typeof map === 'object') {
      violations.push(...collectSessionOverrideViolations(session, map));
    }
  }

  if (state) {
    violations.push(...checkKerusiState(state));
    if (state.mapId !== undefined && map?.id && state.mapId !== map.id) {
      violations.push(
        error(
          'state-map-mismatch',
          `KerusiState references mapId "${state.mapId}", but the supplied map is ` +
            `"${map.id}" (§5.1).`,
        ),
      );
    }
    if (state.sessionId !== undefined && session && state.sessionId !== session.id) {
      violations.push(
        error(
          'state-session-mismatch',
          `KerusiState references sessionId "${state.sessionId}", but the supplied ` +
            `session is "${session.id}" (§5.1).`,
        ),
      );
    }
  }

  return violations;
}

// --- Throwing surface (signatures unchanged from 0.x) -----------------------

/**
 * Validates a {@link KerusiMap} against the MUST-level rules of spec §4.
 * Throws {@link KerusiValidationError} on the first violation; returns the map
 * unchanged when valid, so it can be used inline.
 *
 * Enforced rules:
 *  - Required members present: `kerusi`, `id`, `canvas`, `seatSize`, `legend`,
 *    `sections` (§4), and `kerusi` declares a supported major version.
 *  - The canvas and every seat size are positive (§4.5).
 *  - Every seat and element has `x` and `y` on the canvas (§4.3.1, §4.4.1), and
 *    an element's `width`/`height`, when given, are positive.
 *  - A seat's `col` is a positive integer, only with a `row`, and no two seats
 *    in a section share a row and col (§4.3.5).
 *  - Section, seat, element, seat type and price tier ids are unique across the
 *    map, and row ids within their section (§4.3, §4.6).
 *  - Every `Seat.type` resolves to a `SeatType.id` in `legend` (§4.6).
 *  - Every `Seat.priceTier` resolves to a `PriceTier.id` (§4.6).
 *  - Every `Seat.row` resolves to a `RowMeta.id` when the section declares
 *    `rows`; opaque free-text otherwise (§4.6).
 *  - No seat carries `companions`, which rev 17 retired: a set of seats booked
 *    together is a group with `booking: "whole"` (§4.12.4).
 *  - Every `booking` on the map, a section or a group is `seats`, `whole` or
 *    `either` (§4.12), and every `wholePriceTier` resolves (§4.9.1).
 *  - Every row shape is exactly one well-formed line, arc or circle (§4.2.3).
 *  - Every group has an `id`, a `kind` and at least one seat; each seat it lists
 *    is a seat of its own section and in no other group, and listed once; its
 *    shape, when given, is exactly one well-formed `rect` or `circle` whose
 *    centre is on the canvas (§4.11).
 *  - Every `Element` has the required `id` and `kind` (§4.4).
 *  - All resolved currencies across the map, whole prices included, are
 *    identical (§4.9, §4.9.1).
 *
 * Members this library does not recognize are ignored (§7), including the
 * members rev 15 removed from sections and elements; a rev 14 map is still
 * rejected, for lacking `canvas` and `seatSize`.
 *
 * Advisory findings never throw: overlapping seats (§4.3.1), seats outside
 * their section's `bounds` (§4.1), a group shape over a seat outside the group
 * (§4.11), an unknown `transferArmrest`. Use
 * {@link checkKerusiMap} to see them.
 */
export function validateKerusiMap(map: KerusiMap): KerusiMap {
  throwFirstError(collectMapViolations(map));
  return map;
}

/**
 * Validates a {@link KerusiState} against the MUST-level rules of spec §5.1,
 * including the RFC 3339 timestamp profile of §5.1.1:
 * `kerusi` present and supported, `updatedAt` present, exactly one of
 * `sessionId`/`mapId`, and a `seats` object.
 */
export function validateKerusiState(state: KerusiState): KerusiState {
  throwFirstError(checkKerusiState(state));
  return state;
}

/**
 * Validates a {@link KerusiStateDelta} against the MUST-level rules of §5.2:
 * `kerusi` present and supported, `updatedAt` present, exactly one of
 * `sessionId`/`mapId`, and a `changes` object.
 */
export function validateKerusiStateDelta(delta: KerusiStateDelta): KerusiStateDelta {
  throwFirstError(checkKerusiStateDelta(delta));
  return delta;
}

/** Validates a {@link KerusiSession} against §5.3. */
export function validateKerusiSession(session: KerusiSession): KerusiSession {
  throwFirstError(checkKerusiSession(session));
  return session;
}

function throwFirstError(violations: readonly KerusiViolation[]): void {
  const errors = errorsOf(violations);
  if (errors.length > 0) {
    const first = errors[0];
    throw new KerusiValidationError(first.message, first.rule, first.id, violations);
  }
}

// --- Collectors -------------------------------------------------------------

/**
 * Walks a map and returns every violation in document order, errors first and
 * the §4.1/§4.3.1 warnings after them. The order matters: `validateKerusiMap`
 * throws the first error, so the same document must always report the same
 * rule first.
 */
function collectMapViolations(map: KerusiMap): KerusiViolation[] {
  if (!map || typeof map !== 'object') {
    return [error('map-shape', 'KerusiMap is missing or not an object.')];
  }

  const violations: KerusiViolation[] = [];

  if (!map.kerusi) {
    violations.push(
      error('map-version', 'KerusiMap is missing the required "kerusi" version member.'),
    );
  } else {
    violations.push(...checkVersion(map.kerusi, 'KerusiMap', 'map'));
  }
  if (!map.id) {
    violations.push(error('map-id', 'KerusiMap is missing the required "id" member.'));
  }
  violations.push(...collectCanvasViolations(map));
  if (!Array.isArray(map.legend)) {
    violations.push(
      error('map-legend', 'KerusiMap is missing the required "legend" array.', { id: map.id }),
    );
  }
  if (!Array.isArray(map.sections)) {
    violations.push(
      error('map-sections', 'KerusiMap is missing the required "sections" array.', { id: map.id }),
    );
  }

  // Without a legend and sections there is nothing further to walk, and
  // reporting a hundred downstream failures would bury the real problem.
  if (!Array.isArray(map.legend) || !Array.isArray(map.sections)) {
    return violations;
  }

  const ctx: MapContext = {
    map,
    canvas:
      isPositive(map.canvas?.width) && isPositive(map.canvas?.height) ? map.canvas : undefined,
    seatTypeIds: new Set(map.legend.map((t) => t.id)),
    priceTierIds: new Set((map.priceTiers ?? []).map((t) => t.id)),
    currencies: new Set<string>(),
  };

  // Tier-level currencies count toward the single-currency rule regardless of
  // whether a seat references the tier.
  for (const tier of map.priceTiers ?? []) {
    if (tier.price?.currency) {
      ctx.currencies.add(tier.price.currency);
    }
  }

  violations.push(...collectBookingViolations(map, `KerusiMap "${map.id}"`, map.id, ctx, ''));

  map.sections.forEach((section, sectionIndex) => {
    violations.push(...collectSectionViolations(section, ctx, `sections[${sectionIndex}]`));
  });

  // §4.6 identifier uniqueness. Seats, sections and elements are unique across
  // the whole map; rows only within their section, checked there.
  const sections = map.sections.filter((s): s is Section => isObject(s));
  violations.push(
    ...duplicateIds(
      sections,
      'section-id-duplicate',
      (id) => `Section id "${id}" is declared more than once (§4.1).`,
    ),
    ...duplicateIds(
      sections.flatMap((s) => (Array.isArray(s.seats) ? s.seats : [])),
      'seat-id-duplicate',
      (id) =>
        `Seat id "${id}" is declared more than once; seat ids must be globally unique ` +
        'within a KerusiMap (§4.3).',
    ),
    ...duplicateIds(
      sections.flatMap((s) => (Array.isArray(s.elements) ? s.elements : [])),
      'element-id-duplicate',
      (id) =>
        `Element id "${id}" is declared more than once; element ids must be unique ` +
        'across the whole KerusiMap (§4.6).',
    ),
    ...duplicateIds(
      sections.flatMap((s) => (Array.isArray(s.groups) ? s.groups : [])),
      'group-id-duplicate',
      (id) =>
        `Group id "${id}" is declared more than once; group ids must be unique across ` +
        'the whole KerusiMap (§4.6).',
    ),
    ...duplicateIds(
      map.legend,
      'seat-type-id-duplicate',
      (id) => `Seat type id "${id}" is declared more than once in the legend (§4.6).`,
    ),
    ...duplicateIds(
      map.priceTiers ?? [],
      'price-tier-id-duplicate',
      (id) => `Price tier id "${id}" is declared more than once (§4.6).`,
    ),
  );

  if (ctx.currencies.size > 1) {
    violations.push(
      error(
        'single-currency',
        `KerusiMap mixes currencies (${[...ctx.currencies].sort().join(', ')}); ` +
          'exactly one currency must apply to the whole map (§4.9).',
        { id: map.id },
      ),
    );
  }

  violations.push(
    ...collectSeatOverlapWarnings(map),
    ...collectSectionBoundsWarnings(map),
    ...collectGroupShapeWarnings(map),
  );

  return violations;
}

interface MapContext {
  map: KerusiMap;
  /** The canvas, when it is usable to check coordinates against. */
  canvas?: KerusiMap['canvas'];
  seatTypeIds: Set<string>;
  priceTierIds: Set<string>;
  currencies: Set<string>;
}

/** §4.5: the canvas and the map's seat size, both required and positive. */
function collectCanvasViolations(map: KerusiMap): KerusiViolation[] {
  const violations: KerusiViolation[] = [];
  const canvas: unknown = map.canvas;
  if (!isObject(canvas)) {
    violations.push(
      error('map-canvas', 'KerusiMap is missing the required "canvas" object (§4.5).', {
        id: map.id,
      }),
    );
  } else if (!isPositive(canvas['width']) || !isPositive(canvas['height'])) {
    violations.push(
      error(
        'map-canvas-size',
        `KerusiMap canvas is ${canvas['width']} × ${canvas['height']}; both dimensions ` +
          'must be positive numbers (§4.5).',
        { id: map.id, path: 'canvas' },
      ),
    );
  }
  if (!isPositive(map.seatSize)) {
    violations.push(
      error(
        'map-seat-size',
        map.seatSize === undefined
          ? 'KerusiMap is missing the required "seatSize" (§4.5).'
          : `KerusiMap "seatSize" is ${map.seatSize}; it must be a positive number (§4.5).`,
        { id: map.id, path: 'seatSize' },
      ),
    );
  }
  return violations;
}

function collectSectionViolations(
  section: Section,
  ctx: MapContext,
  path: string,
): KerusiViolation[] {
  if (!section || typeof section !== 'object') {
    return [error('section-shape', 'A section is missing or not an object.', { path })];
  }

  const violations: KerusiViolation[] = [];

  if (!section.id) {
    violations.push(error('section-id', 'A section is missing the required "id".', { path }));
  }
  violations.push(
    ...collectBookingViolations(section, `Section "${section.id}"`, section.id, ctx, path),
  );
  if (section.seatSize !== undefined && !isPositive(section.seatSize)) {
    violations.push(
      error(
        'section-seat-size',
        `Section "${section.id}" has "seatSize": ${section.seatSize}; it must be a ` +
          'positive number (§4.5).',
        { id: section.id, path: `${path}.seatSize` },
      ),
    );
  }
  if (!Array.isArray(section.seats)) {
    violations.push(
      error('section-seats', `Section "${section.id}" is missing the required "seats" array.`, {
        id: section.id,
        path,
      }),
    );
    return violations;
  }

  violations.push(...collectRowViolations(section, path));

  const rowIds = section.rows ? new Set(section.rows.map((r) => r.id)) : null;
  const seatIds = new Set(section.seats.map((s) => s.id));
  const seatAtRowCol = new Map<string, string>();

  section.seats.forEach((seat, seatIndex) => {
    const seatPath = `${path}.seats[${seatIndex}]`;

    // §4.3.1 position: required canvas coordinates, on the canvas.
    violations.push(...collectPositionViolations(seat, 'seat', ctx, seatPath));

    // §4.3.5 adjacency: `col` is a positive integer ordinal within `row`.
    if (seat.col !== undefined) {
      if (seat.row === undefined) {
        violations.push(
          error(
            'seat-col-without-row',
            `Seat "${seat.id}" has "col" but no "row"; a col is an ordinal within a row ` +
              'and means nothing without one (§4.3.5).',
            { id: seat.id, path: seatPath },
          ),
        );
      }
      if (!Number.isInteger(seat.col) || seat.col < 1) {
        violations.push(
          error(
            'seat-col-invalid',
            `Seat "${seat.id}" has "col": ${seat.col}; a col is a positive integer (§4.3.5).`,
            { id: seat.id, path: seatPath },
          ),
        );
      } else if (seat.row !== undefined) {
        const key = JSON.stringify([seat.row, seat.col]);
        const holder = seatAtRowCol.get(key);
        if (holder !== undefined) {
          violations.push(
            error(
              'seat-row-col-duplicate',
              `Seat "${seat.id}" is at row "${seat.row}", col ${seat.col}, which seat ` +
                `"${holder}" already holds in section "${section.id}" (§4.3.5).`,
              { id: seat.id, path: seatPath },
            ),
          );
        } else {
          seatAtRowCol.set(key, seat.id);
        }
      }
    }

    // §4.6 type reference.
    if (!ctx.seatTypeIds.has(seat.type)) {
      violations.push(
        error(
          'seat-type-reference',
          `Seat "${seat.id}" references unknown type "${seat.type}"; not found in ` +
            'the map legend (§4.6).',
          { id: seat.id, path: seatPath },
        ),
      );
    }

    // §4.6 priceTier reference.
    if (seat.priceTier !== undefined && !ctx.priceTierIds.has(seat.priceTier)) {
      violations.push(
        error(
          'seat-pricetier-reference',
          `Seat "${seat.id}" references unknown priceTier "${seat.priceTier}" (§4.6).`,
          { id: seat.id, path: seatPath },
        ),
      );
    }

    // §4.6 row reference — only when the section declares a rows array.
    if (rowIds && seat.row !== undefined && !rowIds.has(seat.row)) {
      violations.push(
        error(
          'seat-row-reference',
          `Seat "${seat.id}" references unknown row "${seat.row}"; not found in ` +
            `section "${section.id}" rows (§4.6).`,
          { id: seat.id, path: seatPath },
        ),
      );
    }

    // §4.3.4 accessibility. Advisory rather than fatal: §7 tells consumers to
    // ignore members they don't recognize instead of rejecting the document.
    const armrest = seat.accessibility?.transferArmrest;
    if (armrest !== undefined && !TRANSFER_ARMREST.has(armrest)) {
      violations.push(
        warning(
          'accessibility-transfer-armrest',
          `Seat "${seat.id}" has transferArmrest "${armrest}", which is not one of ` +
            'left | right | both | fixed | none (§4.3.4).',
          { id: seat.id, path: seatPath },
        ),
      );
    }

    // Collect the resolved currency for the single-currency rule (§4.9).
    const price = resolveSeatPrice(seat, ctx.map);
    if (price?.currency) {
      ctx.currencies.add(price.currency);
    }

    // §4.12.4: `companions` is retired and reserved. The rule that a consumer
    // ignores a member it does not recognise (§2) does not apply: ignored, a
    // pair sold together would quietly become two seats sold apart.
    if (isObject(seat) && 'companions' in seat) {
      violations.push(
        error(
          'companions-retired',
          `Seat "${seat.id}" carries "companions", which rev 17 retired; put the seats in ` +
            'one group with "booking": "whole" instead (§4.11, §4.12.4).',
          { id: seat.id, path: `${seatPath}.companions` },
        ),
      );
    }
  });

  // §4.4 elements.
  violations.push(...collectElementViolations(section, ctx, path));

  // §4.11 groups.
  violations.push(...collectGroupViolations(section, seatIds, ctx, path));

  return violations;
}

const GROUP_SHAPE_KINDS = ['rect', 'circle'] as const;

/**
 * A level's booking members, on the map, a section or a group: `booking` is a
 * booking mode (§4.12), `wholePriceTier` names a declared tier, and the whole
 * price's currency counts toward the map's one currency (§4.9.1). A whole price
 * on a level whose mode is `seats` is not invalid: another session may make the
 * level `either`.
 */
function collectBookingViolations(
  level: { booking?: unknown; wholePrice?: unknown; wholePriceTier?: unknown },
  what: string,
  id: string | undefined,
  ctx: MapContext,
  path: string,
): KerusiViolation[] {
  const at = (member: string) => (path ? `${path}.${member}` : member);
  const violations: KerusiViolation[] = [];
  if (level.booking !== undefined && !BOOKING_MODES.has(level.booking as string)) {
    violations.push(
      error(
        'booking-mode-invalid',
        `${what} has "booking": ${JSON.stringify(level.booking)}, which is not one of ` +
          'seats | whole | either (§4.12).',
        { id, path: at('booking') },
      ),
    );
  }
  if (level.wholePriceTier !== undefined && !ctx.priceTierIds.has(level.wholePriceTier as string)) {
    violations.push(
      error(
        'whole-price-tier-unresolved',
        `${what} has whole price tier "${level.wholePriceTier}", which the map does not ` +
          'declare (§4.6, §4.9.1).',
        { id, path: at('wholePriceTier') },
      ),
    );
  }
  const currency = isObject(level.wholePrice) ? level.wholePrice['currency'] : undefined;
  if (typeof currency === 'string' && currency) {
    ctx.currencies.add(currency);
  }
  return violations;
}

/**
 * §4.11: each group has an `id`, a `kind` and at least one seat. Every seat it
 * lists must be a seat of the group's own section, and in at most one group (a
 * seat listed a second time is reported at the later listing). A shape, when
 * given, is exactly one well-formed `rect` or `circle`, placed on the canvas by
 * its centre as an element is.
 */
function collectGroupViolations(
  section: Section,
  seatIds: ReadonlySet<string>,
  ctx: MapContext,
  path: string,
): KerusiViolation[] {
  if (section.groups === undefined) {
    return [];
  }
  if (!Array.isArray(section.groups)) {
    return [
      error(
        'section-groups',
        `Section "${section.id}" has "groups" that is not an array (§4.11).`,
        {
          id: section.id,
          path: `${path}.groups`,
        },
      ),
    ];
  }

  const violations: KerusiViolation[] = [];
  const owner = new Map<string, string>();

  section.groups.forEach((group, g) => {
    const groupPath = `${path}.groups[${g}]`;
    if (!isObject(group)) {
      violations.push(
        error('group-shape', 'A group is missing or not an object (§4.11).', { path: groupPath }),
      );
      return;
    }
    const id = typeof group.id === 'string' ? group.id : undefined;
    if (!id) {
      violations.push(
        error('group-id', `A group in section "${section.id}" is missing the required "id".`, {
          path: groupPath,
        }),
      );
    }
    if (typeof group.kind !== 'string' || group.kind === '') {
      violations.push(
        error('group-kind', `Group "${id}" is missing the required "kind" (§4.11).`, {
          id,
          path: groupPath,
        }),
      );
    }

    if (!Array.isArray(group.seats) || group.seats.length === 0) {
      violations.push(
        error('group-seats', `Group "${id}" lists no seats; a group holds at least one (§4.11).`, {
          id,
          path: `${groupPath}.seats`,
        }),
      );
    } else {
      group.seats.forEach((seatId, n) => {
        const seatPath = `${groupPath}.seats[${n}]`;
        if (!seatIds.has(seatId)) {
          violations.push(
            error(
              'group-seat-unresolved',
              `Group "${id}" lists seat "${seatId}", which is not a seat in section ` +
                `"${section.id}" (§4.6, §4.11).`,
              { id, path: seatPath },
            ),
          );
          return;
        }
        const first = owner.get(seatId);
        if (first !== undefined) {
          violations.push(
            error(
              'group-seat-shared',
              `Group "${id}" lists seat "${seatId}", which is already listed at ${first}; ` +
                'a seat belongs to at most one group (§4.6, §4.11).',
              { id, path: seatPath },
            ),
          );
          return;
        }
        owner.set(seatId, seatPath);
      });
    }

    if (group.shape !== undefined) {
      violations.push(...collectGroupShapeViolations(group.shape, id, ctx, `${groupPath}.shape`));
    }

    violations.push(...collectBookingViolations(group, `Group "${id}"`, id, ctx, groupPath));
  });

  return violations;
}

/**
 * §4.11: exactly one of `rect` (centre `x`/`y`, positive `width` and `height`,
 * optional `rotation`) or `circle` (a two-number `center` and a positive
 * `radius`), with its centre on the canvas.
 */
function collectGroupShapeViolations(
  shape: unknown,
  id: string | undefined,
  ctx: MapContext,
  path: string,
): KerusiViolation[] {
  const kinds = isObject(shape) ? GROUP_SHAPE_KINDS.filter((k) => k in shape) : [];
  if (!isObject(shape) || kinds.length !== 1) {
    return [
      error(
        'group-shape-kind',
        `Group "${id}" has a shape that is not exactly one of rect or circle (§4.11).`,
        { id, path },
      ),
    ];
  }

  let centre: { x: number; y: number; at: string } | undefined;
  if (kinds[0] === 'rect') {
    const rect = shape['rect'];
    if (
      !isObject(rect) ||
      ![rect['x'], rect['y']].every(isNum) ||
      !isPositive(rect['width']) ||
      !isPositive(rect['height']) ||
      (rect['rotation'] !== undefined && !isNum(rect['rotation']))
    ) {
      return [
        error(
          'group-shape-invalid',
          `Group "${id}" has a rect shape that needs a numeric x and y, a positive width ` +
            'and height, and a numeric rotation when it has one (§4.11).',
          { id, path: `${path}.rect` },
        ),
      ];
    }
    centre = { x: rect['x'] as number, y: rect['y'] as number, at: `${path}.rect` };
  } else {
    const circle = shape['circle'];
    if (!isObject(circle) || !isPoint(circle['center']) || !isPositive(circle['radius'])) {
      return [
        error(
          'group-shape-invalid',
          `Group "${id}" has a circle shape that needs a two-number center and a positive ` +
            'radius (§4.11).',
          { id, path: `${path}.circle` },
        ),
      ];
    }
    const [x, y] = circle['center'] as [number, number];
    centre = { x, y, at: `${path}.circle.center` };
  }

  if (!ctx.canvas) {
    return [];
  }
  const outside: string[] = [];
  if (centre.x < 0 || centre.x > ctx.canvas.width) {
    outside.push(`x ${centre.x} (0 to ${ctx.canvas.width})`);
  }
  if (centre.y < 0 || centre.y > ctx.canvas.height) {
    outside.push(`y ${centre.y} (0 to ${ctx.canvas.height})`);
  }
  return outside.length === 0
    ? []
    : [
        error(
          'group-shape-outside-canvas',
          `Group "${id}" has its shape's centre outside the canvas: ${outside.join(', ')} (§4.11).`,
          { id, path: centre.at },
        ),
      ];
}

/**
 * §4.3.1 and §4.4.1: a seat or element carries `x` and `y` in canvas units, on
 * the canvas — 0 to `canvas.width` and 0 to `canvas.height`, edges included.
 */
function collectPositionViolations(
  item: { id: string; x: number; y: number },
  kind: 'seat' | 'element',
  ctx: MapContext,
  path: string,
): KerusiViolation[] {
  const label = kind === 'seat' ? 'Seat' : 'Element';
  const section = kind === 'seat' ? '§4.3.1' : '§4.4.1';
  if (!isNum(item.x) || !isNum(item.y)) {
    return [
      error(
        `${kind}-position`,
        `${label} "${item.id}" is missing "x" or "y"; every ${kind} is placed on the ` +
          `canvas by its centre (${section}).`,
        { id: item.id, path },
      ),
    ];
  }
  if (!ctx.canvas) {
    return [];
  }
  const violations: KerusiViolation[] = [];
  for (const [axis, value, limit] of [
    ['x', item.x, ctx.canvas.width],
    ['y', item.y, ctx.canvas.height],
  ] as const) {
    if (value < 0 || value > limit) {
      violations.push(
        error(
          `${kind}-outside-canvas`,
          `${label} "${item.id}" has ${axis} ${value}, outside the canvas (0 to ${limit}, ` +
            `the canvas ${axis === 'x' ? 'width' : 'height'}) (${section}).`,
          { id: item.id, path: `${path}.${axis}` },
        ),
      );
    }
  }
  return violations;
}

/** §4.2: row ids unique within the section, and every row shape well formed. */
function collectRowViolations(section: Section, path: string): KerusiViolation[] {
  if (!Array.isArray(section.rows)) {
    return [];
  }
  const violations: KerusiViolation[] = duplicateIds(
    section.rows,
    'row-id-duplicate',
    (id) => `Row id "${id}" is declared more than once in section "${section.id}" (§4.6).`,
  );
  section.rows.forEach((row, i) => {
    if (row?.shape !== undefined) {
      violations.push(...collectRowShapeViolations(row, `${path}.rows[${i}].shape`));
    }
  });
  return violations;
}

const ROW_SHAPE_KINDS = ['line', 'arc', 'circle'] as const;

/**
 * §4.2.3: exactly one of `line`, `arc` or `circle`, with its points, a positive
 * radius, `arc.sweep`, and `cols` as two positive integers `[first, last]`
 * with first not exceeding last. Nothing here moves or reads a seat: a shape
 * is a guide for editors, and a renderer ignores it.
 */
function collectRowShapeViolations(row: RowMeta, path: string): KerusiViolation[] {
  const shape: unknown = row.shape;
  const kinds = isObject(shape) ? ROW_SHAPE_KINDS.filter((k) => k in shape) : [];
  if (!isObject(shape) || kinds.length !== 1) {
    return [
      error(
        'row-shape-kind',
        `Row "${row.id}" has a shape that is not exactly one of line, arc or circle ` +
          `(found ${kinds.length ? kinds.join(' and ') : 'none'}) (§4.2.3).`,
        { id: row.id, path },
      ),
    ];
  }

  const kind = kinds[0];
  const g: unknown = shape[kind];
  const problems: string[] = [];
  if (!isObject(g)) {
    problems.push(`"${kind}" is not an object`);
  } else {
    const points = kind === 'line' ? ['from', 'to'] : ['center'];
    for (const member of points) {
      if (!isPoint(g[member])) {
        problems.push(`"${member}" is not an [x, y] point`);
      }
    }
    if (kind !== 'line') {
      if (!isPositive(g['radius'])) {
        problems.push('"radius" is not a positive number');
      }
      if (!isNum(g['start'])) {
        problems.push('"start" is not a number');
      }
    }
    if (kind === 'arc' && !isNum(g['sweep'])) {
      problems.push('"sweep" is missing');
    }
    const cols = g['cols'];
    if (
      !Array.isArray(cols) ||
      cols.length !== 2 ||
      !cols.every((c) => Number.isInteger(c) && c >= 1)
    ) {
      problems.push('"cols" is not two positive integers');
    } else if (cols[0] > cols[1]) {
      return [
        error(
          'row-shape-cols-reversed',
          `Row "${row.id}" has a ${kind} shape spanning cols [${cols[0]}, ${cols[1]}]; ` +
            'the first column must not exceed the last (§4.2.3).',
          { id: row.id, path: `${path}.${kind}.cols` },
        ),
      ];
    }
  }

  if (problems.length === 0) {
    return [];
  }
  return [
    error(
      'row-shape-invalid',
      `Row "${row.id}" has a malformed ${kind} shape: ${problems.join('; ')} (§4.2.3).`,
      { id: row.id, path: `${path}.${kind}` },
    ),
  ];
}

function collectElementViolations(
  section: Section,
  ctx: MapContext,
  path: string,
): KerusiViolation[] {
  const violations: KerusiViolation[] = [];

  (section.elements ?? []).forEach((element: Element, i) => {
    const elementPath = `${path}.elements[${i}]`;

    if (!element.id) {
      violations.push(
        error('element-id', `An element in section "${section.id}" has no "id" (§4.4).`, {
          path: elementPath,
        }),
      );
    }
    if (!element.kind) {
      violations.push(
        error('element-kind', `Element "${element.id}" has no "kind" (§4.4).`, {
          id: element.id,
          path: elementPath,
        }),
      );
    }

    violations.push(...collectPositionViolations(element, 'element', ctx, elementPath));

    for (const axis of ['width', 'height'] as const) {
      const size = element[axis];
      if (size !== undefined && !isPositive(size)) {
        violations.push(
          error(
            'element-size-invalid',
            `Element "${element.id}" has "${axis}": ${size}; an element's size is a ` +
              'positive number of canvas units (§4.4.1).',
            { id: element.id, path: `${elementPath}.${axis}` },
          ),
        );
      }
    }
  });

  return violations;
}

/**
 * Every repeat of an id among `items`, reported at the repeat in the order the
 * items are given. Items without a usable id are skipped; a missing id is its
 * own rule.
 */
function duplicateIds(
  items: readonly { id?: string }[],
  rule: string,
  message: (id: string) => string,
): KerusiViolation[] {
  const seen = new Set<string>();
  const violations: KerusiViolation[] = [];
  for (const item of items) {
    const id = item?.id;
    if (id === undefined || id === null) {
      continue;
    }
    if (seen.has(id)) {
      violations.push(error(rule, message(id), { id }));
    }
    seen.add(id);
  }
  return violations;
}

// --- Warnings ---------------------------------------------------------------

/**
 * §4.3.1: a validator SHOULD report seats whose footprints overlap. Every
 * section shares the one canvas, so seats in different sections can overlap
 * too. Each overlapping pair is reported once, at whichever seat comes later
 * in the document.
 */
function collectSeatOverlapWarnings(map: KerusiMap): KerusiViolation[] {
  const placed: { seat: Seat; path: string; f: Footprint; order: number }[] = [];
  map.sections.forEach((section, s) => {
    const size = seatSizeOf(map, section);
    if (!isObject(section) || !Array.isArray(section.seats) || !isPositive(size)) {
      return;
    }
    section.seats.forEach((seat, i) => {
      if (isNum(seat?.x) && isNum(seat?.y)) {
        placed.push({
          seat,
          path: `sections[${s}].seats[${i}]`,
          f: footprintOf(seat, size),
          order: placed.length,
        });
      }
    });
  });

  // Sweep along x: two footprints can only overlap when their centres are
  // closer than the sum of their circumradii.
  const byX = [...placed].sort((a, b) => a.f.x - b.f.x);
  const reported: { order: number; violation: KerusiViolation }[] = [];
  for (let j = 0; j < byX.length; j++) {
    const q = byX[j];
    for (let k = j - 1; k >= 0; k--) {
      const p = byX[k];
      const reach = (p.f.size + q.f.size) * Math.SQRT1_2;
      if (q.f.x - p.f.x > reach) {
        break;
      }
      if (Math.abs(q.f.y - p.f.y) > reach || !footprintsOverlap(p.f, q.f)) {
        continue;
      }
      const [first, second] = p.order < q.order ? [p, q] : [q, p];
      reported.push({
        order: second.order,
        violation: warning(
          'seat-overlap',
          `Seat "${second.seat.id}" overlaps seat "${first.seat.id}" (${first.path}) (§4.3.1).`,
          { id: second.seat.id, path: second.path },
        ),
      });
    }
  }
  return reported.sort((a, b) => a.order - b.order).map((r) => r.violation);
}

/**
 * §4.11: a validator SHOULD report a group's shape that overlaps a seat outside
 * the group. A seat may overlap its own group's shape (a chair pulled up to a
 * table, a place on a sofa), and that is not reported. Every section shares the
 * one canvas, so a seat in another section can be under a shape too.
 */
function collectGroupShapeWarnings(map: KerusiMap): KerusiViolation[] {
  const seats: { id: string; f: Footprint }[] = [];
  for (const section of map.sections) {
    const size = seatSizeOf(map, section);
    if (!isObject(section) || !Array.isArray(section.seats) || !isPositive(size)) {
      continue;
    }
    for (const seat of section.seats) {
      if (isNum(seat?.x) && isNum(seat?.y)) {
        seats.push({ id: seat.id, f: footprintOf(seat, size) });
      }
    }
  }

  const violations: KerusiViolation[] = [];
  map.sections.forEach((section, s) => {
    if (!isObject(section) || !Array.isArray(section.groups)) {
      return;
    }
    section.groups.forEach((group, g) => {
      const shape: unknown = isObject(group) ? group.shape : undefined;
      if (!isObject(shape)) {
        return;
      }
      let overlaps: ((f: Footprint) => boolean) | undefined;
      const rect = isObject(shape['rect']) ? turnedRectOf(shape['rect']) : undefined;
      const circle = shape['circle'];
      if (rect) {
        overlaps = (f) => rectOverlapsFootprint(rect, f);
      } else if (isObject(circle) && isPoint(circle['center']) && isNum(circle['radius'])) {
        const [x, y] = circle['center'] as [number, number];
        const disc = { x, y, radius: circle['radius'] };
        overlaps = (f) => discOverlapsFootprint(disc, f);
      }
      if (!overlaps) {
        return;
      }
      const own = new Set(Array.isArray(group.seats) ? group.seats : []);
      for (const seat of seats) {
        if (own.has(seat.id) || !overlaps(seat.f)) {
          continue;
        }
        violations.push(
          warning(
            'group-shape-overlaps-seat',
            `The shape of group "${group.id}" overlaps seat "${seat.id}", which is not in the ` +
              'group (§4.11).',
            { id: group.id, path: `sections[${s}].groups[${g}].shape` },
          ),
        );
      }
    });
  });
  return violations;
}

/**
 * §4.1: a section's seats SHOULD lie inside its `bounds`. Only the seat's
 * centre is checked, as it is against the canvas.
 */
function collectSectionBoundsWarnings(map: KerusiMap): KerusiViolation[] {
  const violations: KerusiViolation[] = [];
  map.sections.forEach((section, s) => {
    const b = section?.bounds;
    if (
      !isObject(b) ||
      ![b.x, b.y, b.width, b.height].every(isNum) ||
      !Array.isArray(section.seats)
    ) {
      return;
    }
    section.seats.forEach((seat, i) => {
      if (!isNum(seat?.x) || !isNum(seat?.y)) {
        return;
      }
      if (seat.x >= b.x && seat.x <= b.x + b.width && seat.y >= b.y && seat.y <= b.y + b.height) {
        return;
      }
      violations.push(
        warning(
          'seat-outside-section-bounds',
          `Seat "${seat.id}" at (${seat.x}, ${seat.y}) lies outside the bounds of section ` +
            `"${section.id}" (${b.x}, ${b.y}, ${b.width} × ${b.height}) (§4.1).`,
          { id: seat.id, path: `sections[${s}].seats[${i}]` },
        ),
      );
    });
  });
  return violations;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositive(value: unknown): value is number {
  return isNum(value) && value > 0;
}

function isPoint(value: unknown): boolean {
  return Array.isArray(value) && value.length === 2 && value.every(isNum);
}

function collectStateEnvelope(
  doc: { kerusi?: string; sessionId?: string; mapId?: string; updatedAt?: string },
  typeName: 'KerusiState' | 'KerusiStateDelta',
): KerusiViolation[] {
  if (!doc || typeof doc !== 'object') {
    return [error('state-shape', `${typeName} is missing or not an object.`)];
  }

  const violations: KerusiViolation[] = [];
  const slug = typeName === 'KerusiState' ? 'state' : 'delta';

  if (!doc.kerusi) {
    violations.push(
      error('state-version', `${typeName} is missing the required "kerusi" version member.`),
    );
  } else {
    violations.push(...checkVersion(doc.kerusi, typeName, slug));
  }
  if (!doc.updatedAt) {
    violations.push(
      error('state-updatedat', `${typeName} is missing the required "updatedAt" timestamp.`),
    );
  } else if (!isRfc3339(doc.updatedAt)) {
    violations.push(
      error(
        'state-updatedat-format',
        `${typeName} "updatedAt" is "${doc.updatedAt}", which is not an RFC 3339 ` +
          'date-time (§5.1.1).',
      ),
    );
  }

  const hasSession = doc.sessionId !== undefined && doc.sessionId !== null;
  const hasMap = doc.mapId !== undefined && doc.mapId !== null;
  if (hasSession === hasMap) {
    violations.push(
      error(
        'state-scope',
        `${typeName} must specify exactly one of "sessionId" or "mapId" ` +
          `(found ${hasSession ? 'both' : 'neither'}) (§5.1).`,
      ),
    );
  }

  return violations;
}

/**
 * Checks a document's `kerusi` member declares a major version this library
 * understands. A future *minor* version is accepted — §7 requires consumers to
 * ignore members they don't recognize rather than reject the document — but a
 * different major is not.
 */
function checkVersion(version: string, typeName: string, slug: string): KerusiViolation[] {
  const major = Number.parseInt(String(version).split('.')[0], 10);
  if (Number.isNaN(major) || major !== SUPPORTED_MAJOR) {
    return [
      error(
        `${slug}-version-unsupported`,
        `${typeName} declares kerusi version "${version}"; this library implements ` +
          `${SUPPORTED_MAJOR}.x. A future minor version is accepted, a different major is not.`,
      ),
    ];
  }
  return [];
}
