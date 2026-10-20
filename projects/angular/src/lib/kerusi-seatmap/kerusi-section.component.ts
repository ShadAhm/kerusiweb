import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  TemplateRef,
} from '@angular/core';
import {
  DEFAULT_KERUSI_COLORS,
  elementFill,
  elementStyle,
  elementTextFill,
  KerusiSeatmapColors,
  PlacedElement,
  PlacedGroup,
  PlacedSeat,
  PlacedSection,
  resolveGroupGlyph,
  resolveSeatGlyph,
  resolveSeatStyle,
  screenPath,
  SeatStyleFn,
  SeatTypeStyles,
} from '@kerusiweb/core';
import { SeatTemplateOutletContext } from './kerusi-seat-template.directive';

/**
 * Draws one Kerusi `Section` as a `<g>` on the map's shared canvas (D1).
 *
 * Sections are zones on one canvas in rev 15 (§4.1), and two may sit side by
 * side, so a section is a group inside the map's single `<svg>` rather than an
 * SVG of its own. Use it on a `<g>` inside an `<svg>` whose `viewBox` is the
 * canvas: `<g kerusi-section [layout]="placed"></g>`. Its template prefixes
 * every element with `svg:`, because Angular cannot tell from a component's
 * own template that it will be stamped into SVG.
 *
 * This component holds no state. It takes a placed layout and emits intent.
 */
@Component({
  selector: 'g[kerusi-section]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  templateUrl: './kerusi-section.component.html',
  styleUrl: './kerusi-section.component.css',
  host: {
    class: 'kerusi-section',
    role: 'group',
    '[attr.aria-label]': 'label() ?? layout().section.id',
    '[attr.data-section-id]': 'layout().section.id',
  },
})
export class KerusiSectionComponent {
  /** The section with its seats and elements placed on the map's canvas. */
  readonly layout = input.required<PlacedSection>();
  /** The section's name: its accessible name, and its drawn label when one is shown. */
  readonly label = input<string | undefined>(undefined);
  /**
   * Draw `label` inside the SVG, at the top-left of the section's bounds. Only
   * a section that declares `bounds` gets one (D5); otherwise the label is the
   * group's accessible name alone.
   */
  readonly showLabel = input<boolean>(true);

  /** Currently selected seat ids. */
  readonly selection = input<ReadonlySet<string>>(new Set());
  /** The seat holding the section's single tab stop, if any. */
  readonly focusedSeatId = input<string | null>(null);
  /** Per-seat accessible names, keyed by seat id. */
  readonly ariaLabels = input<ReadonlyMap<string, string>>(new Map());

  readonly colors = input<Required<KerusiSeatmapColors>>(DEFAULT_KERUSI_COLORS);
  /** Whether an available seat may take its `SeatType.color` (§4.7). */
  readonly typeColors = input<boolean>(true);
  /** Styles for every seat of a type, keyed by `SeatType.id`. */
  readonly seatTypeStyles = input<SeatTypeStyles | undefined>(undefined);
  /** A style for one seat, laid over its type's. */
  readonly seatStyle = input<SeatStyleFn | undefined>(undefined);
  /** Draws the inside of each seat in place of the stock glyph. */
  readonly seatTemplate = input<TemplateRef<SeatTemplateOutletContext> | undefined>(undefined);
  /**
   * When false, selection is off: seats render read-only, with no `aria-pressed`
   * once a click behaviour is set. Whether they still respond is `reachable`'s.
   */
  readonly interactive = input<boolean>(true);
  /**
   * A click behaviour is configured (`(seatClick)` or a click card). On a
   * read-only map this keeps the seats clickable without turning selection on
   * (D14), so `aria-pressed` is left off.
   */
  readonly clickable = input<boolean>(false);
  /**
   * Whether seats take pointer and keyboard interaction at all: they respond,
   * and the section's tab stop is reachable. Defaults to `interactive`.
   */
  readonly reachable = input<boolean | undefined>(undefined);
  /** The seat that shows a hover card, and the card's `id`, for `aria-describedby`. */
  readonly describedBy = input<{ seatId: string; id: string } | null>(null);

  readonly seatActivate = output<string>();
  readonly seatFocused = output<string>();
  readonly seatBlurred = output<string>();
  readonly seatKeydown = output<KeyboardEvent>();

  private readonly live = computed(() => this.reachable() ?? this.interactive());

  /** Whether the label is drawn: asked for, present, and with declared bounds to sit in. */
  protected readonly drawsLabel = computed(
    () => this.showLabel() && !!this.label() && this.layout().section.boundsDeclared,
  );

  protected readonly labelFill = computed(() =>
    elementTextFill(elementStyle('label').tone, this.colors()),
  );

  /**
   * Every seat with its glyph resolved, once per change of layout, selection or
   * theme rather than once per binding per change detection.
   */
  protected readonly seats = computed(() => {
    const selection = this.selection();
    const colors = this.colors();
    const typeColors = this.typeColors();
    const typeStyles = this.seatTypeStyles();
    const seatStyle = this.seatStyle();
    return this.layout().seats.map((placed) => {
      const selected = selection.has(placed.seat.id);
      const style = resolveSeatStyle(placed.seat, selected, typeStyles, seatStyle);
      return {
        placed,
        selected,
        glyph: resolveSeatGlyph(placed, selected, colors, typeColors, style),
      };
    });
  });

  /** The seats drawn outside any group wrapper: in no group, or in one with no label. */
  protected readonly looseSeats = computed(() => {
    const loose = new Set(this.layout().loose);
    return this.seats().filter((entry) => loose.has(entry.placed));
  });

  /**
   * Each group's footprint, resolved once per change of layout or theme. A group
   * with no shape has none and draws nothing of its own.
   */
  protected readonly groups = computed(() => {
    const colors = this.colors();
    return this.layout().groups.map((placed) => ({
      placed,
      glyph: resolveGroupGlyph(placed, colors),
    }));
  });

  /**
   * A group's seats, wrapped in a `role="group"` named by the group's label so a
   * screen reader says which table a seat is at. Only a group with a label and
   * seats gets one: an unnamed group says nothing.
   */
  protected readonly groupedSeats = computed(() => {
    const byId = new Map(this.seats().map((entry) => [entry.placed.seat.id, entry]));
    return this.layout()
      .groups.filter((group: PlacedGroup) => group.group.label && group.seats.length > 0)
      .map((group) => ({
        group: group.group,
        entries: group.seats.map((placed) => byId.get(placed.seat.id)!),
      }));
  });

  /** The section's single tab stop; every other seat is reachable by arrow key. */
  protected tabIndex(placed: PlacedSeat): number {
    if (!this.live()) {
      return -1;
    }
    return placed.seat.id === this.focusedSeatId() ? 0 : -1;
  }

  /** A read-only map that still takes clicks does not toggle, so it is not a toggle button (D14). */
  protected pressed(selected: boolean): boolean | null {
    return !this.interactive() && this.clickable() ? null : selected;
  }

  protected describedById(placed: PlacedSeat): string | null {
    const described = this.describedBy();
    return described?.seatId === placed.seat.id ? described.id : null;
  }

  protected ariaLabel(placed: PlacedSeat): string {
    return this.ariaLabels().get(placed.seat.id) ?? placed.seat.label;
  }

  /** SVG rotate() about the item's center; null when it does not rotate. */
  protected transform(item: PlacedSeat | PlacedElement): string | null {
    return item.rotation ? `rotate(${item.rotation} ${item.centerX} ${item.centerY})` : null;
  }

  /** Cancels the parent <g>'s rotation so the label stays upright and stays put. */
  protected counterRotate(item: PlacedSeat | PlacedElement): string | null {
    return item.rotation ? `rotate(${-item.rotation} ${item.centerX} ${item.centerY})` : null;
  }

  // --- elements -------------------------------------------------------------

  protected style(placed: PlacedElement) {
    return elementStyle(placed.element.kind);
  }

  /** A text element with no label draws nothing, rather than an empty box. */
  protected drawsElement(placed: PlacedElement): boolean {
    const style = this.style(placed);
    return style.shape !== 'text' || (!!placed.element.label && style.showLabel);
  }

  /** A label on a shape stays upright; a text element's own label is what rotates. */
  protected labelTransform(placed: PlacedElement): string | null {
    return this.style(placed).shape === 'text' ? null : this.counterRotate(placed);
  }

  protected elementFillOf(placed: PlacedElement): string {
    return elementFill(this.style(placed).tone, this.colors());
  }

  protected elementTextFillOf(placed: PlacedElement): string {
    return elementTextFill(this.style(placed).tone, this.colors());
  }

  protected screenPathOf(placed: PlacedElement): string {
    return screenPath(placed.x, placed.y, placed.width, placed.height);
  }

  /** The corner radius for a rectangular element; a stage reads as squarer. */
  protected radiusOf(placed: PlacedElement): number {
    return this.style(placed).shape === 'stage' ? 2 : Math.min(placed.height * 0.25, 6);
  }

  // --- interaction ----------------------------------------------------------

  protected onSeatClick(placed: PlacedSeat): void {
    if (this.live()) {
      this.seatActivate.emit(placed.seat.id);
    }
  }

  protected onSeatFocus(placed: PlacedSeat): void {
    if (this.live()) {
      this.seatFocused.emit(placed.seat.id);
    }
  }

  protected onSeatBlur(placed: PlacedSeat): void {
    if (this.live()) {
      this.seatBlurred.emit(placed.seat.id);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.live()) {
      this.seatKeydown.emit(event);
    }
  }
}
