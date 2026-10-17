# Rendering Kerusi documents

`@kerusiweb/core` consumes the [**Kerusi Seat Map & Availability
Format**](https://github.com/ShadAhm/kerusi) natively: a static `KerusiMap`
(layout, seat types, pricing) plus a live `KerusiState` (availability) go
straight into the seat-map component of whichever binding you install.

Kerusi is a vendor-neutral, domain-agnostic JSON format (cinema, flight, bus,
theatre, stadium, train), and this page shows how each part of it turns into
something on screen. See the standard for the normative rules.

Everything below is framework-neutral unless it says otherwise: the documents
are just JSON, the resolution rules live in core, and the component inputs are
named identically in every binding: written `[input]="value"` in an Angular
template and `input={value}` as a React prop.

## The minimum

```ts
import type { KerusiMap, KerusiState } from '@kerusiweb/core';

const map: KerusiMap = {
  kerusi: '1.0',
  id: 'bus-42',
  domain: 'bus',
  canvas: { width: 192, height: 56 },
  seatSize: 28,
  legend: [{ id: 'standard', label: 'Standard' }],
  sections: [
    {
      id: 'main',
      seats: [
        { id: '1A', row: '1', col: 1, x: 28, y: 28, type: 'standard' },
        { id: '1B', row: '1', col: 2, x: 62, y: 28, type: 'standard' },
        // col 3 is omitted; that gap is the aisle (no filler seat, §4.3.2)
        { id: '1C', row: '1', col: 4, x: 130, y: 28, type: 'standard' },
        { id: '1D', row: '1', col: 5, x: 164, y: 28, type: 'standard' },
      ],
    },
  ],
};

const state: KerusiState = {
  kerusi: '1.0',
  mapId: 'bus-42',
  updatedAt: '2026-08-19T09:14:00Z',
  seats: { '1A': { status: 'booked' } }, // everything else defaults to available
};

@Component({
  selector: 'app-bus',
  imports: [KerusiSeatmapComponent],
  template: `<kerusi-seatmap [map]="map" [state]="state" />`,
})
export class BusComponent {
  protected readonly map = map;
  protected readonly state = state;
}
```

Every seat says where it is (`x`/`y`, its centre on the canvas) and who its
neighbours are (`row`/`col`). The two are independent: moving a seat never
changes its neighbours, and renumbering a `col` never moves a seat.

## The canvas (§4.5)

A map has **one canvas**, `KerusiMap.canvas`, in abstract units with the same
scale on both axes, the origin at the top-left and `y` growing downwards. Every
seat, element and section of the map is placed on it.

- A seat is a square of `seatSize` canvas units centred on its `x`/`y`, turned
  clockwise by `rotation` degrees. `KerusiMap.seatSize` is required, and a
  section may override it for its own seats, so business-class seats can be
  larger than economy ones. Within one section every seat is the same size.
- An element is a `width` × `height` rectangle centred on its `x`/`y`. A
  missing `width` or `height` is the seat size (§4.4.1).

The renderer draws exactly that. The map is one `<svg>` whose `viewBox` is the
canvas, and the library does **no layout arithmetic**: no cell sizes, no row
spacing, no percentages. It picks the scale (`unitScale` CSS pixels per canvas
unit, at most, shrinking to fit a narrower container) and may zoom, pan, or
mirror the whole drawing for a right-to-left locale. It never otherwise moves,
resizes, or reflows anything.

```ts
// A seat 40 units square, centred at (320, 400), tilted to follow a curve.
{ id: 'A1', row: 'A', col: 1, x: 320, y: 400, rotation: -8, type: 'standard' }
```

The validator holds a document to that canvas:

```ts
import { checkKerusiMap } from '@kerusiweb/core';

checkKerusiMap(map);
// [{ rule: 'seat-outside-canvas', severity: 'error',
//    path: 'sections[0].seats[3].x',
//    message: 'Seat "1D" has x 900, outside the canvas (0 to 192, the canvas width) ...' }]
```

Two findings are warnings rather than errors: seats whose footprints overlap
(`seat-overlap`, §4.3.1; footprints that only touch don't overlap) and seats
outside their section's declared `bounds` (`seat-outside-section-bounds`).

## Neighbours (§4.3.5)

Two seats are neighbours when they share a `row` and their `col`s differ by
exactly one. Nothing else makes seats neighbours: not distance on the canvas,
not labels, not array order. A skipped `col` is an aisle.

That is what keyboard navigation follows. Left and right move along the row in
`col` order and jump across an aisle rather than stopping at it; up and down
move to the next row in §4.2.1 order and pick the seat nearest on the canvas.
A seat next to an aisle says so in its accessible name. Seats with no `row`
have no neighbours, and the library orders them by position instead: in bands
by `y`, then by `x`.

## Sections are zones

A `Section` is a named zone on the map's one canvas, not a canvas of its own.
Two sections can sit side by side or overlap in height, and every section is
drawn at the same scale. Each is a `<g role="group">` inside the map's `<svg>`,
named by its label.

```ts
sections: [
  { id: 'stalls', index: 0, label: { en: 'Stalls', ms: 'Tempat Duduk Bawah' },
    bounds: { x: 280, y: 60, width: 1180, height: 680 }, seats: [...] },
  { id: 'balcony', index: 1, label: { en: 'Balcony', ms: 'Balkoni' },
    bounds: { x: 440, y: 580, width: 720, height: 220 }, seats: [...] },
]
```

`Section.bounds` is optional and never changes the drawing. When a section
declares it, the library draws the section's label just above it (with
`showSectionLabels`, the default) and zooms to it for `zoomToSection`. A
section without `bounds` is zoomed to the box around its seats and elements,
and its label is only its group's accessible name.

Sections render in `Section.index` order. Restrict or reorder them with
`sectionIds`, and hide or rename individual ones with `sectionOverrides`. A
hidden section's space stays empty: the canvas never shrinks, because closing
the gap would move the sections around it.

## Rows (§4.2)

Rows give **order and adjacency, never space**. `Section.rows` is not a
container; seats never live inside a row. But where a section declares it, it
is that section's **complete row registry**: the rows come from it rather than
from the seats that happen to reference one.

```ts
{ id: 'stalls',
  rows: [
    { id: 'A', label: 'A', index: 0 },
    { id: 'B', label: 'B', index: 1 },
    { id: 'L', label: 'L (Love Seats)', index: 11 },
  ],
  seats: [ /* rows A, B and L */ ],
}
```

`index` is an **ordering key, not a position**: rows numbered 0 and 11 with
nothing between them are adjacent, so renumbering a section moves nothing. Rows
without an `index` sort after those that have one, in declaration order
(§4.2.1). A row no seat references (an **empty row**, §4.2.2) still takes its
place in the order and reaches the render model as a `RenderRow` with
`empty: true`, but it reserves nothing on the canvas. The space in front of a
cinema screen is there because the seats' own `y` leave it.

With no `rows` at all, a seat's `row` is opaque free text and the section's rows
are exactly the ones its seats name, in first-appearance order.

A row may record the line, arc or circle an editor placed its seats along, as
`RowMeta.shape` (§4.2.3). Renderers ignore it: each seat is drawn at its own
`x`/`y`, on the guide or not. Core exports `guidePoint` and `isOnGuide` for
editors that need it.

## Elements (§4.4)

Non-bookable fixtures: screens, stages, exits, lavatories, gaps, tables. An
element is placed on the canvas exactly as a seat is, by its centre (§4.4.1),
and `id` and `kind` are required. It has no `row` and no `col`, and no
neighbours.

```ts
elements: [
  // An 800 × 90 stage centred at (800, 126).
  { id: 'stage', kind: 'stage', label: 'Stage', x: 800, y: 126, width: 800, height: 90 },
  // No width or height: the section's seat size.
  { id: 'exit', kind: 'exit', label: 'EXIT', x: 32, y: 330 },
];
```

## Direction labels (§4.10)

`Section.directions` names what an addressing axis means in the physical
world: which end of a train a row is nearer, which compass direction a stand
faces:

```ts
directions: [{ axis: 'row', low: 'front of train', high: 'back of train' }];
```

Both ends may be a locale map, and both arrive localized on
`RenderSection.directions`. It is purely informational: no document is rejected
over it, and nothing here reads it to decide where anything is drawn.

## Seat types, pricing and the legend

`SeatType.color` is the standard's suggested render colour, and an available
seat takes it. Availability still outranks it: a booked seat renders as booked,
never in its type's colour.

Price resolves through the §4.9 order: `Seat.price`, then `Seat.priceTier`, then
`SeatType.defaultPriceTier`, then unpriced (a valid terminal state). Amounts are
minor units, and `formatMoney` reads the currency's exponent rather than
assuming two digits, so JPY and KWD come out right.

```ts
import { summarizeSelection, formatMoney, buildRenderModel } from '@kerusiweb/core';

const model = buildRenderModel(map, state);
const { seats, total, unpriced } = summarizeSelection(model, selection());
formatMoney(total, 'ms-MY'); // "RM 104.00"
```

`showLegend` renders a key from `KerusiMap.legend` and `priceTiers`.

## Companions (§4.6)

`companions` must be symmetric, and the library treats the transitive closure as
one unit: selecting a love seat takes its partner, deselecting either releases
both, `maxSelection` counts the pair, and a pair whose other half is sold is
refused with `reason: 'companion-unavailable'` rather than half-taken.

```ts
{ id: 'L1', row: 'L', col: 1, x: 600, y: 700, type: 'sofa', companions: ['L2'] },
{ id: 'L2', row: 'L', col: 2, x: 660, y: 700, type: 'sofa', companions: ['L1'] },
```

Set `companionMode` to `'independent'` to handle the pairing yourself.

## Accessibility (§4.3.4)

`Seat.accessibility` is structured, not a free-text tag, and everything in it is
announced:

```ts
{
  id: '15C', row: '15', col: 3, x: 96, y: 378, type: 'accessible',
  attributes: ['aisle'],
  companions: ['15B'],
  accessibility: {
    wheelchairAccessible: true,
    transferArmrest: 'left',
    aisleChairCompatible: true,
    companionRequired: true,
  },
}
```

> "Row 15, seat C, Accessible, MYR 140.00, available, wheelchair accessible,
> transfer armrest left, aisle chair compatible, companion seat required, aisle."

Pair `companionRequired` with `companions` so the companion seat is actually
linked, not merely implied.

## Localization

`Section.label` and `SeatType.label` may be locale maps. Resolution walks the
BCP-47 chain (`ms-MY` → `ms` → the fallback locale → the first key), so a map
localized into languages you did not ask for still renders something.

```ts
legend: [{ id: 'standard', label: { en: 'Standard', 'ms-MY': 'Biasa' } }];
```

`locale` overrides `KerusiMap.locale`. `rtl` defaults to `auto` and derives
the direction from the resolved locale. Right-to-left mirrors the whole canvas,
`x` becoming `canvas.width − x` and every rotation negated, with text kept
readable, and swaps the arrow keys with it. `col` order, and so reading order,
is untouched.

## Live availability (§5.1, §5.2)

A `KerusiState` is sparse: a seat absent from `seats` is available. Statuses are
`available`, `held` (with an optional `holdExpires`), `booked` and `blocked`;
all four render distinctly and only `available` is selectable by default.

For a push transport, each binding wraps core's `applyStateDeltaOrdered` in its
own reactive primitive (`KerusiStateStore` in `@kerusiweb/angular`,
`useKerusiState` in `@kerusiweb/react`), and both report the same outcome for a
`KerusiStateDelta`:

```ts
// Angular
const store = new KerusiStateStore(initialState);
const result = store.apply(delta);
// 'applied' | 'stale' | 'duplicate' | 'gap' | 'scope-mismatch'
```

```tsx
// React
const { state, apply } = useKerusiState(initialState);
const result = apply(delta); // the same five outcomes
```

Set `expireHolds` to have a lapsed hold revert to available on screen.

## Sessions (§5.3)

A `KerusiSession` joins a reusable map to a specific showtime, and a
`KerusiState` may reference it by `sessionId` instead of `mapId`. Pass it as
`session` and the library checks the joins actually resolve.

```ts
const session: KerusiSession = {
  kerusi: '1.0',
  id: 'hall-3-2026-08-19-1930',
  mapId: 'gsc-hall-3',
  label: 'Dune: Part Three — 7:30pm',
  startsAt: '2026-08-19T19:30:00+08:00',
};
```
