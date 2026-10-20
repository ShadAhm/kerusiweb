import { groupFootprint } from '../render/group-shapes.js';
import { PlacedGroup } from '../render/map-layout.js';
import { cssVar, KerusiSeatmapColors } from './kerusi-seatmap-colors.js';

/**
 * A group's footprint, resolved: every path and paint a binding draws for one
 * piece of furniture (§4.11), so neither binding re-derives them.
 *
 * Painted by tokens (D18). From most to least specific, a piece takes
 * `--kerusi-group-{kind}-fill`, then `--kerusi-group-fill`, then the `colors`
 * prop, then the library default; the same goes for `-stroke` and `-detail`.
 * The library never sets a `--kerusi-group-*` property itself, so a stylesheet
 * always wins.
 */
export interface GroupGlyph {
  /**
   * `kerusi-group kerusi-group--{kind}`, for CSS to pick pieces out by kind. A
   * whole unit's control adds `kerusi-group--whole`, and `kerusi-group--selected`
   * or `kerusi-group--unavailable` (D19).
   */
  className: string;
  /** `data-group-id`. */
  id: string;
  /** `data-group-kind`. */
  kind: string;
  /** `rotate(…)` for a turned `rect`; `null` otherwise. */
  transform: string | null;
  /** The outline: the footprint the document gives. */
  body: { d: string; fill: string; stroke: string };
  /** Marks on the body: a cloth, a back, arms. Empty for a plain piece. */
  details: readonly { d: string; fill: string }[];
  /**
   * Set when the shape is the control that books the group whole (D19): an
   * `either` table or sofa on an interactive map. A binding then makes the
   * footprint a focusable button, and draws `body.d` once more as a
   * `kerusi-group__focus` outline for the focus ring, over the details.
   */
  whole?: {
    /** Every seat of the group is selected: the control is pressed. */
    selected: boolean;
    /** Every seat may be picked (§4.12.3); otherwise the control is `aria-disabled`. */
    available: boolean;
  };
}

/** Which of a group's three paints a token sets. */
export type GroupPaint = 'fill' | 'stroke' | 'detail';

/**
 * A group paint as a CSS value: the kind's own token, the shared token, then the
 * resolved palette colour.
 *
 * A `kind` the document made up may not be a safe custom-property name, so one
 * that is not letters, digits and hyphens skips the per-kind tier rather than
 * emit a malformed `var()`.
 */
export function groupPaint(
  kind: string,
  paint: GroupPaint,
  colors: Required<KerusiSeatmapColors>,
): string {
  const palette = {
    fill: colors.groupFill,
    stroke: colors.groupStroke,
    detail: colors.groupDetail,
  }[paint];
  const shared = `var(--kerusi-group-${paint}, ${palette})`;
  return /^[a-z0-9-]+$/i.test(kind)
    ? `var(--kerusi-group-${kind.toLowerCase()}-${paint}, ${shared})`
    : shared;
}

/** What a key does on a whole unit's control (D19). */
export type WholeUnitControlAction = 'toggle' | 'enter-seats' | 'clear';

/**
 * The key map of a whole unit's control, shared so both bindings answer the same
 * keys: Enter and Space book or release the unit, as they toggle a seat; an
 * arrow key moves into the group's first seat, so the arrow keys still reach
 * every seat; Escape clears the selection, as it does from a seat. `undefined`
 * leaves the key alone, and Tab moves on as from any other control.
 */
export function wholeUnitControlAction(key: string): WholeUnitControlAction | undefined {
  switch (key) {
    case 'Enter':
    case ' ':
      return 'toggle';
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown':
      return 'enter-seats';
    case 'Escape':
      return 'clear';
    default:
      return undefined;
  }
}

/**
 * Whether a placed group's shape is the control that books it whole (D19): the
 * group is offered whole (an `either` level no `whole` level contains, §4.12.2),
 * it has a shape to press, and selection is on.
 */
export function isWholeUnitControl(placed: PlacedGroup, interactive: boolean): boolean {
  return interactive && !!placed.shape && !!placed.group.wholeUnit;
}

/**
 * Resolves a placed group's footprint, or `undefined` for a group with no shape,
 * which draws nothing of its own (§4.11: such a group is its seats alone).
 *
 * Pass `control` when the shape is the group's whole-unit control (see
 * {@link isWholeUnitControl}) with the current selection: a pressed control's
 * outline takes the selected frame colour, so a table booked whole reads as
 * booked whole.
 */
export function resolveGroupGlyph(
  placed: PlacedGroup,
  colors: Required<KerusiSeatmapColors>,
  control?: { selection: ReadonlySet<string> },
): GroupGlyph | undefined {
  if (!placed.shape) {
    return undefined;
  }
  const { kind, id } = placed.group;
  const footprint = groupFootprint(kind, placed.shape);
  const detailFill = groupPaint(kind, 'detail', colors);
  const unit = control ? placed.group.wholeUnit : undefined;
  const whole = unit && {
    selected: unit.seatIds.length > 0 && unit.seatIds.every((s) => control!.selection.has(s)),
    available: unit.selectable,
  };
  return {
    className: [
      'kerusi-group',
      `kerusi-group--${kind}`,
      whole ? 'kerusi-group--whole' : '',
      whole?.selected ? 'kerusi-group--selected' : '',
      whole && !whole.available ? 'kerusi-group--unavailable' : '',
    ]
      .filter(Boolean)
      .join(' '),
    id,
    kind,
    transform: footprint.transform,
    body: {
      d: footprint.body,
      fill: groupPaint(kind, 'fill', colors),
      stroke: whole?.selected
        ? cssVar('selectedBg', colors.selectedBg)
        : groupPaint(kind, 'stroke', colors),
    },
    details: footprint.details.map((d) => ({ d, fill: detailFill })),
    whole,
  };
}
