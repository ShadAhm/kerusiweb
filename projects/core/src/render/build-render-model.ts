import {
  Bounds,
  Canvas,
  Group,
  KerusiMap,
  RowMeta,
  Seat,
  Section,
} from '../kerusi/kerusi-map.model.js';
import { KerusiSession, KerusiState } from '../kerusi/kerusi-state.model.js';
import { BookingUnit, bookingLevels, bookingUnits } from '../kerusi/kerusi-booking.js';
import { areNeighbours, seatSizeOf } from '../kerusi/kerusi-geometry.js';
import { resolveLocalizedText, resolveMapLocale } from '../kerusi/kerusi-locale.js';
import { resolveSeatPrice, resolveTierPrice } from '../kerusi/kerusi-price.js';
import { orderRowMeta } from '../kerusi/kerusi-rows.js';
import {
  RenderBookingUnit,
  RenderDirection,
  RenderElement,
  RenderGroup,
  RenderGroupShape,
  RenderLegendEntry,
  RenderMap,
  RenderRow,
  RenderSeat,
  RenderSection,
  SeatRenderStatus,
  UnitMode,
} from './render-model.js';

/**
 * The seat size used when a document gives none at all. Only an invalid
 * document lacks `KerusiMap.seatSize`; this lets it draw something anyway.
 */
const FALLBACK_SEAT_SIZE = 28;

/** Which statuses a seat may be picked in, unless the caller says otherwise. */
export const DEFAULT_SELECTABLE_STATUSES: readonly SeatRenderStatus[] = ['available'];

export interface BuildRenderModelOptions {
  /** Overrides `KerusiMap.locale` for label resolution. */
  locale?: string;
  /** Render only these sections, in this order. Default: all, by `Section.index`. */
  sectionIds?: readonly string[];
  /** Statuses in which a seat may be picked. Default: `['available']`. */
  selectableStatuses?: readonly SeatRenderStatus[];
  /** A final say on whether a seat is selectable, applied after the status test. */
  seatSelectable?: (seat: RenderSeat) => boolean;
  /**
   * The event's `KerusiSession`, whose `bookingModes` override the map's own
   * (§4.12.1, §5.3). Without one, the map's own modes apply.
   */
  session?: KerusiSession;
  /**
   * How a tap selects (D22): `auto`, the default, takes the seat's booking unit
   * (§4.12.2); `seats` takes the seat alone.
   */
  unitMode?: UnitMode;
}

/**
 * Builds the renderer's view of a `KerusiMap` with its `KerusiState` merged in.
 *
 * Everything the standard makes a consumer resolve happens here, once:
 *  - sections ordered by `Section.index`, each with its seat size (§4.5) and
 *    its extent on the canvas resolved;
 *  - every row a section declares materialized, empty rows included, in the
 *    §4.2.1 order, with seats grouped into them by `Seat.row` and ordered by
 *    `col`, then `x`;
 *  - each element's missing `width`/`height` defaulted to the seat size
 *    (§4.4.1);
 *  - availability merged by `Seat.id`, honoring §5.1's sparse rule that an
 *    absent seat is available;
 *  - price resolved through the §4.9 precedence order;
 *  - booking modes resolved with the session's overrides (§4.12.1), and each
 *    seat given its booking unit (§4.12.2);
 *  - `Section.label` and `SeatType.label` localized against the map's locale.
 *
 * Positions are copied, never computed: every seat and element keeps the
 * document's `x`/`y` in canvas units (§4.5).
 *
 * It does NOT validate — call `validateKerusiMap` or `checkKerusiMap` first.
 * Given an invalid document it builds the best model it can rather than
 * throwing, so a caller in "collect" mode can render and report at once.
 */
export function buildRenderModel(
  map: KerusiMap,
  state?: KerusiState,
  options: BuildRenderModelOptions = {},
): RenderMap {
  const locale = resolveMapLocale(map, options.locale);
  const selectableStatuses = new Set(options.selectableStatuses ?? DEFAULT_SELECTABLE_STATUSES);
  const legendById = new Map((map.legend ?? []).map((t) => [t.id, t]));
  const seatsById = new Map<string, RenderSeat>();
  const typeCounts = new Map<string, number>();
  const currencies = new Set<string>();
  const seatSize = seatSizeOf(map) ?? FALLBACK_SEAT_SIZE;
  const canvas = resolveCanvas(map, seatSize);

  const sections = selectSections(map, options.sectionIds).map((section) =>
    buildSection(section, {
      map,
      canvas,
      seatSize,
      state,
      locale,
      selectableStatuses,
      seatSelectable: options.seatSelectable,
      legendById,
      seatsById,
      typeCounts,
      currencies,
    }),
  );

  const legend: RenderLegendEntry[] = (map.legend ?? []).map((type) => {
    const price = resolveTierPrice(map, type.defaultPriceTier);
    return {
      id: type.id,
      label: resolveLocalizedText(type.label, locale) ?? type.id,
      color: type.color,
      form: type.form,
      defaultTier: map.priceTiers?.find((t) => t.id === type.defaultPriceTier),
      price,
      seatCount: typeCounts.get(type.id) ?? 0,
    };
  });

  const unitMode = options.unitMode ?? 'auto';
  const booking = resolveBooking(map, options.session, {
    locale,
    unitMode,
    seatsById,
    state,
    selectableStatuses,
  });
  for (const section of sections) {
    (section as { booking: RenderSection['booking'] }).booking =
      booking.sectionModes.get(section.id) ?? 'seats';
    for (const group of section.groups) {
      const mutable = group as { booking: RenderGroup['booking']; wholeUnit?: RenderBookingUnit };
      mutable.booking = booking.groupModes.get(group.id) ?? 'seats';
      mutable.wholeUnit = booking.wholeGroups.get(group.id);
    }
  }

  return {
    id: map.id,
    name: map.name,
    locale,
    domain: map.domain,
    canvas,
    seatSize,
    sections,
    legend,
    // §4.9 forbids mixing currencies, so the first is the map's.
    currency: [...currencies][0],
    seatsById,
    booking: booking.mapMode,
    unitMode,
    units: booking.units,
    wholeUnits: booking.wholeUnits,
    source: map,
    session: options.session,
  };
}

/**
 * Resolves booking modes and units (§4.12) over the whole map, and hands each
 * drawn seat its booking unit. A unit's seats may lie in sections not drawn;
 * whether those may be picked is read from the state alone.
 */
function resolveBooking(
  map: KerusiMap,
  session: KerusiSession | undefined,
  ctx: {
    locale: string;
    unitMode: UnitMode;
    seatsById: ReadonlyMap<string, RenderSeat>;
    state?: KerusiState;
    selectableStatuses: ReadonlySet<SeatRenderStatus>;
  },
) {
  const levels = bookingLevels(map, session);
  const derived = bookingUnits(map, session);
  const kinds = new Map(
    (map.sections ?? []).flatMap((section) =>
      (Array.isArray(section?.groups) ? section.groups : []).map((g) => [g?.id, g?.kind] as const),
    ),
  );

  const pickable = (id: string) => {
    const seat = ctx.seatsById.get(id);
    if (seat) return seat.selectable;
    return ctx.selectableStatuses.has(ctx.state?.seats?.[id]?.status ?? 'available');
  };
  const resolve = (unit: BookingUnit): RenderBookingUnit => ({
    level: unit.level,
    id: unit.id,
    label: resolveLocalizedText(unit.label, ctx.locale),
    kind: unit.level === 'group' ? kinds.get(unit.id) : undefined,
    seatIds: unit.seats,
    wholePrice: unit.wholePrice,
    selectable: unit.seats.every(pickable),
  });

  const units =
    ctx.unitMode === 'seats'
      ? [...levels.seatLevels.keys()].map((id) => resolve({ level: 'seat', id, seats: [id] }))
      : derived.units.map(resolve);
  const wholeUnits = derived.wholeUnits.map(resolve);

  const unitOf = new Map(units.flatMap((unit) => unit.seatIds.map((id) => [id, unit] as const)));
  for (const seat of ctx.seatsById.values()) {
    const unit = unitOf.get(seat.id) ?? resolve({ level: 'seat', id: seat.id, seats: [seat.id] });
    seat.unit = unit;
    seat.unitBlocked = unit.seatIds.some((id) => id !== seat.id && !pickable(id));
  }

  return {
    mapMode: levels.map.mode,
    sectionModes: new Map(levels.sections.map((level) => [level.id, level.mode])),
    groupModes: new Map(levels.groups.map((level) => [level.id, level.mode])),
    wholeGroups: new Map(
      wholeUnits.filter((unit) => unit.level === 'group').map((unit) => [unit.id, unit]),
    ),
    units,
    wholeUnits,
  };
}

interface BuildContext {
  map: KerusiMap;
  /** The map's canvas, already resolved. */
  canvas: Canvas;
  /** The map-wide seat size, already defaulted. */
  seatSize: number;
  state?: KerusiState;
  locale: string;
  selectableStatuses: ReadonlySet<SeatRenderStatus>;
  seatSelectable?: (seat: RenderSeat) => boolean;
  legendById: Map<string, KerusiMap['legend'][number]>;
  seatsById: Map<string, RenderSeat>;
  typeCounts: Map<string, number>;
  currencies: Set<string>;
}

function buildSection(section: Section, ctx: BuildContext): RenderSection {
  const seatSize = seatSizeOf({ seatSize: ctx.seatSize }, section) ?? ctx.seatSize;
  const groups = buildGroups(section, ctx);
  const groupBySeat = new Map<string, RenderGroup>();
  for (const group of groups) {
    for (const id of group.seatIds) {
      // A seat is in at most one group (§4.11); an invalid document that lists
      // one twice keeps its first group.
      if (!groupBySeat.has(id)) {
        groupBySeat.set(id, group);
      }
    }
  }
  const rows = buildRows(section, seatSize, ctx, groupBySeat);
  const seats = rows.flatMap((r) => r.seats);
  const elements = buildElements(section, seatSize);
  const declared = isBounds(section.bounds) ? section.bounds : undefined;

  return {
    id: section.id,
    label: resolveLocalizedText(section.label, ctx.locale),
    seatSize,
    // A section with nothing in it and no declared bounds has no extent of its
    // own; the whole canvas is the least surprising thing to zoom to.
    bounds: declared ?? contentBounds(seats, elements, groups) ?? { x: 0, y: 0, ...ctx.canvas },
    boundsDeclared: declared !== undefined,
    rows,
    seats,
    elements,
    groups,
    // Set once the whole map's booking modes are resolved.
    booking: 'seats',
    directions: buildDirections(section, ctx.locale),
    source: section,
  };
}

/**
 * Localizes `Section.directions` (§4.10) and carries it through. Both ends of a
 * `Direction` may be a locale map, exactly as `Section.label` may be.
 *
 * Nothing downstream reads this — §4.10 forbids a renderer deciding layout or
 * screen placement from it. It exists so an application can print "front of
 * train" beside the axis the document says means that.
 */
function buildDirections(section: Section, locale: string): RenderDirection[] | undefined {
  if (!section.directions?.length) {
    return undefined;
  }
  return section.directions.map((direction) => ({
    axis: direction.axis,
    low: resolveLocalizedText(direction.low, locale) ?? '',
    high: resolveLocalizedText(direction.high, locale) ?? '',
  }));
}

/**
 * Materializes a section's rows and groups its flat seat list into them.
 *
 * `Section.rows` is not a container (§4.2) — seats never live inside a row — but
 * where it is present it *is* the section's complete row registry (§4.2.2), so
 * the rows come from it rather than from the seats that happen to reference
 * one. An **empty row**, a `RowMeta` no seat mentions, still takes its place in
 * the order. It reserves no space: where seats are drawn is up to their own
 * `x`/`y`.
 *
 * With no registry, a seat's `row` is opaque free text (§4.6) and the rows are
 * exactly those the seats name, in first-appearance order — a document that
 * declares no row metadata still renders in the order its author wrote it.
 */
function buildRows(
  section: Section,
  seatSize: number,
  ctx: BuildContext,
  groupBySeat: ReadonlyMap<string, RenderGroup>,
): RenderRow[] {
  const byRowKey = new Map<string, Seat[]>();
  const firstSeen = new Map<string, number>();

  (section.seats ?? []).forEach((seat, i) => {
    const key = seat.row ?? '';
    if (!byRowKey.has(key)) {
      byRowKey.set(key, []);
      firstSeen.set(key, i);
    }
    byRowKey.get(key)!.push(seat);
  });

  const registry = section.rows;
  const ordered: { key: string; meta?: RowMeta }[] = registry
    ? orderRowMeta(registry).map((meta) => ({ key: meta.id, meta }))
    : [...byRowKey.keys()]
        .sort((a, b) => firstSeen.get(a)! - firstSeen.get(b)!)
        .map((key) => ({ key }));

  if (registry) {
    // A seat naming a row the registry does not declare is a §4.6 violation the
    // validator reports. Render it anyway, after the declared rows — dropping
    // seats would hide the error rather than show it.
    const declared = new Set(registry.map((r: RowMeta) => r.id));
    for (const key of byRowKey.keys()) {
      if (!declared.has(key)) {
        ordered.push({ key });
      }
    }
  }

  return ordered.map(({ key, meta }, rowIndex) => {
    const seats = sortSeats(byRowKey.get(key) ?? []);
    const label = meta?.label ?? (key || undefined);
    const aisles = aisleSeats(seats);
    const row: RenderRow = {
      id: key,
      label,
      index: rowIndex,
      seats: seats.map((seat) =>
        buildSeat(
          seat,
          section,
          { rowIndex, rowLabel: label, seatSize },
          aisles.has(seat),
          groupBySeat.get(seat.id),
          ctx,
        ),
      ),
      empty: seats.length === 0,
    };
    return row;
  });
}

/**
 * Orders seats within a row: by `col`, the adjacency ordinal that says what
 * "the next seat" means (§4.3.5), then by `x`. Seats with no `col` follow the
 * ones that have one, ordered by `x` alone. Declaration order breaks any tie
 * left.
 */
function sortSeats(seats: readonly Seat[]): Seat[] {
  const colKey = (seat: Seat) => (isFiniteNumber(seat.col) ? seat.col : Number.POSITIVE_INFINITY);
  return [...seats]
    .map((seat, order) => ({ seat, order }))
    .sort((a, b) => {
      const left = colKey(a.seat);
      const right = colKey(b.seat);
      if (left !== right) {
        return left < right ? -1 : 1;
      }
      return coord(a.seat.x) - coord(b.seat.x) || a.order - b.order;
    })
    .map((entry) => entry.seat);
}

/**
 * The seats of one ordered row that sit beside an aisle: two seats next to
 * each other in the row's order that are not neighbours (§4.3.5), because the
 * `col` between them is skipped. Both sides of the gap are beside it. A row's
 * ends are not aisles, and a seat without a `col` says nothing about adjacency.
 */
function aisleSeats(seats: readonly Seat[]): Set<Seat> {
  const beside = new Set<Seat>();
  for (let i = 1; i < seats.length; i++) {
    const a = seats[i - 1];
    const b = seats[i];
    if (
      Number.isInteger(a.col) &&
      Number.isInteger(b.col) &&
      a.col !== b.col &&
      !areNeighbours(a, b)
    ) {
      beside.add(a);
      beside.add(b);
    }
  }
  return beside;
}

function buildSeat(
  seat: Seat,
  section: Section,
  row: { rowIndex: number; rowLabel?: string; seatSize: number },
  besideAisle: boolean,
  group: RenderGroup | undefined,
  ctx: BuildContext,
): RenderSeat {
  const type = ctx.legendById.get(seat.type) ?? { id: seat.type };
  const price = resolveSeatPrice(seat, ctx.map);
  if (price?.currency) {
    ctx.currencies.add(price.currency);
  }
  ctx.typeCounts.set(seat.type, (ctx.typeCounts.get(seat.type) ?? 0) + 1);

  // §5.1: a seat absent from the state document is available.
  const status = ctx.state?.seats?.[seat.id];

  const rendered: RenderSeat = {
    id: seat.id,
    sectionId: section.id,
    label: seat.label ?? seat.id,
    row: seat.row,
    rowLabel: row.rowLabel,
    rowIndex: row.rowIndex,
    col: seat.col,
    x: coord(seat.x),
    y: coord(seat.y),
    size: row.seatSize,
    rotation: seat.rotation,
    besideAisle,
    type,
    typeLabel: resolveLocalizedText(type.label, ctx.locale) ?? type.id,
    typeColor: type.color,
    attributes: seat.attributes ?? [],
    accessibility: seat.accessibility,
    price,
    // Set once the whole map's booking units are resolved.
    unit: { level: 'seat', id: seat.id, seatIds: [seat.id], selectable: false },
    status: status?.status ?? 'available',
    holdExpires: status?.holdExpires,
    selectable: false,
    unitBlocked: false,
    group,
    source: seat,
  };

  rendered.selectable =
    ctx.selectableStatuses.has(rendered.status) && (ctx.seatSelectable?.(rendered) ?? true);

  ctx.seatsById.set(rendered.id, rendered);
  return rendered;
}

/**
 * Carries elements through with their `id` intact — the pre-1.0 adapter dropped
 * it, leaving the render model with no element identity. A missing `width` or
 * `height` becomes the section's seat size (§4.4.1).
 */
function buildElements(section: Section, seatSize: number): RenderElement[] {
  return (section.elements ?? []).map((element) => ({
    id: element.id,
    kind: element.kind,
    label: element.label,
    x: coord(element.x),
    y: coord(element.y),
    width: positiveOr(element.width, seatSize),
    height: positiveOr(element.height, seatSize),
    rotation: element.rotation,
    source: element,
  }));
}

/**
 * Reads a section's groups (§4.11). A group lists seats of its own section by
 * id; one that does not resolve is dropped here (the validator reports it), so a
 * model built from an invalid document still holds only real seats. A shape that
 * is not one well-formed `rect` or `circle` is left out, not guessed at.
 */
function buildGroups(section: Section, ctx: BuildContext): RenderGroup[] {
  if (!Array.isArray(section.groups)) {
    return [];
  }
  const seatIds = new Set((section.seats ?? []).map((s) => s.id));
  return section.groups
    .filter((group): group is Group => !!group && typeof group === 'object')
    .map((group) => ({
      id: group.id,
      kind: group.kind,
      label: resolveLocalizedText(group.label, ctx.locale),
      sectionId: section.id,
      seatIds: (Array.isArray(group.seats) ? group.seats : []).filter((id) => seatIds.has(id)),
      shape: buildGroupShape(group),
      // Set once the whole map's booking modes are resolved.
      booking: 'seats' as const,
      source: group,
    }));
}

function buildGroupShape(group: Group): RenderGroupShape | undefined {
  const shape: unknown = group.shape;
  if (!shape || typeof shape !== 'object') {
    return undefined;
  }
  const { rect, circle } = shape as {
    rect?: Record<string, unknown>;
    circle?: Record<string, unknown>;
  };
  if (rect && !circle) {
    const { x, y, width, height, rotation } = rect;
    return isFiniteNumber(x) && isFiniteNumber(y) && isPositive(width) && isPositive(height)
      ? {
          kind: 'rect',
          x,
          y,
          width,
          height,
          rotation: isFiniteNumber(rotation) ? rotation : undefined,
        }
      : undefined;
  }
  if (circle && !rect) {
    const { center, radius } = circle;
    return Array.isArray(center) &&
      center.length === 2 &&
      center.every(isFiniteNumber) &&
      isPositive(radius)
      ? { kind: 'circle', x: center[0] as number, y: center[1] as number, radius }
      : undefined;
  }
  return undefined;
}

/**
 * The box around a section's seat, element and group footprints, each turned by
 * its rotation. `undefined` for a section with nothing in it.
 */
function contentBounds(
  seats: readonly RenderSeat[],
  elements: readonly RenderElement[],
  groups: readonly RenderGroup[],
): Bounds | undefined {
  const boxes = [
    ...seats.map((s) => rotatedBox(s.x, s.y, s.size, s.size, s.rotation)),
    ...elements.map((e) => rotatedBox(e.x, e.y, e.width, e.height, e.rotation)),
    ...groups.flatMap((g) =>
      !g.shape
        ? []
        : g.shape.kind === 'rect'
          ? [rotatedBox(g.shape.x, g.shape.y, g.shape.width, g.shape.height, g.shape.rotation)]
          : [
              {
                left: g.shape.x - g.shape.radius,
                top: g.shape.y - g.shape.radius,
                right: g.shape.x + g.shape.radius,
                bottom: g.shape.y + g.shape.radius,
              },
            ],
    ),
  ];
  if (boxes.length === 0) {
    return undefined;
  }
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.right));
  const bottom = Math.max(...boxes.map((b) => b.bottom));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The axis-aligned box around a `width` × `height` rectangle centred on `x`/`y` and turned. */
function rotatedBox(x: number, y: number, width: number, height: number, rotation?: number) {
  const theta = ((isFiniteNumber(rotation) ? rotation : 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(theta));
  const sin = Math.abs(Math.sin(theta));
  const halfWidth = (width * cos + height * sin) / 2;
  const halfHeight = (width * sin + height * cos) / 2;
  return { left: x - halfWidth, top: y - halfHeight, right: x + halfWidth, bottom: y + halfHeight };
}

/**
 * `KerusiMap.canvas`, or — for an invalid document missing it — the smallest
 * canvas from the origin that holds every seat, so it still draws.
 */
function resolveCanvas(map: KerusiMap, seatSize: number): Canvas {
  const canvas = map.canvas;
  if (canvas && isPositive(canvas.width) && isPositive(canvas.height)) {
    return { width: canvas.width, height: canvas.height };
  }
  const seats = (map.sections ?? []).flatMap((s) => s.seats ?? []);
  const extent = (axis: 'x' | 'y') =>
    Math.max(seatSize, ...seats.map((seat) => coord(seat[axis]) + seatSize / 2));
  return { width: extent('x'), height: extent('y') };
}

function isBounds(bounds: Bounds | undefined): bounds is Bounds {
  return (
    !!bounds &&
    isFiniteNumber(bounds.x) &&
    isFiniteNumber(bounds.y) &&
    isPositive(bounds.width) &&
    isPositive(bounds.height)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositive(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function positiveOr(value: number | undefined, fallback: number): number {
  return isPositive(value) ? value : fallback;
}

/**
 * A coordinate, or the canvas origin when an invalid document omits it. `x`
 * and `y` are required (§4.3.1, §4.4.1); this only keeps such a document
 * drawable while the validator reports it.
 */
function coord(value: number | undefined): number {
  return isFiniteNumber(value) ? value : 0;
}

/** Sections in `Section.index` order, optionally filtered to an explicit set. */
function selectSections(map: KerusiMap, sectionIds?: readonly string[]): Section[] {
  const all = map.sections ?? [];

  if (sectionIds) {
    // An explicit list is also an explicit order — honor it verbatim.
    return sectionIds
      .map((id) => all.find((s) => s.id === id))
      .filter((s): s is Section => s !== undefined);
  }

  return [...all]
    .map((section, order) => ({ section, order }))
    .sort((a, b) => orderKey(a.section.index, a.order) - orderKey(b.section.index, b.order))
    .map((entry) => entry.section);
}

/**
 * A sort key that keeps entries without an explicit `index` in declaration
 * order, and after every entry that has one.
 */
function orderKey(index: number | undefined, fallbackOrder: number): number {
  return index ?? Number.MAX_SAFE_INTEGER - 1_000_000 + fallbackOrder;
}
