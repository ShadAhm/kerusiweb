import { Bounds, KerusiMap } from '../kerusi/kerusi-map.model.js';
import { buildRenderModel, BuildRenderModelOptions } from './build-render-model.js';
import { MapLayout, MapLayoutOptions } from './map-layout.js';
import { GLYPH_WIDTH } from './placement.js';
import { RenderSection } from './render-model.js';
import { computeViewLayout, KerusiSeatmapView } from './rows-layout.js';

/**
 * The box around everything a map draws, for a binding to frame instead of the
 * whole canvas (#63).
 *
 * A map whose seats fill only part of its canvas draws them small in a lot of
 * empty space. Under `fit: 'content'` a binding sets its `viewBox` to this box,
 * so fit, reset and full screen all frame what is drawn; nothing moves on the
 * canvas, and the box is the zoom's floor (D29).
 */

/**
 * What a binding's view fits: `canvas`, the whole canvas (§4.5), or `content`,
 * the box around what is drawn on it, plus a margin.
 */
export type KerusiSeatmapFit = 'canvas' | 'content';

/**
 * `rtl` says whether the layout was mirrored (D3), so a section label runs
 * leftward from its anchor: pass what the layout was computed with.
 */
export interface ContentBoundsOptions extends MapLayoutOptions {
  /**
   * The margin kept round the content, in canvas units. Defaults to the largest
   * seat size in the layout's sections.
   */
  padding?: number;
  /**
   * Whether drawn section labels count: `true` for each section's own label, or
   * a function giving the text drawn for a section (a binding's override).
   * Leave unset when labels are not shown.
   */
  sectionLabels?: boolean | ((section: RenderSection) => string | undefined);
}

/**
 * The box, in canvas units, around every seat footprint (turned as it is
 * drawn), element, group footprint, drawn section label and rows-view row label
 * in `layout`, grown by the padding and kept on the canvas. A layout that draws
 * nothing gives the whole canvas.
 */
export function contentBounds(layout: MapLayout, options: ContentBoundsOptions = {}): Bounds {
  const canvas: Bounds = { x: 0, y: 0, width: layout.width, height: layout.height };
  const box = new Extent();
  const labelOf = sectionLabelText(options.sectionLabels);

  for (const placed of layout.sections) {
    for (const seat of placed.seats) {
      box.addTurned(seat.centerX, seat.centerY, seat.width, seat.height, seat.rotation);
    }
    for (const element of placed.elements) {
      box.addTurned(
        element.centerX,
        element.centerY,
        element.width,
        element.height,
        element.rotation,
      );
    }
    for (const group of placed.groups) {
      const shape = group.shape;
      if (shape?.kind === 'circle') {
        box.addTurned(shape.centerX, shape.centerY, shape.radius * 2, shape.radius * 2, 0);
      } else if (shape) {
        box.addTurned(shape.centerX, shape.centerY, shape.width, shape.height, shape.rotation);
      }
    }
    const label = placed.drawsLabel ? labelOf(placed.section) : undefined;
    if (label) {
      // Drawn from the anchor with `text-anchor="start"`, so in RTL it runs leftward.
      const { x, y, fontSize } = placed.labelAnchor;
      const width = label.length * GLYPH_WIDTH * fontSize;
      box.add(options.rtl ? x - width : x, y, width, fontSize);
    }
    for (const row of placed.rowLabels) {
      const width = row.label.length * GLYPH_WIDTH * row.fontSize;
      box.add(row.x - width / 2, row.y - row.fontSize / 2, width, row.fontSize);
    }
  }

  if (box.empty) {
    return canvas;
  }
  const seatSizes = layout.sections.map((placed) => placed.section.seatSize);
  const padding = Math.max(0, finiteOr(options.padding, Math.max(0, ...seatSizes)));
  const x0 = Math.max(0, box.minX - padding);
  const y0 = Math.max(0, box.minY - padding);
  const x1 = Math.min(canvas.width, box.maxX + padding);
  const y1 = Math.min(canvas.height, box.maxY + padding);
  if (!(x1 > x0 && y1 > y0)) {
    return canvas;
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export interface MapContentBoundsOptions
  extends ContentBoundsOptions, Pick<BuildRenderModelOptions, 'locale' | 'sectionIds'> {
  /** The view the box is for. Defaults to `canonical`. */
  view?: KerusiSeatmapView;
}

/**
 * {@link contentBounds} straight from a document: the box a binding frames
 * under `fit: 'content'`, so a host can size its container to the content's
 * proportions before the map renders. `padding` defaults to the map's
 * `seatSize`, as a binding's `contentPadding` does.
 */
export function mapContentBounds(map: KerusiMap, options: MapContentBoundsOptions = {}): Bounds {
  const { view = 'canonical', locale, sectionIds, ...rest } = options;
  const render = buildRenderModel(map, undefined, { locale, sectionIds });
  return contentBounds(computeViewLayout(render, view, { rtl: rest.rtl }), {
    ...rest,
    padding: rest.padding ?? render.seatSize,
  });
}

// --- internals ------------------------------------------------------------

/** A running axis-aligned box. */
class Extent {
  minX = Number.POSITIVE_INFINITY;
  minY = Number.POSITIVE_INFINITY;
  maxX = Number.NEGATIVE_INFINITY;
  maxY = Number.NEGATIVE_INFINITY;

  get empty(): boolean {
    return !(this.maxX >= this.minX && this.maxY >= this.minY);
  }

  add(x: number, y: number, width: number, height: number): void {
    if (![x, y, width, height].every(Number.isFinite)) {
      return;
    }
    this.minX = Math.min(this.minX, x);
    this.minY = Math.min(this.minY, y);
    this.maxX = Math.max(this.maxX, x + width);
    this.maxY = Math.max(this.maxY, y + height);
  }

  /** A `width × height` rect centred on `cx`/`cy`, turned `degrees` clockwise. */
  addTurned(cx: number, cy: number, width: number, height: number, degrees: number): void {
    const theta = (finiteOr(degrees, 0) * Math.PI) / 180;
    const cos = Math.abs(Math.cos(theta));
    const sin = Math.abs(Math.sin(theta));
    const hw = (width / 2) * cos + (height / 2) * sin;
    const hh = (width / 2) * sin + (height / 2) * cos;
    this.add(cx - hw, cy - hh, hw * 2, hh * 2);
  }
}

function sectionLabelText(
  option: ContentBoundsOptions['sectionLabels'],
): (section: RenderSection) => string | undefined {
  if (typeof option === 'function') {
    return option;
  }
  return option ? (section) => section.label : () => undefined;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}
