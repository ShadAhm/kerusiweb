# kerusiweb

[![CI](https://github.com/ShadAhm/kerusiweb/actions/workflows/ci.yml/badge.svg)](https://github.com/ShadAhm/kerusiweb/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![@kerusiweb/core](https://img.shields.io/npm/v/@kerusiweb/core?label=%40kerusiweb%2Fcore)](https://www.npmjs.com/package/@kerusiweb/core)
[![@kerusiweb/angular](https://img.shields.io/npm/v/@kerusiweb/angular?label=%40kerusiweb%2Fangular)](https://www.npmjs.com/package/@kerusiweb/angular)
[![@kerusiweb/react](https://img.shields.io/npm/v/@kerusiweb/react?label=%40kerusiweb%2Freact)](https://www.npmjs.com/package/@kerusiweb/react)

A seat map that renders the **[Kerusi Seat Map & Availability
Format](https://github.com/ShadAhm/kerusi)** directly as inline SVG (cinemas,
aircraft, theatres, stadiums, coaches, trains), with keyboard navigation and
screen-reader support built in. Angular and React bindings ship today; the
renderer underneath them is plain TypeScript.

Give it a `KerusiMap` and a `KerusiState` and it draws the venue on the map's
one canvas, every seat exactly where and as large as the document says, seats
coloured from the map's legend, prices resolved through the standard's
precedence order, and seats booked by their booking unit: a love seat as a
pair, a table or a room whole.

> **Upgrading from 3.x?** 4.0.0 follows Kerusi rev 17, which retires
> `Seat.companions` for groups booked whole, and `companionMode` becomes
> `unitMode`; see [Migrating from 3.x](CHANGELOG.md#migrating-from-3x). From 2.x,
> start with [Migrating from 2.x](CHANGELOG.md#migrating-from-2x).

**[Live demos →](https://shadahm.github.io/kerusiweb/)**

## Install

[`@kerusiweb/core`](projects/core) is always required. It holds
the framework-agnostic logic: document types, the conformance validator, the
render model and its geometry. Add the binding for your framework:

```bash
npm install @kerusiweb/core @kerusiweb/angular   # Angular
npm install @kerusiweb/core @kerusiweb/react     # React
```

Each binding adds only components, reactivity and the DOM on top of core.
Both expose the same surface and emit the same SVG. See
[docs/architecture.md](docs/architecture.md) for the boundary, and for what a
third binding would have to supply.

## Quick start

The same two documents drive either binding. They are documents, not framework
objects:

```ts
import type { KerusiMap, KerusiState } from '@kerusiweb/core';

const map: KerusiMap = {
  kerusi: '1.0',
  id: 'bus-42',
  domain: 'bus',
  // One canvas per map, in abstract units; every seat is a 28-unit square.
  canvas: { width: 192, height: 56 },
  seatSize: 28,
  legend: [{ id: 'standard', label: 'Standard' }],
  sections: [
    {
      id: 'main',
      seats: [
        // x/y is where a seat is drawn (its centre); row/col says who its
        // neighbours are.
        { id: '1A', row: '1', col: 1, x: 28, y: 28, type: 'standard' },
        { id: '1B', row: '1', col: 2, x: 62, y: 28, type: 'standard' },
        // Col 3 is omitted. That gap is the aisle; no filler seat needed.
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
  seats: { '1A': { status: 'booked' } }, // everything else is available
};
```

### Angular

```ts
import { Component, signal } from '@angular/core';
import { KerusiSeatmapComponent } from '@kerusiweb/angular';

@Component({
  selector: 'app-bus',
  imports: [KerusiSeatmapComponent],
  template: `<kerusi-seatmap [map]="map" [state]="state" [(selection)]="picked" />`,
})
export class BusComponent {
  protected readonly map = map;
  protected readonly state = state;
  protected readonly picked = signal<readonly string[]>([]);
}
```

### React

```tsx
import { useState } from 'react';
import { KerusiSeatmap } from '@kerusiweb/react';
import '@kerusiweb/react/styles.css';

export function Bus() {
  const [picked, setPicked] = useState<readonly string[]>([]);
  return <KerusiSeatmap map={map} state={state} selection={picked} onSelectionChange={setPicked} />;
}
```

`selection` is a plain list of seat ids in both. Nothing is mutated, so it works
with `OnPush`, signals, hooks, or any store you already have. The one asymmetry
is style delivery: React imports a stylesheet, Angular ships its CSS inside the
bundle.

See the [Angular README](projects/angular/README.md) or the
[React README](projects/react/README.md) for the full API, and
[docs/kerusi.md](docs/kerusi.md) for a tour of what the format can express.

## What it supports

The library is a conformant Kerusi consumer. [docs/kerusi-conformance.md](docs/kerusi-conformance.md)
is a feature-by-feature audit; the highlights:

|                                     |                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **One canvas per map (§4.5)**       | The map is one `<svg>` on the document's canvas. Every seat is drawn at its `x`/`y`, at its seat size and rotation, and nothing is moved, resized or reflowed: the same document draws the same picture in any conformant renderer.                                                    |
| **Sections are zones**              | Sections share the canvas, so a stalls and a balcony can sit side by side. A section's declared `bounds` place its label and let a zoomable map zoom to it.                                                                                                                            |
| **The document drives the picture** | `SeatType.color`, price tiers, attributes and `Element.kind` all affect what is drawn.                                                                                                                                                                                                 |
| **Seat forms (§4.7.1)**             | `SeatType.form` draws an armchair, stool, recliner, beanbag, floor cushion, wheelchair space, sofa place or pew place as its own outline, in the seat and the legend. Your own `shape` still wins (D17).                                                                               |
| **Groups (§4.11)**                  | A table, sofa, love seat, pew or booth is drawn as its own footprint under its seats, styled by `--kerusi-group-*` tokens, and its seats are announced by it: "Table 3, seat 4". It is decoration, so a press on a tabletop selects nothing.                                           |
| **Accessibility**                   | Roving tabindex, arrow keys that follow §4.3.5 adjacency and cross aisles, and seats announced with their type, price, status, a neighbouring aisle and every §4.3.4 accessibility property.                                                                                           |
| **Booking units (§4.12)**           | A tap takes a seat's booking unit: a love seat booked whole as a pair, every chair at a table a session sells whole. An `either` table is booked whole from its tabletop; a room or the venue from the app's own button, built from core's `bookingUnits`. Whole prices follow §4.9.1. |
| **Live availability**               | `KerusiStateStore` (Angular) and `useKerusiState` (React) apply deltas in order, discard stale and out-of-scope ones, and revert lapsed holds.                                                                                                                                         |
| **Validation**                      | Every MUST-level rule, throwing or collecting, with a rule slug and document path per violation, tested against the example corpus published with the standard.                                                                                                                        |

## Hover and click, and seat cards

What happens when the pointer **hovers** a seat, and what happens when a seat is **clicked**, are decided separately, and each is optional. Nothing is on by default.

| Hover    | Click    | How                                                                     |
| -------- | -------- | ----------------------------------------------------------------------- |
| nothing  | nothing  | The default: no new markup, no new behaviour.                           |
| card     | nothing  | A read-only "who sits where" map: point at a seat to see who booked it. |
| nothing  | card     | A booking map: tap a seat to see its price and perks in a card.         |
| card     | card     | A short tooltip on hover, plus a fuller card with actions on click.     |
| callback | callback | Your own UI: the library only reports the events.                       |

Two layers ship: **events** that report the seat and nothing more, and optional **seat cards**, a card anchored to the seat that you fill with your own content.

### Hover and click

```tsx
// React
<KerusiSeatmap
  map={map}
  state={state}
  interactive={false}
  onSeatHover={(seat) => setHovered(seat?.id ?? null)} // RenderSeat | null
  onSeatClick={({ seat, selected, source }) => openDetail(seat.id)}
  onSeatFocus={(seat) => setHovered(seat.id)} // the same detail for the keyboard
/>
```

```html
<!-- Angular -->
<kerusi-seatmap
  [map]="map"
  [state]="state"
  [interactive]="false"
  (seatHover)="hovered.set($event?.id ?? null)"
  (seatClick)="openDetail($event.seat.id)"
  (seatFocus)="hovered.set($event.id)"
/>
```

- `onSeatHover` / `seatHover` reports the seat on entry and `null` on leave, for a mouse or pen only, never during a pan or zoom, and also on a read-only map.
- `onSeatClick` / `seatClick` reports **every** activation of **any** seat, booked ones included, before the selection callbacks. It is read-only: it cannot change what the click does.
- `interactive={false}` turns selection off, but seats stay clickable and keyboard-reachable while `onSeatClick` or a click card is set.

### Seat cards

```tsx
// React
<KerusiSeatmap
  map={map}
  interactive={false}
  renderHoverCard={({ seat }) => (seat.status === 'booked' ? <b>{who[seat.id]}</b> : null)}
  renderClickCard={({ seat, close }) => <BookingDetail id={seat.id} onDone={close} />}
/>
```

```html
<!-- Angular -->
<kerusi-seatmap [map]="map" [interactive]="false">
  <ng-template kerusiSeatHoverCard let-ctx>
    @if (ctx.seat.status === 'booked') { {{ who[ctx.seat.id] }} }
  </ng-template>
  <ng-template kerusiSeatClickCard let-ctx>
    <app-booking-detail [id]="ctx.seat.id" (done)="ctx.close()" />
  </ng-template>
</kerusi-seatmap>
```

The hover card shows on a mouse or pen, never on touch, and on keyboard focus only with `hoverCardOnFocus`. The click card opens on a click, a tap or Enter, and stays until `Escape`, a press outside, a second click on the same seat, or `close()`. Both follow zoom and pan, flip and clamp at the map's edges, and show in full screen. Full details: the [React](projects/react/README.md#seat-cards) and [Angular](projects/angular/README.md#seat-cards) READMEs.

### Whole-unit controls

An `either` table's top, the control that books it whole, has the same three things a seat has (D25): a hover or click card of its own (`renderWholeUnitHoverCard` / `renderWholeUnitClickCard`, or the `kerusiWholeUnitHoverCard` / `kerusiWholeUnitClickCard` templates), a callback when it is refused (`onWholeUnitDisallowed` / `wholeUnitDisallowed`, with `{ unit, group, reason }`), and `wholeUnitPrice`, your own price for its accessible name in place of the map's `wholePrice`. See the [React](projects/react/README.md#whole-unit-cards-refusals-and-prices) and [Angular](projects/angular/README.md#whole-unit-cards-refusals-and-prices) READMEs.

### Styling seat cards

The library sets structure and a plain default look from custom properties. You own the rest: set a token on `.kerusi-seatmap` or any ancestor, hook a class or `data-*` attribute, add your own classes, or drop the chrome with `seatCardAppearance="none"`.

| Custom property                 | Default                                |
| ------------------------------- | -------------------------------------- |
| `--kerusi-seat-card-bg`         | `--kerusi-element-bg`, else white      |
| `--kerusi-seat-card-fg`         | `--kerusi-element-fg`, else near-black |
| `--kerusi-seat-card-border`     | `1px solid rgb(0 0 0 / 0.12)`          |
| `--kerusi-seat-card-radius`     | `8px`                                  |
| `--kerusi-seat-card-shadow`     | a soft drop shadow                     |
| `--kerusi-seat-card-padding`    | `8px 12px`                             |
| `--kerusi-seat-card-max-width`  | `280px`                                |
| `--kerusi-seat-card-font`       | `inherit`                              |
| `--kerusi-seat-card-offset`     | `8px` (the gap between seat and card)  |
| `--kerusi-seat-card-arrow-size` | `6px` (`0` hides the arrow)            |
| `--kerusi-seat-card-z-index`    | `10`                                   |

```css
.kerusi-seat-card[data-seat-status='booked'] {
  --kerusi-seat-card-border: 2px solid #e5707e;
}
```

The class and attribute hooks are `.kerusi-seat-card`, `.kerusi-seat-card--hover` / `--click`, `.kerusi-seat-card__body`, `.kerusi-seat-card__arrow`, `data-placement`, `data-seat-id`, `data-seat-status`, `data-seat-type` and `data-section-id`. A whole unit's card carries `data-group-id`, `data-group-kind` and `data-section-id` instead.

## Repository layout

| Path                       | What it is                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `projects/core/`           | `@kerusiweb/core`: framework-agnostic format, render model and geometry.                                |
| `projects/angular/`        | `@kerusiweb/angular`: the Angular binding over core.                                                    |
| `projects/react/`          | `@kerusiweb/react`: the React binding over core.                                                        |
| `projects/angular-demo/`   | The Angular demo, deployed to GitHub Pages.                                                             |
| `projects/react-demo/`     | The React demo (Vite), deployed alongside it.                                                           |
| `projects/demo-scenarios/` | The five venue documents both demos render.                                                             |
| `docs/`                    | [Architecture](docs/architecture.md), format guide, conformance report, [decisions](docs/decisions.md). |

## Develop

```bash
npm install
npm run start:angular  # serve the Angular demo at http://localhost:4200
npm run start:react    # serve the React demo (Vite)
npm run test:ci        # core + both bindings + both demos
npm run build:core     # build @kerusiweb/core into projects/core/dist
npm run build:angular  # build core, then @kerusiweb/angular into dist/angular
npm run build:react    # build core, then @kerusiweb/react into projects/react/dist
```

There is deliberately no bare `npm start` / `npm test` / `npm run build`. Every
script names its framework, so no binding is the default.

Every binding resolves `@kerusiweb/core` through the npm workspace, so core must
be built first. `build:angular` and `build:react` each run that step for you. Both
demos run against source, so a change in core or in either binding hot-reloads.

New here? [CONTRIBUTING.md](CONTRIBUTING.md) has the dev loop and the one rule
that decides where code goes.

## Publishing

Releases are cut manually (CI never publishes to npm):

1. Bump `version` in `projects/core/package.json`, `projects/angular/package.json`
   and `projects/react/package.json` (keep them in step, and update the
   `@kerusiweb/core` peer range in both bindings) and add a `CHANGELOG.md` entry.
2. `npm run build:angular && npm run build:react` (each builds core first).
3. `npm publish --workspace @kerusiweb/core --access public`. Core must go out first,
   since both bindings declare it as a peer.
4. `cd dist/angular && npm publish --access public` (add `--dry-run` first to inspect contents).
5. `npm publish --workspace @kerusiweb/react --access public` (again, `--dry-run` first;
   it should list `dist/**` and `styles.css`, and nothing from core).
6. `git tag vX.Y.Z && git push --tags`, then cut a GitHub Release from the tag.

## History

This started as a fun little idea in
[angularJs.keruC](https://github.com/ShadAhm/angularJs.keruC), a canvas-based
seat map picker for AngularJS 1.x, and was later revived as a modern standalone
Angular library.
Version 1.0 rebuilt it around the Kerusi
format, and 1.1 extracted the framework-agnostic core, which made Angular one
binding among several rather than the project itself. 2.0 renamed the packages
under the `@kerusiweb` scope and is the first release published to npm. See
[CHANGELOG.md](CHANGELOG.md) for details.

## License

MIT © Arsyad "Shad Ahm" Ahmad
