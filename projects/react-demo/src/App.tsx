import { buildRenderModel, formatMoney, summarizeSelection } from '@kerusiweb/core';
import type {
  Bounds,
  KerusiSeatCardContext,
  KerusiViolation,
  KerusiWholeUnitCardContext,
  SeatStyleFn,
  WholeUnitDisallowed,
} from '@kerusiweb/core';
import { KerusiSeatmap } from '@kerusiweb/react';
import type { KerusiSeatmapHandle, SeatDisallowed, SeatRenderContext } from '@kerusiweb/react';
import {
  DEMO_LOCALES,
  premiumTypeStyles,
  outermostWholeUnits,
  SCENARIOS,
  seatCardText,
  blobSeats,
  toggleWholeUnitButton,
  wholeUnitButtons as wholeUnitButtonsOf,
  wholeUnitCardText,
  wholeUnitDisallowedText,
  wholeUnitName,
} from '@kerusi/demo-scenarios';
import type { WholeUnitButton } from '@kerusi/demo-scenarios';
import type { Scenario } from '@kerusi/demo-scenarios';
import { useCallback, useMemo, useRef, useState } from 'react';

const THEME_STORAGE_KEY = 'kerusi-demo-theme';

type Theme = 'light' | 'dark';

export function App() {
  const [scenarioId, setScenarioId] = useState<string>(SCENARIOS[0]!.id);
  const [locale, setLocale] = useState('en');
  const [showLegend, setShowLegend] = useState(true);
  const [typeColors, setTypeColors] = useState(true);
  const [zoomable, setZoomable] = useState(true);
  const [maximizable, setMaximizable] = useState(true);
  const [rowsView, setRowsView] = useState(false);
  const [roundSeats, setRoundSeats] = useState(false);
  const [aisleCss, setAisleCss] = useState(false);
  const [goldPremium, setGoldPremium] = useState(false);
  const [circleShape, setCircleShape] = useState(false);
  const [customShape, setCustomShape] = useState(false);
  const [hoverCard, setHoverCard] = useState(false);
  const [clickCard, setClickCard] = useState(false);
  const [restyledCards, setRestyledCards] = useState(false);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const seatmap = useRef<KerusiSeatmapHandle | null>(null);

  /** Selections are per scenario, so switching tabs does not lose a pick. */
  const [selections, setSelections] = useState<Record<string, readonly string[]>>({});
  const [lastDisallowed, setLastDisallowed] = useState('');
  const [issues, setIssues] = useState<readonly KerusiViolation[]>([]);

  const scenario: Scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]!;
  const selection = selections[scenarioId] ?? EMPTY;

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private browsing or storage disabled — theme just won't persist. */
    }
  };

  const onSelectionChange = useCallback(
    (next: readonly string[]) => {
      setSelections((all) => ({ ...all, [scenarioId]: next }));
      setLastDisallowed('');
    },
    [scenarioId],
  );

  const onScenarioChange = (id: string) => {
    setScenarioId(id);
    setLastDisallowed('');
  };

  const onDisallowed = useCallback((event: SeatDisallowed) => {
    const where = event.seat.rowLabel
      ? `Row ${event.seat.rowLabel}, seat ${event.seat.label}`
      : `Seat ${event.seat.label}`;
    setLastDisallowed(`${where} — ${DISALLOWED_TEXT[event.reason]}`);
  }, []);

  /** A refused tabletop gets the same visible message a refused seat does (D25). */
  const onWholeUnitDisallowed = useCallback(
    (event: WholeUnitDisallowed) => setLastDisallowed(wholeUnitDisallowedText(event)),
    [],
  );

  /**
   * The cards' content is the app's own markup: the library positions it,
   * dismisses it and names it, and never decides what it says (D10).
   */
  const renderHoverCard = useCallback(
    ({ seat, trigger }: KerusiSeatCardContext) => {
      const text = seatCardText(seat, locale);
      return (
        <>
          <span className="demo-card__title">{text.title}</span>
          <span className="demo-card__meta">
            {text.type}
            {text.price && ` · ${text.price}`} · {text.status}
            {trigger === 'focus' && ' · focused'}
          </span>
        </>
      );
    },
    [locale],
  );

  /** The card on an `either` table's top: the whole table, its seats and its price (D25). */
  const renderWholeUnitHoverCard = useCallback(
    (ctx: KerusiWholeUnitCardContext) => {
      const text = wholeUnitCardText(ctx, locale);
      return (
        <>
          <span className="demo-card__title">{text.title}</span>
          <span className="demo-card__meta">
            {text.type}
            {text.price && ` · ${text.price}`}
          </span>
          <span className="demo-card__meta">
            {text.status}
            {ctx.trigger === 'focus' && ' · focused'}
          </span>
        </>
      );
    },
    [locale],
  );

  const renderClickCard = useCallback(
    ({ seat, selected, close }: KerusiSeatCardContext) => {
      const text = seatCardText(seat, locale);
      return (
        <>
          <span className="demo-card__title">{text.title}</span>
          <span className="demo-card__meta">{text.type}</span>
          {text.price && <span className="demo-card__meta">{text.price}</span>}
          <span className="demo-card__meta">
            {text.status}
            {selected && ' · in your selection'}
          </span>
          <span className="demo-card__actions">
            <button type="button" className="demo-card__button" onClick={close}>
              Close
            </button>
          </span>
        </>
      );
    },
    [locale],
  );

  /** Resolved selection: the seats picked, their prices, and the total. */
  const seatTypeStyles = useMemo(
    () => (goldPremium ? premiumTypeStyles(scenario.map) : undefined),
    [goldPremium, scenario.map],
  );

  const summary = useMemo(() => {
    const model = buildRenderModel(scenario.map, scenario.state, {
      locale,
      session: scenario.session,
    });
    const { seats, total, unpriced, wholeUnits } = summarizeSelection(model, selection);
    return {
      // "Table 1 (whole table)": what the change event's `wholeUnits` is for (D20).
      wholeUnits: outermostWholeUnits(wholeUnits).map((unit) => ({
        id: unit.id,
        label: wholeUnitName(unit),
        price: unit.wholePrice ? formatMoney(unit.wholePrice, locale) : '',
      })),
      seats: seats.map((seat) => ({
        id: seat.id,
        label: seat.rowLabel ? `${seat.rowLabel}${seat.label}` : seat.label,
        typeLabel: seat.typeLabel,
        price: seat.price ? formatMoney(seat.price, locale) : '—',
        accessible: !!seat.accessibility?.wheelchairAccessible,
      })),
      total: total ? formatMoney(total, locale) : '',
      unpriced,
    };
  }, [scenario, locale, selection]);

  /**
   * The whole units with nothing to press on the map, a room or the venue,
   * offered with the app's own buttons (D19). This is the README's "Book the
   * whole room" pattern: read the units with their availability, and set
   * `selection`.
   */
  const wholeUnitButtons = useMemo(
    () => wholeUnitButtonsOf(scenario, locale, selection),
    [scenario, locale, selection],
  );

  const toggleWholeUnit = (button: WholeUnitButton) =>
    onSelectionChange(toggleWholeUnitButton(selection, button));

  const sectionSummary = useMemo(
    () =>
      buildRenderModel(scenario.map, scenario.state).sections.map((section) => ({
        id: section.id,
        label: section.label ?? section.id,
        seatSize: section.seatSize,
        bounds: formatBounds(section.bounds),
        boundsDeclared: section.boundsDeclared,
        seats: section.seats.length,
      })),
    [scenario],
  );

  /** Every switch in the options panel, by key; the panel renders from this. */
  const options: Option[] = [
    {
      key: 'typeColors',
      label: 'Seat-type colours',
      hint: 'Tint each seat by its type',
      value: typeColors,
      set: setTypeColors,
      initial: true,
    },
    {
      key: 'showLegend',
      label: 'Legend',
      hint: 'A key under the map',
      value: showLegend,
      set: setShowLegend,
      initial: true,
    },
    {
      key: 'zoomable',
      label: 'Zoom & pan',
      hint: 'Pinch, wheel, drag',
      value: zoomable,
      set: setZoomable,
      initial: true,
    },
    {
      key: 'maximizable',
      label: 'Full screen',
      hint: 'Adds an expand button',
      value: maximizable,
      set: setMaximizable,
      initial: true,
    },
    {
      key: 'rowsView',
      label: 'Rows view',
      hint: "view: 'rows'",
      value: rowsView,
      set: setRowsView,
      initial: false,
    },
    {
      key: 'goldPremium',
      label: 'Gold premium seats',
      hint: 'seatTypeStyles',
      value: goldPremium,
      set: setGoldPremium,
      initial: false,
    },
    {
      key: 'circleShape',
      label: 'Circle seat shape',
      hint: 'seatStyle',
      value: circleShape,
      set: setCircleShape,
      initial: false,
    },
    {
      key: 'customShape',
      label: 'Custom seat shape',
      hint: 'seatStyle',
      value: customShape,
      set: setCustomShape,
      initial: false,
    },
    {
      key: 'aisleCss',
      label: 'Aisle seats via CSS',
      hint: 'Data attributes, no code',
      value: aisleCss,
      set: setAisleCss,
      initial: false,
    },
    {
      key: 'roundSeats',
      label: 'Custom seat template',
      hint: 'renderSeat — your own SVG',
      value: roundSeats,
      set: setRoundSeats,
      initial: false,
    },
    {
      key: 'hoverCard',
      label: 'Hover card',
      hint: 'Details on hover or focus',
      value: hoverCard,
      set: setHoverCard,
      initial: false,
    },
    {
      key: 'clickCard',
      label: 'Click card',
      hint: 'Details with a Close button',
      value: clickCard,
      set: setClickCard,
      initial: false,
    },
    {
      key: 'restyledCards',
      label: 'Restyled cards',
      hint: 'Restyled with tokens alone',
      value: restyledCards,
      set: setRestyledCards,
      initial: false,
    },
  ];
  const optionsByKey = Object.fromEntries(options.map((option) => [option.key, option]));
  const optionsOn = options.filter((option) => option.value).length;
  const resetOptions = () => options.forEach((option) => option.set(option.initial));

  /** The scenario's map as JSON, so the standard itself is visible on the page. */
  const sourceJson = useMemo(() => JSON.stringify(scenario.map, null, 2), [scenario]);

  return (
    <div className="app" data-theme={theme}>
      <header className="site-header">
        <div>
          <h1>@kerusiweb/react</h1>
          <p>
            A React seat map that renders <a href="https://github.com/ShadAhm/kerusi">Kerusi</a>{' '}
            documents directly — one canvas per map, every seat exactly where the document puts it,
            and a keyboard-navigable, screen-reader-friendly SVG.
          </p>
        </div>

        <button
          type="button"
          className="theme-toggle"
          aria-pressed={theme === 'dark'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}
        </button>
      </header>

      <main>
        <nav className="scenarios" aria-label="Venue scenarios">
          {SCENARIOS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                item.id === scenarioId ? 'scenario-tab scenario-tab--active' : 'scenario-tab'
              }
              aria-pressed={item.id === scenarioId}
              onClick={() => onScenarioChange(item.id)}
            >
              {item.name}
            </button>
          ))}
        </nav>

        <section className="scenario" aria-label={scenario.name}>
          <div className="scenario-intro">
            <div>
              <h2>{scenario.map.name as string}</h2>
              <p className="hint">{scenario.blurb}</p>
            </div>

            <label className="locale">
              Locale
              <select value={locale} onChange={(e) => setLocale(e.target.value)}>
                {DEMO_LOCALES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="scenario-body">
            <div
              className={['stage', aisleCss && 'demo-aisles', restyledCards && 'demo-cards']
                .filter(Boolean)
                .join(' ')}
            >
              <KerusiSeatmap
                ref={seatmap}
                map={scenario.map}
                state={scenario.state}
                session={scenario.session}
                selection={selection}
                onSelectionChange={onSelectionChange}
                locale={locale}
                typeColors={typeColors}
                showLegend={showLegend}
                zoomable={zoomable}
                maximizable={maximizable}
                view={rowsView ? 'rows' : 'canonical'}
                seatTypeStyles={seatTypeStyles}
                seatStyle={customShape ? blobSeats : circleShape ? circleSeats : undefined}
                renderSeat={roundSeats ? renderRoundSeat : undefined}
                renderHoverCard={hoverCard ? renderHoverCard : undefined}
                renderClickCard={clickCard ? renderClickCard : undefined}
                renderWholeUnitHoverCard={hoverCard ? renderWholeUnitHoverCard : undefined}
                hoverCardOnFocus={hoverCard}
                onSeatDisallowed={onDisallowed}
                onWholeUnitDisallowed={onWholeUnitDisallowed}
                onValidationIssues={setIssues}
              />

              <p className="keyboard-hint">
                Tab into the map, then use the arrow keys — they follow <code>col</code> order, so
                an aisle is stepped across rather than into. Enter or Space picks a seat; Escape
                clears. With zoom &amp; pan on: pinch, or Ctrl/Cmd + wheel, to zoom; drag to pan;{' '}
                <code>+</code>, <code>-</code> and <code>0</code> from the keyboard.
              </p>
            </div>

            <aside className="panel">
              {wholeUnitButtons.length > 0 && (
                <div className="card">
                  <h3>Book it whole</h3>
                  {wholeUnitButtons.map((unit) => (
                    <button
                      key={unit.key}
                      type="button"
                      className="whole-unit"
                      aria-pressed={unit.selected}
                      disabled={!unit.bookable}
                      onClick={() => toggleWholeUnit(unit)}
                    >
                      {unit.label}
                    </button>
                  ))}
                  <p className="muted">
                    The venue has no shape to press, so the app offers it from the map&apos;s whole
                    units, and selects it by setting <code>selection</code>.
                  </p>
                </div>
              )}

              <div className="card">
                <h3>Your selection</h3>
                {summary.seats.length > 0 ? (
                  <>
                    {summary.wholeUnits.length > 0 && (
                      <ul className="seat-list seat-list--wholes">
                        {summary.wholeUnits.map((unit) => (
                          <li key={unit.id}>
                            <span className="seat-list__id">{unit.label}</span>
                            <span className="seat-list__price">{unit.price}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <ul className="seat-list">
                      {summary.seats.map((seat) => (
                        <li key={seat.id}>
                          <span className="seat-list__id">{seat.label}</span>
                          <span className="seat-list__type">{seat.typeLabel}</span>
                          <span className="seat-list__price">{seat.price}</span>
                          {seat.accessible && (
                            <span className="badge" title="Wheelchair accessible">
                              &#9855;
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {summary.total && <p className="total">Total {summary.total}</p>}
                    {summary.unpriced > 0 && (
                      <p className="muted">{summary.unpriced} seat(s) carry no price.</p>
                    )}
                  </>
                ) : (
                  <p className="muted">
                    No seats picked. Prices resolve through the standard&apos;s order: the
                    seat&apos;s own price, then its tier, then its type&apos;s default.
                  </p>
                )}
                {lastDisallowed && <p className="warn">{lastDisallowed}</p>}
              </div>

              <div className="card">
                <h3>What this document shows</h3>
                <ul className="highlights">
                  {scenario.highlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="card">
                <h3>Sections</h3>
                <table className="sections-table">
                  <thead>
                    <tr>
                      <th scope="col">Section</th>
                      <th scope="col">Seat size</th>
                      <th scope="col">Bounds</th>
                      <th scope="col">Seats</th>
                      <th scope="col">
                        <span className="visually-hidden">Zoom</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionSummary.map((section) => (
                      <tr key={section.id}>
                        <td>{section.label}</td>
                        <td>{section.seatSize}</td>
                        <td>
                          <code>{section.bounds}</code>
                          {!section.boundsDeclared && (
                            <span className="muted"> (from its seats)</span>
                          )}
                        </td>
                        <td>{section.seats}</td>
                        <td>
                          <button
                            type="button"
                            className="zoom-section"
                            disabled={!zoomable}
                            onClick={() => seatmap.current?.zoomToSection(section.id)}
                          >
                            Zoom
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card">
                <h3>Conformance</h3>
                {issues.length === 0 ? (
                  <p className="ok">This document validates clean — no errors, no warnings.</p>
                ) : (
                  <ul className="issues">
                    {issues.map((issue, index) => (
                      <li key={index} className={`issue issue--${issue.severity}`}>
                        <code>{issue.rule}</code> {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </div>

          <div className="options" role="group" aria-label="Demo options">
            <div className="options__head">
              <h3>
                Options{' '}
                <span className="options__count">
                  · {optionsOn} of {options.length} on
                </span>
              </h3>
              <button type="button" className="options__reset" onClick={resetOptions}>
                Reset
              </button>
            </div>
            <div className="options__groups">
              {OPTION_GROUPS.map((group) => (
                <fieldset key={group.name} className="options__group">
                  <legend>{group.name}</legend>
                  {group.keys.map((key) => {
                    const option = optionsByKey[key]!;
                    return (
                      <label key={key} className="toggle">
                        <input
                          type="checkbox"
                          checked={option.value}
                          onChange={(e) => option.set(e.target.checked)}
                        />
                        <span className="toggle__text">
                          <span className="toggle__label">{option.label}</span>
                          <span className="toggle__hint">{option.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ))}
            </div>
          </div>

          <details className="source">
            <summary>The KerusiMap behind this view</summary>
            <pre>
              <code>{sourceJson}</code>
            </pre>
          </details>
        </section>
      </main>

      <footer className="site-footer">
        <a href="https://github.com/ShadAhm/kerusiweb">GitHub</a>
        <span>&middot;</span>
        <a href="https://www.npmjs.com/package/@kerusiweb/react">npm</a>
        <span>&middot;</span>
        <a href="https://github.com/ShadAhm/kerusi">The Kerusi standard</a>
      </footer>
    </div>
  );
}

const EMPTY: readonly string[] = [];

interface Option {
  key: string;
  label: string;
  hint: string;
  value: boolean;
  set: (value: boolean) => void;
  /** What "Reset" puts it back to. */
  initial: boolean;
}

/** How the options panel groups its switches. */
const OPTION_GROUPS: readonly { name: string; keys: readonly string[] }[] = [
  { name: 'Map', keys: ['typeColors', 'showLegend', 'zoomable', 'maximizable', 'rowsView'] },
  { name: 'Seats', keys: ['goldPremium', 'circleShape', 'customShape', 'aisleCss', 'roundSeats'] },
  { name: 'Seat cards', keys: ['hoverCard', 'clickCard', 'restyledCards'] },
];

/** The "Circle seat shape" toggle: every seat as a circle, through `seatStyle`. */
const circleSeats: SeatStyleFn = () => ({ shape: 'circle' });

/**
 * The "Custom seat template" toggle: round seats, drawn from the paints and
 * marks core already resolved for each one. Reusing the library's own classes
 * for the wash and the occupant keeps their opacity, so held, booked and
 * selected still read the same as on the stock seat. Defined once, outside the
 * component, so the prop stays the same function between renders.
 */
function renderRoundSeat({ glyph }: SeatRenderContext) {
  const { box, markBox, body, wash, core, occupant, label } = glyph;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return (
    <>
      <circle cx={cx} cy={cy} r={box.width / 2} style={{ fill: body.fill }} />
      {wash && (
        <circle
          className="kerusi-seat__wash"
          cx={cx}
          cy={cy}
          r={box.width / 2}
          style={{ fill: wash.fill }}
        />
      )}
      {core && <circle cx={cx} cy={cy} r={markBox.width / 2} style={{ fill: core.fill }} />}
      {occupant && (
        <path
          className={`kerusi-seat__occupant kerusi-seat__occupant--${occupant.variant}`}
          d={occupant.d}
          strokeWidth={occupant.strokeWidth}
          style={{ fill: occupant.fill, stroke: occupant.stroke }}
        />
      )}
      <text
        className="kerusi-seat__label"
        textAnchor="middle"
        dominantBaseline="central"
        x={label.x}
        y={label.y}
        fontSize={label.fontSize}
        style={{ fill: label.fill, stroke: label.halo }}
        strokeWidth={label.haloWidth}
        transform={label.transform ?? undefined}
      >
        {label.text}
      </text>
    </>
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
