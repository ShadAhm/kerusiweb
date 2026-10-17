# @kerusiweb/angular

An Angular seat map that renders [Kerusi](https://github.com/ShadAhm/kerusi)
documents as interactive, accessible inline SVG.

```bash
npm install @kerusiweb/core @kerusiweb/angular
```

Requires Angular 22+. Standalone, signal-based, zoneless-friendly.

This package is the Angular binding only: the components and the signal-backed
`KerusiStateStore`. The document types, the conformance validator, the render
model and its geometry live in its peer
[`@kerusiweb/core`](https://www.npmjs.com/package/@kerusiweb/core), which is
framework-free; import them from there.

---

## `<kerusi-seatmap>`

```ts
import { KerusiSeatmapComponent } from '@kerusiweb/angular';

@Component({ imports: [KerusiSeatmapComponent], /* ... */ })
```

```html
<kerusi-seatmap
  [map]="map"
  [state]="state"
  [(selection)]="picked"
  [showLegend]="true"
  (seatDisallowed)="explain($event)"
/>
```

### Inputs

**Documents**

| Input     | Type            | Default    |                                                                             |
| --------- | --------------- | ---------- | --------------------------------------------------------------------------- |
| `map`     | `KerusiMap`     | _required_ | The static venue layout.                                                    |
| `state`   | `KerusiState`   | —          | Live availability. Merged by `Seat.id`; an absent seat is available (§5.1). |
| `session` | `KerusiSession` | —          | The optional map↔event join (§5.3). Validated against the map and state.    |

**Selection**

| Input                | Type                            | Default         |                                                                            |
| -------------------- | ------------------------------- | --------------- | -------------------------------------------------------------------------- |
| `selection`          | `readonly string[]`             | `[]`            | Selected seat ids. Two-way (`[(selection)]`) or read-only (`[selection]`). |
| `selectableStatuses` | `SeatRenderStatus[]`            | `['available']` | Which statuses a seat may be picked in.                                    |
| `companionMode`      | `'auto' \| 'independent'`       | `'auto'`        | `auto` selects a seat's whole companion closure together (§4.6).           |
| `maxSelection`       | `number`                        | —               | Cap on selected seats. Counts a companion closure as its full size.        |
| `seatSelectable`     | `(seat: RenderSeat) => boolean` | —               | A final say, applied after the status test.                                |
| `interactive`        | `boolean`                       | `true`          | `false` renders read-only.                                                 |

**Appearance**

| Input                             | Type                  | Default          |                                                                                                                                                                             |
| --------------------------------- | --------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `colors`                          | `KerusiSeatmapColors` | theme defaults   | Per-status fills, element tones, focus ring, backdrop. See [Theming](#theming) for the CSS custom properties.                                                               |
| `typeColors`                      | `boolean`             | `true`           | Let an available seat take its `SeatType.color` (§4.7).                                                                                                                     |
| `seatTypeStyles`                  | `SeatTypeStyles`      | —                | Styles for every seat of a type, keyed by `SeatType.id`. Also shown in the legend. See [From code](#from-code).                                                             |
| `seatStyle`                       | `SeatStyleFn`         | —                | A style for one seat, over its type's. Never recolours a selected or blocked seat. See [From code](#from-code).                                                             |
| `<ng-template kerusiSeat>`        | content child         | —                | Draws the inside of every seat yourself. See [Custom seat content](#custom-seat-content).                                                                                   |
| `unitScale`                       | `number`              | `1`              | CSS pixels per canvas unit, at most: the map never draws wider than `canvas.width × unitScale`. The only sizing control; the document fixes every seat's size and position. |
| `showSectionLabels`               | `boolean`             | `true`           | Draw each section's label just above its `bounds`. Only sections that declare `bounds` get one; every section's label is its group's accessible name either way.            |
| `showLegend` / `showLegendPrices` | `boolean`             | `false` / `true` |                                                                                                                                                                             |

**Sections**

| Input              | Type                                   |                                                                                          |
| ------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `sectionIds`       | `readonly string[]`                    | Render only these, in this order. Default: all, by `Section.index`.                      |
| `sectionOverrides` | `Record<string, SectionRenderOptions>` | Per-section `hidden` and `label`. A hidden section leaves its space on the canvas empty. |

**Localization, validation, lifecycle**

| Input              | Type                            | Default                      |                                                                                          |
| ------------------ | ------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| `locale`           | `string`                        | `KerusiMap.locale` ?? `'en'` | BCP-47. Resolves `Section.label` / `SeatType.label` locale maps.                         |
| `rtl`              | `boolean \| 'auto'`             | `'auto'`                     | Mirrors the whole canvas, and the arrow keys with it. `auto` derives it from the locale. |
| `ariaStrings`      | `SeatAriaStrings`               | English                      | Every announced phrase, for translation.                                                 |
| `validate`         | `'collect' \| 'throw' \| 'off'` | `'collect'`                  | `collect` reports through `validationIssues` and renders anyway.                         |
| `expireHolds`      | `boolean`                       | `false`                      | Revert a lapsed `holdExpires` to available on a ticker.                                  |
| `expiryIntervalMs` | `number`                        | `1000`                       |                                                                                          |

**Zoom, pan and maximize** (both off by default; see [Zoom, pan and maximize](#zoom-pan-and-maximize))

| Input              | Type                            | Default |                                                                                        |
| ------------------ | ------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| `zoomable`         | `boolean`                       | `false` | Pinch, Ctrl/Cmd + wheel and drag to zoom and pan; `+` `-` `0` keys; on-screen buttons. |
| `maxZoom`          | `number`                        | `4`     | The zoom ceiling, relative to fit. The floor is always fit.                            |
| `showZoomControls` | `boolean`                       | `true`  | The built-in zoom buttons. Turn off to supply your own.                                |
| `maximizable`      | `boolean`                       | `false` | A button that fills the screen with the map.                                           |
| `controlStrings`   | `Partial<KerusiControlStrings>` | English | The names of the zoom and maximize buttons, for translation.                           |

### Outputs

| Output                        | Payload                      |                                                                                                        |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `selectionChange`             | `readonly string[]`          | From the `selection` model.                                                                            |
| `seatSelect` / `seatDeselect` | `SeatInteraction`            | The `RenderSeat`, the resulting selection, and every seat that changed (companions included).          |
| `seatDisallowed`              | `SeatDisallowed`             | `reason` is `booked`, `held`, `blocked`, `not-selectable`, `max-selection` or `companion-unavailable`. |
| `seatFocus`                   | `RenderSeat`                 |                                                                                                        |
| `validationIssues`            | `readonly KerusiViolation[]` | Emitted whenever the documents change.                                                                 |
| `viewportChange`              | `KerusiViewport`             | `{ zoom, x, y }`, whenever the zoom or pan changes. Only with `zoomable`.                              |
| `maximizedChange`             | `boolean`                    | When the map is maximized or restored. Only with `maximizable`.                                        |

### The seat glyph

**Colour means seat type; shape means status.** A seat's fill is always its
`SeatType.color`, or the theme's `availableBg` when the type has none. It
does not change when the seat is held or booked. Overloading fill with both
type and status hid the type colour on exactly the seats a busy map has most
of; see the doc comment on `seatFill` for the full argument. `selected` is the
one exception: it still owns the seat's colour outright, so your own picks
are never ambiguous, and a purple fill on its own would in any case fail WCAG
1.4.1 (Use of Colour) for anyone who cannot distinguish it, hence the shape
cues below.

The seat body itself carries orientation: square-ish at the front, tapered at
the back, so which way a seat faces is legible from its outline alone.
`Seat.rotation` turns the whole group, and the taper turns with it; no
separate frame is drawn on top. This is what makes a fanned lecture theatre or
a stadium stand read at a glance. The seat number counter-rotates and stays
upright regardless.

Status is read from two marks layered over the body, never from its colour:

| State     | Fill                                           | Wash       | Occupant figure                                      |
| --------- | ---------------------------------------------- | ---------- | ---------------------------------------------------- |
| Available | type colour                                    | —          | —                                                    |
| Selected  | `selectedBg` **frame** + `selectedFg` **core** | —          | solid, tinted `selectedBg`                           |
| Held      | type colour                                    | `heldBg`   | **hollow**, stroked `heldFg` (a hold is provisional) |
| Booked    | type colour                                    | `bookedBg` | solid, tinted `bookedFg` (settled, someone else's)   |
| Blocked   | `blockedBg`                                    | —          | — (withheld by the venue; no one is there)           |

Solid vs. hollow is the main distinction (settled vs. still in progress), and
every figure leans with the seat rather than staying upright, so it doubles as
an orientation cue too.

Selection is the only state drawn from **two** tones rather than one. `selectedBg` frames the seat; `selectedFg` fills a core inside
that frame and is what the number and the figure are read against. Because the
treatment always holds a light tone and a dark one at once, one of the two
separates from the page whichever way you have themed it, so the library never
has to detect a colour scheme, and there is no `prefers-color-scheme` default to
fight with your own. An earlier revision had this inverted, a near-white rim
around a mid-purple middle, which put the low-contrast tone on the outside
boundary: a selected seat dissolved into a light page and sank into a dark one.

Both tokens therefore carry visual weight, so override them as a pair. Swapping
the two gives the inverse treatment, a light frame around a dark core, which works
just as well.

A theme that overrides `heldFg`/`bookedFg` owns the contrast of that mark
against whatever `SeatType.color` the document supplies. The library cannot
know the pairing in advance, since the figure tint is fixed while the type
colour underneath it is not. The shipped defaults are light marks over a
darkened wash, which reads across the tier colours in the demo fixtures.

The geometry is exported, if you want to draw a matching seat elsewhere:
`seatBodyPath`, `seatSelectedFrame`, `seatOccupantPath`, `seatOccupantStroke`.
(`seatRingStroke` is the old name for `seatSelectedFrame` and still resolves to
it.) A seat is always square, which makes `seatBodyPath`'s `inset` an exact
scaled copy about the centre. That is how the selected core is derived, and why
marks drawn to the core's box keep every clearance they had against the body.

### Theming

Colors resolve through three tiers, highest first:

1. A `--kerusi-*` custom property in **your** stylesheet.
2. The **`[colors]` input**: a partial `KerusiSeatmapColors`, merged over the defaults.
3. The library default.

The library never writes a `--kerusi-*` property onto its own host, which is
what keeps that order true: every fill is emitted as
`var(--kerusi-selected-bg, <the resolved input value>)`. Use whichever tier
fits: the input for values known at build time, CSS for anything that has to
respond to a media query or a theme class.

```css
kerusi-seatmap {
  --kerusi-selected-bg: #8b6ad6;
  --kerusi-available-bg: #2f6b45;
}

@media (prefers-color-scheme: dark) {
  kerusi-seatmap {
    --kerusi-element-bg: #232a36;
  }
}
```

Every key of `KerusiSeatmapColors` has a property, kebab-cased:

| Input key                             | Custom property                                             |
| ------------------------------------- | ----------------------------------------------------------- |
| `availableBg` / `availableFg`         | `--kerusi-available-bg` / `--kerusi-available-fg`           |
| `selectedBg` / `selectedFg`           | `--kerusi-selected-bg` / `--kerusi-selected-fg`             |
| `heldBg` / `heldFg`                   | `--kerusi-held-bg` / `--kerusi-held-fg`                     |
| `bookedBg` / `bookedFg`               | `--kerusi-booked-bg` / `--kerusi-booked-fg`                 |
| `blockedBg` / `blockedFg`             | `--kerusi-blocked-bg` / `--kerusi-blocked-fg`               |
| `elementBg` / `elementFg`             | `--kerusi-element-bg` / `--kerusi-element-fg`               |
| `elementAccentBg` / `elementAccentFg` | `--kerusi-element-accent-bg` / `--kerusi-element-accent-fg` |
| `elementMutedBg` / `elementMutedFg`   | `--kerusi-element-muted-bg` / `--kerusi-element-muted-fg`   |
| `focusRing`                           | `--kerusi-focus-ring`                                       |
| `backdrop`                            | `--kerusi-backdrop`                                         |

A `SeatType.color` from the document has **no theme token**, because it is
the map's own value under §4.7. It can be overridden only seat by seat (or type
by type) with `--kerusi-seat-fill`; see
[Styling individual seats](#styling-individual-seats). Turn it off wholesale
with `[typeColors]="false"` if you want the theme to own every fill.

Overriding `selectedBg` does not cost you the selected cue: the core and the
figure are shape, not color. Do set `selectedFg` alongside it, though. It is the
core's fill, so it is most of a selected seat's area rather than just a label
tint, and the two are read against each other. `heldBg`/`bookedBg` are the wash
drawn over a taken seat's type colour, not the seat's own fill. See
[The seat glyph](#the-seat-glyph) for the full state table.

If you need the pre-1.1 flat selected seat back, the core is its own node:

```css
kerusi-seatmap .kerusi-seat__core {
  display: none;
}
/* Without the core, these would be selectedBg on selectedBg. */
kerusi-seatmap .kerusi-seat--selected .kerusi-seat__label,
kerusi-seatmap .kerusi-seat--selected .kerusi-seat__occupant,
kerusi-seatmap .kerusi-seat--selected .kerusi-seat__wheelchair {
  fill: var(--kerusi-selected-fg, #f3ecff);
  stroke: none;
}
```

For anything the palette does not cover, each seat group carries class hooks:

| Class                                                           |                                            |
| --------------------------------------------------------------- | ------------------------------------------ |
| `.kerusi-seat`                                                  | Every seat group.                          |
| `.kerusi-seat--available` / `--held` / `--booked` / `--blocked` | Its `SeatStatus`.                          |
| `.kerusi-seat--selected`                                        | Currently picked.                          |
| `.kerusi-seat--unselectable`                                    | Fails the status test or `seatSelectable`. |
| `.kerusi-seat--wheelchair`                                      | `accessibility.wheelchairAccessible`.      |
| `.kerusi-seat--companion`                                       | Has companions (§4.6).                     |

Inside a seat: `.kerusi-seat__box`, `__wash`, `__core`, `__occupant`
(`__occupant--selected` / `--held` / `--booked`), `__label`, `__wheelchair`, and,
only while a [seat template](#custom-seat-content) is in use, `__focus`.

### Styling individual seats

The palette themes every seat of a status at once. To pick out _some_ seats (a
VIP block, every aisle seat, one row), select them in CSS and set the per-seat
tokens. Each seat's `<g>` carries what the document says about it:

| Attribute              | Value                                                  | Example selector                  |
| ---------------------- | ------------------------------------------------------ | --------------------------------- |
| `data-seat-id`         | `Seat.id`                                              | `[data-seat-id="12A"]`            |
| `data-seat-type`       | `Seat.type`                                            | `[data-seat-type="recliner"]`     |
| `data-seat-row`        | `Seat.row`, when the seat has one                      | `[data-seat-row="A"]`             |
| `data-seat-status`     | `available`, `held`, `booked` or `blocked`             | `[data-seat-status="held"]`       |
| `data-seat-attributes` | `Seat.attributes`, space-separated, when there are any | `[data-seat-attributes~="aisle"]` |
| `data-section-id`      | The seat's section                                     | `[data-section-id="balcony"]`     |

Two tokens then recolour the seats a selector picks out:

| Token                 | Replaces                                                       |
| --------------------- | -------------------------------------------------------------- |
| `--kerusi-seat-fill`  | The seat's own colour: its `SeatType.color`, or `availableBg`. |
| `--kerusi-seat-label` | The colour of the number drawn on it.                          |

```css
kerusi-seatmap :is(.kerusi-seat, .kerusi-legend__item)[data-seat-type='vip'] {
  --kerusi-seat-fill: #d4a017;
  --kerusi-seat-label: #000000;
}

kerusi-seatmap .kerusi-seat[data-seat-attributes~='aisle'] {
  --kerusi-seat-fill: #2f6b45;
  --kerusi-seat-label: #ffffff;
}
```

- **Per seat, not global.** The library never sets these tokens and gives them
  no map-wide default. They are meant for a selector that picks seats out;
  setting one on the map itself would repaint every seat and hide the
  document's type colours, which is what `[typeColors]="false"` and `availableBg` are for.
- **Status still shows.** They replace only the seat's own colour. A held or
  booked seat keeps it under its wash and occupant figure, while a selected seat
  keeps its selected frame and core, and a blocked seat its grey, whatever the
  tokens say. Status is never carried by colour alone.
- **Set the label with the fill.** The library cannot read a colour set in CSS,
  so it cannot choose a readable number colour for it.
- **Keep the legend in step.** Each type in the legend carries the same
  `data-seat-type`, and its swatch reads `--kerusi-seat-fill`. Include
  `.kerusi-legend__item` in a type selector, as above, and the key matches the
  map.
- **Where the rules go.** Put them in a global stylesheet. From a component's
  own stylesheet, Angular's emulated encapsulation scopes them away from the
  map's elements unless you prefix them with `::ng-deep`.

#### From code

When the choice lives in TypeScript (a recommendation, a search result, the
document's own `Seat.metadata`), use `seatTypeStyles` for whole types and
`seatStyle` for single seats. Both take a `KerusiSeatStyle`:

| Field        | Type                          |                                                                                                                    |
| ------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `fill`       | `string`                      | The seat's own colour, the same slot as `--kerusi-seat-fill`. Any CSS colour.                                      |
| `labelColor` | `string`                      | The number's colour. Defaults to black or white for a hex `fill`; set it for any other kind of colour.             |
| `className`  | `string \| readonly string[]` | Extra classes on the seat's `<g>`, for CSS that needs more than colour.                                            |
| `shape`      | `KerusiSeatShape`             | The seat's outline: `'seat'` (default), `'square'`, `'rounded'`, `'circle'`, or a function. See [Shapes](#shapes). |

```ts
import { SeatStyleFn, SeatTypeStyles } from '@kerusiweb/core';

export class VenueComponent {
  protected readonly typeStyles: SeatTypeStyles = {
    vip: { fill: '#d4a017', labelColor: '#000000' },
  };
  protected readonly highlight: SeatStyleFn = (seat) =>
    seat.source.metadata?.['bestView'] ? { fill: '#2f6b45', className: 'best-view' } : undefined;
}
```

```html
<kerusi-seatmap [map]="map" [seatTypeStyles]="typeStyles" [seatStyle]="highlight" />
```

A seat's colour resolves in this order, first match wins:

| #   | Source                                    |                                                          |
| --- | ----------------------------------------- | -------------------------------------------------------- |
| 1   | Selected                                  | `selectedBg` frame and `selectedFg` core, always.        |
| 2   | Blocked                                   | `blockedBg`, always.                                     |
| 3   | `--kerusi-seat-fill` from your stylesheet | See above.                                               |
| 4   | `seatStyle(seat)`                         | Its `fill`.                                              |
| 5   | `seatTypeStyles[seat.type]`               | Its `fill`. Applies whether or not `[typeColors]` is on. |
| 6   | `SeatType.color`                          | When `[typeColors]` is on.                               |
| 7   | `availableBg`                             | The theme.                                               |

- **Status always reads.** Neither option can change a selected or blocked
  seat's colour, and a held or booked seat keeps its wash and occupant figure
  over whatever colour it has. A style that could recolour your own picks
  would make them ambiguous. For anything beyond this, use a
  [custom seat template](#custom-seat-content).
- **Per-seat over per-type, field by field.** A `seatStyle` result replaces only
  the fields it sets, so a type's `fill` survives a per-seat `className`.
  Classes from both are kept.
- **The legend shows `seatTypeStyles`**, because a type has one value to show.
  A per-seat `seatStyle` has no single value a legend could draw.
- The function runs for every seat whenever the selection, the state or the
  theme changes, so keep it cheap.

#### Shapes

A style's `shape` changes the seat's outline. It works in `seatTypeStyles` (a
sofa type drawn rounded, say) and in `seatStyle`; for every seat at once, use
`[seatStyle]="circle"` with `circle: SeatStyleFn = () => ({ shape: 'circle' })`.

| `shape`                    |                                                                             |
| -------------------------- | --------------------------------------------------------------------------- |
| `'seat'`                   | The default: square-ish at the front, tapered at the back.                  |
| `'square'`                 | A square with the same slight corners as the seat's front.                  |
| `'rounded'`                | A square with soft corners.                                                 |
| `'circle'`                 | A circle filling the seat's box.                                            |
| `(box: SeatBox) => string` | Your own closed path `d`, drawn inside `box` (`x`, `y`, `width`, `height`). |

- **Status marks follow the shape.** The wash, the selected frame and core, and
  a seat template's focus outline are all drawn in it, and the occupant figure
  and wheelchair marker sit inside every preset.
- **Only `'seat'` shows which way a seat faces.** The other presets are
  symmetric, so on rotated seats (a fanned theatre, a stadium bowl) that cue is
  lost.
- **A function shape must draw relative to the box it is given.** It is called
  once for the seat and again for the selected core's smaller box. Leave room
  for the occupant figure (the middle 44% of the width, from 15% to 86% of the
  height) and keep the top-right corner filled for the wheelchair marker.
- **The legend draws a shaped type in its shape.** Types without a `shape`, and
  every status swatch, keep their usual swatches.

### Custom seat content

When the palette and the class hooks are not enough (an icon, a badge, a price
tag, a different shape), draw the inside of each seat yourself. Put an
`<ng-template kerusiSeat>` inside the map:

```ts
import { NgTemplateOutlet } from '@angular/common';
import { KerusiSeatmapComponent, KerusiSeatTemplateDirective } from '@kerusiweb/angular';

@Component({ imports: [KerusiSeatmapComponent, KerusiSeatTemplateDirective, NgTemplateOutlet] /* ... */ })
```

```html
<kerusi-seatmap [map]="map" [state]="state" [(selection)]="picked">
  <ng-template kerusiSeat let-seat>
    <!-- The stock seat, then a badge on top of it. -->
    <ng-container *ngTemplateOutlet="seat.defaultContent; context: { $implicit: seat }" />
    @if (seat.seat.source.metadata?.['bestView']) {
    <svg:circle
      [attr.cx]="seat.glyph.box.x + seat.glyph.box.width"
      [attr.cy]="seat.glyph.box.y"
      r="4"
      fill="gold"
    />
    }
  </ng-template>
</kerusi-seatmap>
```

**Prefix every element with `svg:`.** The template is declared outside any
`<svg>`, so without the prefix Angular creates `<circle>` as an unknown HTML
element and nothing is drawn. Control flow and `<ng-container>` need no prefix.

`let-seat` is a `SeatTemplateContext`:

| Field            | Type                                     |                                                                                                    |
| ---------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `seat`           | `RenderSeat`                             | Status, type, price, accessibility, and the document's own `source.metadata`.                      |
| `selected`       | `boolean`                                | Whether the seat is in the current selection.                                                      |
| `placed`         | `PlacedSeat`                             | The seat's box, centre, font size and rotation, in canvas units.                                   |
| `glyph`          | `SeatGlyph`                              | The stock seat, resolved by `resolveSeatGlyph()` in core: every path, paint and position it draws. |
| `defaultContent` | `TemplateRef<SeatTemplateOutletContext>` | The stock drawing. Render it with `context: { $implicit: seat }` to keep or add to it.             |

The template is stamped again whenever the selection, the state or the theme
changes, and it can sit inside an `@if` to switch it on and off at run time.

**What the library keeps.** Each seat's `<g>` stays the library's: its role,
`aria-label`, `aria-pressed`, `aria-disabled`, tab stop, `data-seat-id`, class
list, rotation and its click, focus and key handlers. Only what is drawn inside
it is yours. Keyboard navigation, selection, companions and announcements
therefore behave exactly as they do for the stock seat, and the accessible name
still comes from the library (and `ariaStrings`), whatever text you draw.

**Coordinates.** Draw in canvas units, using `glyph.box` (or
`placed`) for the seat's position and size. The `<g>` already carries the seat's
rotation, so draw it unrotated with the front at the top edge;
`glyph.label.transform` counter-rotates text so it stays upright.

**Status is yours to show.** A template replaces the stock marks, including the
occupant figure, the wash and the selected frame and core, which are what tell
held, booked and selected apart by shape rather than colour (WCAG 1.4.1). The
library's own styling options never alter those marks, so a template is the one
place that can, and it carries that responsibility. The simplest way to keep
them is to render `defaultContent` and add to it. Otherwise reuse `glyph.wash`,
`glyph.core` and `glyph.occupant`, and the `kerusi-seat__wash` and
`kerusi-seat__occupant--*` classes, which keep the stock opacity.

**Focus outline.** The stock focus ring strokes `.kerusi-seat__box`, which your
content may not have. So while a seat template is in use, the library draws one
more path in every seat, after your content: `.kerusi-seat__focus`, an outline
of the seat's body shown only on `:focus-visible`, so keyboard focus stays
visible whatever you draw (WCAG 2.4.7). It takes the same colour as the stock
ring (`--kerusi-focus-ring`, then `colors.focusRing`, then `currentColor`). It
follows the seat's outline (its [`shape`](#shapes), if a style gives one), not
your drawing; if you draw your own focus indicator, restyle or hide it with
`.kerusi-seat:focus-visible .kerusi-seat__focus`. Without a seat template it is
not rendered at all, and the markup is unchanged.

**Legend.** The legend keeps drawing the stock glyph. If your seats look very
different, turn it off and show your own key.

### Zoom, pan and maximize

Two features, both **off by default**: with them off the markup and behaviour are
exactly what they were. They are independent; turn on either or both.

On a phone a map of several hundred seats is drawn at fit-to-width, so a seat is
too small to tap. `[zoomable]="true"` lets the reader zoom in and pan; `[maximizable]="true"` adds a button
that fills the screen.

**Zoom and pan.**

- **Pinch** with two fingers on a touch screen. **Ctrl/Cmd + wheel**, or a
  trackpad pinch (Safari's included), on desktop. A plain wheel is left alone, so
  the page still scrolls.
- **Drag** with one finger or the primary mouse button to pan.
- **A tap still selects**, at any zoom level. A touch or click that moves less
  than 8 CSS pixels is a tap, and reaches the seat exactly as it does without
  `zoomable`. Anything that moves further is a drag, and a drag never selects the
  seat under it.
- **Limits.** The floor is fit-to-container, the ceiling is `maxZoom` (default
  `4`), and panning stays inside the map. A map smaller than its container, which
  happens when it is maximized on a large screen, is centred.
- **Gestures and the page.** `touch-action` is `pan-y` at fit, so a one-finger
  vertical swipe still scrolls the page while a pinch is the map's; once zoomed in
  or maximized it is `none`. With `zoomable` off, no `touch-action` is set.
- **Reduced motion.** The short transition on the zoom buttons, the keys and
  reset is dropped under `prefers-reduced-motion: reduce`. A finger or wheel moves
  the map directly and never eases.

| Key             |                                                              |
| --------------- | ------------------------------------------------------------ |
| `+` / `=`, `-`  | Zoom in / out, from anywhere inside the map                  |
| `0`             | Reset to fit                                                 |
| `←` `→` `↑` `↓` | Pan, when the zoomable viewport itself has focus (Tab to it) |

On a seat, the arrow keys keep their usual job of moving seat focus, and a seat
that takes keyboard focus is scrolled into view. Ctrl, Cmd and Alt combinations
are left to the browser, and keys typed into a field you put inside the map are
ignored.

**Controls.** The zoom buttons (zoom in, zoom out, reset to fit) are real
`<button>`s with accessible names. At a limit they set `aria-disabled` rather than
`disabled`, so keyboard focus is not thrown away mid-press. Their names come from
`controlStrings`, for translation. They use the theme's existing tokens
(`--kerusi-element-bg`, `--kerusi-element-fg`, `--kerusi-element-muted-fg`,
`--kerusi-focus-ring`), so there is nothing new to theme.

To put the controls somewhere else, turn the built-in ones off
(`[showZoomControls]="false"`) and drive the map yourself:

```ts
readonly map = viewChild.required(KerusiSeatmapComponent);
// this.map().zoomIn(); this.map().zoomOut(); this.map().resetZoom(); this.map().toggleMaximized();
// this.map().zoomToSection('balcony');
// this.map().viewport()   -> { zoom, x, y }
// this.map().maximized()  -> boolean
```

`viewportChange` reports `{ zoom, x, y }` whenever the view changes, for a host that wants
to display or persist it. (Restoring a saved view is not supported.)

**Zoom to a section.** `zoomToSection(id)` zooms to a section's declared `bounds`, as
large as the viewport allows and centred, or to the box around its seats and
elements when it declares none. It does nothing unless the map is `zoomable`.
Reset with `resetZoom()`, which shows the whole canvas again.

**Maximize.** The button fills the screen with the map and its legend, freezes the
page behind it, and swaps to an "Exit full screen" button. The layout is a fixed
overlay, which is all iPhone Safari offers; where the browser has the Fullscreen
API it is requested on top, and leaving it with the browser's own Esc leaves the
map's maximized state too. `Escape` from the map also leaves, except that on a
seat with a non-empty selection the first `Escape` still clears the selection, as
it always has. The backdrop is `--kerusi-backdrop`, or the page's own canvas colour
while that is transparent; `--kerusi-maximized-z-index` (default `1000`) sets the
stacking. A maximized zoomable map fits the whole canvas to the screen at the
canvas's own proportions. It is not a modal dialog: focus is not trapped, and an ancestor with a
`transform` or `filter` would anchor the fixed layout to itself instead of the
screen.

### Keyboard

Tab moves between sections; each section keeps its own tab stop. Within a
section, arrow keys follow §4.3.5 adjacency: along a row in `col` order, and
across an aisle (a `col` no seat occupies) rather than into it. Up and down move
to the next row and pick the seat nearest on the canvas. The arrows follow the
screen, so they swap along with a mirrored right-to-left map.

| Key                      |                                  |
| ------------------------ | -------------------------------- |
| `←` `→`                  | Previous / next seat in the row  |
| `↑` `↓`                  | Nearest seat in the adjacent row |
| `Home` / `End`           | First / last seat of the row     |
| `Ctrl+Home` / `Ctrl+End` | First / last seat of the section |
| `PageUp` / `PageDown`    | First / last seat of the section |
| `Enter` / `Space`        | Toggle                           |
| `Escape`                 | Clear the selection              |

Each seat is a `role="button"` announcing its position, whether it is next to
an aisle, its type, price and status, every `Seat.accessibility` property and its
attributes. Each section is a `role="group"` named by its label. A polite live region
reports the running selection and any disallowed reason.

With `zoomable` on there are a few more keys: see [Zoom, pan and maximize](#zoom-pan-and-maximize).

---

## `<kerusi-legend>`

Rendered inline by `[showLegend]="true"`, or placed anywhere yourself:

```html
<kerusi-legend [legend]="model.legend" [locale]="'ms'" [showPrices]="true" />
```

It resolves swatches through the same path as the seat fills, so the two cannot
drift apart. Every availability swatch, not just **Selected**, draws the
seat glyph itself (wash, ring, occupant, as it applies) rather than a flat
colour, because shape is the cue the map uses for status.

---

## Working with the format directly

All of this lives in `@kerusiweb/core` and is pure (no Angular import), so it
can run in a test, a build step or on a server.

```ts
import {
  buildRenderModel, // KerusiMap + KerusiState -> the resolved render model
  checkKerusiMap, // every violation, no throw
  validateKerusiMap, // throws on the first error
  validateDocumentSet, // map / session / state joins
  resolveSeatPrice, // the §4.9 precedence order
  resolveLocalizedText, // string | Record<string, string> -> string
  formatMoney, // minor units -> "RM 45.00", "¥1,200", "KD 12.500"
  summarizeSelection, // seats, total, unpriced count
  computeMapLayout, // every seat and element placed on the canvas
  buildNavigationGraph, // per-seat keyboard neighbours
} from '@kerusiweb/core';
```

### Validation

`checkKerusiMap` returns every violation in document order without throwing;
`validateKerusiMap` throws a `KerusiValidationError` carrying the first error
and the full list. Each violation has a stable `rule` slug, a `severity`
(`error` blocks conformance, `warning` is advisory) and a document `path`.

```ts
for (const v of checkKerusiMap(map)) {
  console.warn(`${v.severity} ${v.rule} at ${v.path}: ${v.message}`);
}
```

### Live availability

```ts
import { KerusiStateStore } from '@kerusiweb/angular';

const store = new KerusiStateStore(initialState);
socket.onmessage = (e) => {
  const result = store.apply(JSON.parse(e.data));
  if (result.outcome === 'gap') refetch(); // store.needsRefetch() is now true
};
const stop = store.startExpiryTicker();
```

Deltas that are stale, duplicate or scoped to another session are discarded.

> **Gap detection needs a sequence.** §5.2 requires `updatedAt` to be strictly
> increasing but not contiguous, so it cannot by itself distinguish "a delta was
> lost" from "nothing happened for a while". The store detects gaps when the
> transport supplies a monotonic sequence: `metadata.seq` by default, or your
> own `sequenceOf` reader. A gapped delta is still applied, so the map degrades
> rather than freezes while you re-fetch.

## Migrating from 2.x

3.0.0 follows Kerusi rev 15, where a map has **one canvas** and every seat its
own position on it. The full list of changes is in the
[CHANGELOG](https://github.com/ShadAhm/kerusiweb/blob/master/CHANGELOG.md#migrating-from-2x);
for this package:

- **Documents.** Give the map a `canvas` and a `seatSize`, and every seat and
  element an `x`/`y` in canvas units. Remove `Section.layout`,
  `Section.aspectRatio`, and an element's `row`/`col`. `row`/`col` on a seat now
  mean adjacency only.
- **Removed inputs.** `seatSize`, `seatGap` and `freeformBasis`, and
  `aspectRatio` and `seatSize` in `sectionOverrides`. The document fixes seat
  size and position now; `unitScale` is the one sizing control left.
- **Markup.** The map is one `<svg class="kerusi-seatmap__svg">`, and each section
  a `<g class="kerusi-section" data-section-id>` inside it. The per-section
  `<section class="kerusi-seatmap__section kerusi-seatmap__section--{mode}">`
  wrapper, its `<h3>` heading and the per-section `svg.kerusi-section-svg` are
  gone. A section label is drawn inside the SVG instead, only for a section
  that declares `bounds`.
- **New.** `zoomToSection(id)`, and a "next to an aisle" phrase in each seat's
  accessible name (`besideAisle` in `ariaStrings`, which you must add if you
  supply your own strings).

---

MIT © Arsyad "Shad Ahm" Ahmad
