import { groupFootprint } from '../render/group-shapes.js';
import { PlacedGroup } from '../render/map-layout.js';
import { KerusiSeatmapColors } from './kerusi-seatmap-colors.js';

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
  /** `kerusi-group kerusi-group--{kind}`, for CSS to pick pieces out by kind. */
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

/**
 * Resolves a placed group's footprint, or `undefined` for a group with no shape,
 * which draws nothing of its own (§4.11: such a group is its seats alone).
 */
export function resolveGroupGlyph(
  placed: PlacedGroup,
  colors: Required<KerusiSeatmapColors>,
): GroupGlyph | undefined {
  if (!placed.shape) {
    return undefined;
  }
  const { kind, id } = placed.group;
  const footprint = groupFootprint(kind, placed.shape);
  const detailFill = groupPaint(kind, 'detail', colors);
  return {
    className: `kerusi-group kerusi-group--${kind}`,
    id,
    kind,
    transform: footprint.transform,
    body: {
      d: footprint.body,
      fill: groupPaint(kind, 'fill', colors),
      stroke: groupPaint(kind, 'stroke', colors),
    },
    details: footprint.details.map((d) => ({ d, fill: detailFill })),
  };
}
