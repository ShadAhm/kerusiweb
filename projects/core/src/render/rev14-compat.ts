import { Element, Section } from '../kerusi/kerusi-map.model.js';

/**
 * rev 14 bridge: removed in phase 2.
 *
 * Kerusi rev 15 replaced the three positioning modes with one canvas per map,
 * and the document model and validator in `kerusi/` follow it. The render code
 * in this folder is still built on the old modes until phase 2 of #32 rewrites
 * it, so the mode resolution it needs lives here, privately: nothing in this
 * file is exported from `render/index.ts` or the package.
 *
 * It reads the removed rev 14 members (`Section.layout`, `Section.aspectRatio`,
 * `Element.row`, `Element.col`) through the loose types below, and treats a
 * rev 15 seat's `x`/`y` exactly as rev 14 did.
 */

/** The three positioning modes a rev 14 section could use. */
export type SectionLayoutMode = 'grid' | 'freeform' | 'mixed';

/** A section as rev 14 shaped it. */
export interface Rev14Section extends Section {
  layout?: SectionLayoutMode;
  aspectRatio?: string;
}

/** An element as rev 14 shaped it: grid-addressed by `row`/`col`, or by `x`/`y`. */
export interface Rev14Element extends Omit<Element, 'x' | 'y'> {
  row?: string;
  col?: number;
  x?: number;
  y?: number;
}

export function rev14Section(section: Section): Rev14Section {
  return section as Rev14Section;
}

export function rev14Element(element: Element): Rev14Element {
  return element as Rev14Element;
}

interface Positioned {
  col?: number;
  x?: number;
  y?: number;
}

const hasCol = (item: Positioned) => item.col !== undefined && item.col !== null;

const hasXY = (item: Positioned) =>
  item.x !== undefined && item.x !== null && item.y !== undefined && item.y !== null;

const hasAnyCoordinate = (item: Positioned) =>
  (item.x !== undefined && item.x !== null) || (item.y !== undefined && item.y !== null);

/**
 * The mode a section renders in: its declared rev 14 `layout`, or the one its
 * seats imply, falling back to `grid` when they imply none.
 */
export function resolveSectionLayoutMode(section: Section): SectionLayoutMode {
  const declared = rev14Section(section).layout;
  if (declared) {
    return declared;
  }
  const seats: Positioned[] = section.seats ?? [];
  if (seats.every((s) => hasCol(s) && !hasAnyCoordinate(s))) {
    return 'grid';
  }
  if (seats.every((s) => hasXY(s) && !hasCol(s))) {
    return 'freeform';
  }
  return 'grid';
}
