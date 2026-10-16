import { Directive, inject, TemplateRef } from '@angular/core';
import { KerusiSeatContext } from '@kerusiweb/core';

/**
 * What a `kerusiSeat` template is handed for each seat (`let-seat`): the seat,
 * whether it is selected, the stock glyph core resolved for it, and the stock
 * drawing itself.
 */
export interface SeatTemplateContext extends KerusiSeatContext {
  /**
   * The library's own drawing of this seat. Render it to keep the stock seat,
   * or alongside your own marks to add to it:
   *
   * ```html
   * <ng-container *ngTemplateOutlet="seat.defaultContent; context: { $implicit: seat }" />
   * ```
   */
  defaultContent: TemplateRef<SeatTemplateOutletContext>;
}

/** The context object a seat template is stamped with. */
export interface SeatTemplateOutletContext {
  $implicit: SeatTemplateContext;
}

/**
 * Marks an `<ng-template>` inside `<kerusi-seatmap>` as the drawing for every
 * seat. The library keeps each seat's `<g>`, with its role, ARIA state, tab
 * stop, rotation and event handlers, and stamps this template inside it.
 *
 * The template is declared outside any `<svg>`, so Angular cannot tell its
 * elements are SVG: prefix each one with `svg:` (`<svg:path>`, `<svg:image>`),
 * or it is created as an unknown HTML element and draws nothing.
 *
 * ```html
 * <kerusi-seatmap [map]="map">
 *   <ng-template kerusiSeat let-seat>
 *     <ng-container *ngTemplateOutlet="seat.defaultContent; context: { $implicit: seat }" />
 *     <svg:circle [attr.cx]="seat.glyph.box.x" [attr.cy]="seat.glyph.box.y" r="3" />
 *   </ng-template>
 * </kerusi-seatmap>
 * ```
 */
@Directive({ selector: 'ng-template[kerusiSeat]' })
export class KerusiSeatTemplateDirective {
  readonly template = inject<TemplateRef<SeatTemplateOutletContext>>(TemplateRef);

  /** Types `let-seat` as a {@link SeatTemplateContext}. */
  static ngTemplateContextGuard(
    _dir: KerusiSeatTemplateDirective,
    ctx: unknown,
  ): ctx is SeatTemplateOutletContext {
    return true;
  }
}
