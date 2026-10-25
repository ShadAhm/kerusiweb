import { Directive, inject, TemplateRef } from '@angular/core';
import { KerusiSeatCardContext, KerusiWholeUnitCardContext } from '@kerusiweb/core';

/** The context object a seat card template is stamped with. */
export interface SeatCardOutletContext {
  $implicit: KerusiSeatCardContext;
}

/** The context object a whole unit's card template is stamped with (D25). */
export interface WholeUnitCardOutletContext {
  $implicit: KerusiWholeUnitCardContext;
}

/**
 * Marks an `<ng-template>` inside `<kerusi-seatmap>` as the card shown while a
 * seat is hovered (D10). The library positions it, dismisses it and names it for
 * assistive technology; what it says, and how it looks, is yours (D11).
 *
 * Render nothing for a seat (an `@if` that is false, say) and no card shows for
 * that seat. Never shown for touch. A hover card is pointer-only unless
 * `[hoverCardOnFocus]` is set, so it must not be the only place important
 * information lives.
 *
 * The content belongs to the component that declares the template, so that
 * component's own encapsulated styles apply to it.
 *
 * ```html
 * <kerusi-seatmap [map]="map" [state]="state" [interactive]="false">
 *   <ng-template kerusiSeatHoverCard let-ctx>
 *     @if (ctx.seat.status === 'booked') { {{ bookings[ctx.seat.id]?.name }} }
 *   </ng-template>
 * </kerusi-seatmap>
 * ```
 */
@Directive({ selector: 'ng-template[kerusiSeatHoverCard]' })
export class KerusiSeatHoverCardDirective {
  readonly template = inject<TemplateRef<SeatCardOutletContext>>(TemplateRef);

  /** Types `let-ctx` as a {@link KerusiSeatCardContext}. */
  static ngTemplateContextGuard(
    _dir: KerusiSeatHoverCardDirective,
    ctx: unknown,
  ): ctx is SeatCardOutletContext {
    return true;
  }
}

/**
 * Marks an `<ng-template>` inside `<kerusi-seatmap>` as the card opened by a
 * click, a tap, or Enter/Space on a seat (D10). It stays open until `Escape`, a
 * press outside, a second click on the same seat, `ctx.close()`, or another
 * seat's click card opening.
 *
 * A click on a selectable seat still toggles it. To show details without
 * selecting, turn selection off with `[interactive]="false"`,
 * `[selectableStatuses]="[]"` or `[seatSelectable]` (D13).
 *
 * ```html
 * <ng-template kerusiSeatClickCard let-ctx>
 *   <app-booking-detail [id]="ctx.seat.id" (done)="ctx.close()" />
 * </ng-template>
 * ```
 */
@Directive({ selector: 'ng-template[kerusiSeatClickCard]' })
export class KerusiSeatClickCardDirective {
  readonly template = inject<TemplateRef<SeatCardOutletContext>>(TemplateRef);

  /** Types `let-ctx` as a {@link KerusiSeatCardContext}. */
  static ngTemplateContextGuard(
    _dir: KerusiSeatClickCardDirective,
    ctx: unknown,
  ): ctx is SeatCardOutletContext {
    return true;
  }
}

/**
 * Marks an `<ng-template>` inside `<kerusi-seatmap>` as the card shown while a
 * whole unit's control is hovered, or focused with `[hoverCardOnFocus]` (D25):
 * the shape that books an `either` table, sofa or pew whole (D19). The same rules
 * as {@link KerusiSeatHoverCardDirective}, with `ctx.unit` and `ctx.group` in
 * place of `ctx.seat`. The control points at the card with `aria-describedby`.
 *
 * ```html
 * <ng-template kerusiWholeUnitHoverCard let-ctx>
 *   {{ ctx.group.label }}: the whole table, {{ ctx.unit.seatIds.length }} seats,
 *   {{ prices[ctx.unit.id] }}
 * </ng-template>
 * ```
 */
@Directive({ selector: 'ng-template[kerusiWholeUnitHoverCard]' })
export class KerusiWholeUnitHoverCardDirective {
  readonly template = inject<TemplateRef<WholeUnitCardOutletContext>>(TemplateRef);

  /** Types `let-ctx` as a {@link KerusiWholeUnitCardContext}. */
  static ngTemplateContextGuard(
    _dir: KerusiWholeUnitHoverCardDirective,
    ctx: unknown,
  ): ctx is WholeUnitCardOutletContext {
    return true;
  }
}

/**
 * Marks an `<ng-template>` inside `<kerusi-seatmap>` as the card opened by a
 * click, a tap, or Enter/Space on a whole unit's control (D25), as
 * {@link KerusiSeatClickCardDirective} is on a seat. The press still books or
 * releases the unit.
 */
@Directive({ selector: 'ng-template[kerusiWholeUnitClickCard]' })
export class KerusiWholeUnitClickCardDirective {
  readonly template = inject<TemplateRef<WholeUnitCardOutletContext>>(TemplateRef);

  /** Types `let-ctx` as a {@link KerusiWholeUnitCardContext}. */
  static ngTemplateContextGuard(
    _dir: KerusiWholeUnitClickCardDirective,
    ctx: unknown,
  ): ctx is WholeUnitCardOutletContext {
    return true;
  }
}
