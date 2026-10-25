import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  Bounds,
  buildRenderModel,
  formatMoney,
  KerusiSeatCardContext,
  KerusiViolation,
  KerusiWholeUnitCardContext,
  SeatStyleFn,
  summarizeSelection,
  WholeUnitDisallowed,
} from '@kerusiweb/core';
import {
  KerusiSeatClickCardDirective,
  KerusiSeatHoverCardDirective,
  KerusiSeatmapComponent,
  KerusiSeatTemplateDirective,
  KerusiWholeUnitHoverCardDirective,
  SeatDisallowed,
} from '@kerusiweb/angular';
import {
  DEMO_LOCALES,
  premiumTypeStyles,
  Scenario,
  outermostWholeUnits,
  SCENARIOS,
  seatCardText,
  blobSeats,
  toggleWholeUnitButton,
  WholeUnitButton,
  wholeUnitButtons,
  wholeUnitCardText,
  wholeUnitDisallowedText,
  wholeUnitName,
} from '@kerusi/demo-scenarios';

const THEME_STORAGE_KEY = 'kerusi-demo-theme';

type Theme = 'light' | 'dark';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    KerusiSeatmapComponent,
    KerusiSeatTemplateDirective,
    KerusiSeatHoverCardDirective,
    KerusiSeatClickCardDirective,
    KerusiWholeUnitHoverCardDirective,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: { '[attr.data-theme]': 'theme()' },
})
export class App {
  protected readonly scenarios = SCENARIOS;
  protected readonly locales = DEMO_LOCALES;

  protected readonly scenarioId = signal<string>(SCENARIOS[0].id);
  protected readonly locale = signal<string>('en');
  protected readonly showLegend = signal(true);
  protected readonly typeColors = signal(true);
  protected readonly zoomable = signal(true);
  protected readonly maximizable = signal(true);
  /** Draws the rows view (§4.5.1) in place of the canonical drawing. */
  protected readonly rowsView = signal(false);
  /** Draws round seats through a `kerusiSeat` template. */
  protected readonly roundSeats = signal(false);
  /** Recolours aisle seats from a stylesheet rule (`styles.css`). */
  protected readonly aisleCss = signal(false);
  /** Paints the venue's top-priced seat type gold through `seatTypeStyles`. */
  protected readonly goldPremium = signal(false);
  /** Draws every seat as a circle through `seatStyle`. */
  protected readonly circleShape = signal(false);
  protected readonly circleSeats: SeatStyleFn = () => ({ shape: 'circle' });
  /** Draws every seat as a blob, through a function `seatStyle` shape. */
  protected readonly customShape = signal(false);
  protected readonly blobSeats = blobSeats;
  /** Shows a card while a seat is hovered (or focused), through a `kerusiSeatHoverCard` template. */
  protected readonly hoverCard = signal(false);
  /** Opens a card on a click, tap or Enter, through a `kerusiSeatClickCard` template. */
  protected readonly clickCard = signal(false);
  /** Restyles every card from the demo's stylesheet alone, through the tokens. */
  protected readonly restyledCards = signal(false);
  protected readonly showSource = signal(false);

  /** How many switches the options panel has, and how many are on. */
  protected readonly optionCount = 13;
  protected readonly optionsOn = computed(
    () =>
      [
        this.typeColors(),
        this.showLegend(),
        this.zoomable(),
        this.maximizable(),
        this.rowsView(),
        this.goldPremium(),
        this.circleShape(),
        this.customShape(),
        this.aisleCss(),
        this.roundSeats(),
        this.hoverCard(),
        this.clickCard(),
        this.restyledCards(),
      ].filter(Boolean).length,
  );

  /** Puts every switch back to how the page first loads. */
  protected resetOptions(): void {
    this.typeColors.set(true);
    this.showLegend.set(true);
    this.zoomable.set(true);
    this.maximizable.set(true);
    this.rowsView.set(false);
    this.goldPremium.set(false);
    this.circleShape.set(false);
    this.customShape.set(false);
    this.aisleCss.set(false);
    this.roundSeats.set(false);
    this.hoverCard.set(false);
    this.clickCard.set(false);
    this.restyledCards.set(false);
  }
  protected readonly theme = signal<Theme>(getInitialTheme());

  protected toggleTheme(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private browsing or storage disabled — theme just won't persist. */
    }
  }

  /** Selections are per scenario, so switching tabs does not lose a pick. */
  private readonly selections = signal<Record<string, readonly string[]>>({});
  protected readonly lastDisallowed = signal<string>('');
  protected readonly issues = signal<readonly KerusiViolation[]>([]);

  protected readonly scenario = computed<Scenario>(
    () => SCENARIOS.find((s) => s.id === this.scenarioId()) ?? SCENARIOS[0],
  );

  protected readonly selection = computed<readonly string[]>(
    () => this.selections()[this.scenarioId()] ?? [],
  );

  protected onSelectionChange(next: readonly string[]): void {
    this.selections.update((all) => ({ ...all, [this.scenarioId()]: next }));
    this.lastDisallowed.set('');
  }

  protected onScenarioChange(id: string): void {
    this.scenarioId.set(id);
    this.lastDisallowed.set('');
  }

  protected onDisallowed(event: SeatDisallowed): void {
    const where = event.seat.rowLabel
      ? `Row ${event.seat.rowLabel}, seat ${event.seat.label}`
      : `Seat ${event.seat.label}`;
    this.lastDisallowed.set(`${where} — ${DISALLOWED_TEXT[event.reason]}`);
  }

  /** A refused tabletop gets the same visible message a refused seat does (D25). */
  protected onWholeUnitDisallowed(event: WholeUnitDisallowed): void {
    this.lastDisallowed.set(wholeUnitDisallowedText(event));
  }

  /**
   * What the cards say. The library positions a card, dismisses it and names it,
   * and never decides its content (D10); this is the app's own.
   */
  protected cardText(ctx: KerusiSeatCardContext) {
    return seatCardText(ctx.seat, this.locale());
  }

  /** The card on an `either` table's top: the whole table, its seats and its price (D25). */
  protected unitCardText(ctx: KerusiWholeUnitCardContext) {
    return wholeUnitCardText(ctx, this.locale());
  }

  /** Resolved selection: the seats picked, their prices, and the total. */
  protected readonly seatTypeStyles = computed(() =>
    this.goldPremium() ? premiumTypeStyles(this.scenario().map) : undefined,
  );

  protected readonly summary = computed(() => {
    const scenario = this.scenario();
    const model = buildRenderModel(scenario.map, scenario.state, {
      locale: this.locale(),
      session: scenario.session,
    });
    const { seats, total, unpriced, wholeUnits } = summarizeSelection(model, this.selection());
    return {
      // "Table 1 (whole table)": what the change event's `wholeUnits` is for (D20).
      wholeUnits: outermostWholeUnits(wholeUnits).map((unit) => ({
        id: unit.id,
        label: wholeUnitName(unit),
        price: unit.wholePrice ? formatMoney(unit.wholePrice, this.locale()) : '',
      })),
      seats: seats.map((seat) => ({
        id: seat.id,
        label: seat.rowLabel ? `${seat.rowLabel}${seat.label}` : seat.label,
        typeLabel: seat.typeLabel,
        price: seat.price ? formatMoney(seat.price, this.locale()) : '—',
        attributes: seat.attributes,
        accessible: !!seat.accessibility?.wheelchairAccessible,
      })),
      total: total ? formatMoney(total, this.locale()) : '',
      unpriced,
    };
  });

  /**
   * The whole units with nothing to press on the map, a room or the venue,
   * offered with the app's own buttons (D19): the README's "Book the whole
   * room" pattern.
   */
  protected readonly wholeUnitButtons = computed(() =>
    wholeUnitButtons(this.scenario(), this.locale(), this.selection()),
  );

  protected toggleWholeUnit(button: WholeUnitButton): void {
    this.onSelectionChange(toggleWholeUnitButton(this.selection(), button));
  }

  /** The scenario's map as JSON, so the standard itself is visible on the page. */
  protected readonly sourceJson = computed(() => JSON.stringify(this.scenario().map, null, 2));

  protected readonly sectionSummary = computed(() =>
    buildRenderModel(this.scenario().map, this.scenario().state).sections.map((section) => ({
      id: section.id,
      label: section.label ?? section.id,
      seatSize: section.seatSize,
      bounds: formatBounds(section.bounds),
      boundsDeclared: section.boundsDeclared,
      seats: section.seats.length,
      elements: section.elements.length,
    })),
  );
}

/** A section's extent on the canvas, for the sections table: `x, y  w × h`. */
function formatBounds(bounds: Bounds): string {
  const n = (value: number) => String(Math.round(value * 10) / 10);
  return `${n(bounds.x)}, ${n(bounds.y)}  ${n(bounds.width)} × ${n(bounds.height)}`;
}

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    /* private browsing or storage disabled — fall through to system preference. */
  }
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

const DISALLOWED_TEXT: Record<SeatDisallowed['reason'], string> = {
  booked: 'already booked',
  held: 'held in another cart',
  blocked: 'blocked by the venue',
  'not-selectable': 'not selectable',
  'max-selection': 'would exceed the seat limit',
  'unit-unavailable': 'must be booked with a seat that is unavailable',
  'unit-too-large': 'is booked with more seats than the seat limit allows',
};
