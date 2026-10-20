# @kerusiweb/react

A React seat map that renders [Kerusi](https://github.com/ShadAhm/kerusi)
documents as interactive, accessible inline SVG.

```bash
npm install @kerusiweb/core @kerusiweb/react
```

Requires React 18.3+ or 19. Function components and hooks; no context, no
provider, no global state.

This package is the React binding only: the components and the `useKerusiState`
hook. The document types, the conformance validator, the render model and its
geometry live in its peer
[`@kerusiweb/core`](https://www.npmjs.com/package/@kerusiweb/core), which is
framework-free; import them from there.

## Import the stylesheet

Once, anywhere in your app:

```ts
import '@kerusiweb/react/styles.css';
```

It carries layout, opacity, cursor, paint order and the focus ring, and nothing
else. Every colour is bound inline by the components, so the theming tiers below
keep working.

---

## `<KerusiSeatmap>`

```tsx
import { useState } from 'react';
import { KerusiSeatmap } from '@kerusiweb/react';
import type { KerusiMap, KerusiState } from '@kerusiweb/core';
import '@kerusiweb/react/styles.css';

export function Booking({ map, state }: { map: KerusiMap; state: KerusiState }) {
  const [picked, setPicked] = useState<readonly string[]>([]);

  return (
    <KerusiSeatmap
      map={map}
      state={state}
      selection={picked}
      onSelectionChange={setPicked}
      showLegend
      onSeatDisallowed={(e) => explain(e.reason)}
    />
  );
}
```

`selection` is a plain list of seat ids. Nothing is mutated, so it works with
`useState`, a reducer, or any store you already have.

### Props

**Documents**

| Prop      | Type            | Default    |                                                                             |
| --------- | --------------- | ---------- | --------------------------------------------------------------------------- |
| `map`     | `KerusiMap`     | _required_ | The static venue layout.                                                    |
| `state`   | `KerusiState`   | —          | Live availability. Merged by `Seat.id`; an absent seat is available (§5.1). |
| `session` | `KerusiSession` | —          | The optional map↔event join (§5.3). Validated against the map and state.    |

**Selection**

| Prop                 | Type                            | Default         |                                                                                                                                     |
| -------------------- | ------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `selection`          | `readonly string[]`             | —               | Selected seat ids. Supplying this makes the component controlled.                                                                   |
| `defaultSelection`   | `readonly string[]`             | `[]`            | The initial selection when uncontrolled. Ignored if `selection` is set.                                                             |
| `onSelectionChange`  | `(selection) => void`           | —               | Fires on every change, controlled or not.                                                                                           |
| `selectableStatuses` | `SeatRenderStatus[]`            | `['available']` | Which statuses a seat may be picked in.                                                                                             |
| `companionMode`      | `'auto' \| 'independent'`       | `'auto'`        | `auto` selects a seat's whole companion closure together (§4.6).                                                                    |
| `maxSelection`       | `number`                        | —               | Cap on selected seats. Counts a companion closure as its full size.                                                                 |
| `seatSelectable`     | `(seat: RenderSeat) => boolean` | —               | A final say, applied after the status test. **Memoize it** (see below).                                                             |
| `interactive`        | `boolean`                       | `true`          | `false` turns selection off. Seats still take clicks, and stay keyboard-reachable, while `onSeatClick` or `renderClickCard` is set. |

Controlled and uncontrolled work the way they do for `<input>`: pass
`selection` + `onSelectionChange` to own it yourself, or pass neither and let
the component keep it. Passing `selection` without `onSelectionChange` renders a
selection the user cannot change. That is occasionally what you want, but
usually a mistake.

**Appearance**

| Prop                              | Type                                    | Default          |                                                                                                                                                                             |
| --------------------------------- | --------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `colors`                          | `KerusiSeatmapColors`                   | theme defaults   | Per-status fills, element tones, focus ring, backdrop. See [Theming](#theming).                                                                                             |
| `typeColors`                      | `boolean`                               | `true`           | Let an available seat take its `SeatType.color` (§4.7).                                                                                                                     |
| `seatTypeStyles`                  | `SeatTypeStyles`                        | —                | Styles for every seat of a type, keyed by `SeatType.id`. Also shown in the legend. See [From code](#from-code).                                                             |
| `seatStyle`                       | `SeatStyleFn`                           | —                | A style for one seat, over its type's. Never recolours a selected or blocked seat. See [From code](#from-code).                                                             |
| `renderSeat`                      | `(ctx: SeatRenderContext) => ReactNode` | —                | Draws the inside of every seat yourself. See [Custom seat content](#custom-seat-content).                                                                                   |
| `unitScale`                       | `number`                                | `1`              | CSS pixels per canvas unit, at most: the map never draws wider than `canvas.width × unitScale`. The only sizing control; the document fixes every seat's size and position. |
| `showSectionLabels`               | `boolean`                               | `true`           | Draw each section's label just above its `bounds`. Only sections that declare `bounds` get one; every section's label is its group's accessible name either way.            |
| `showLegend` / `showLegendPrices` | `boolean`                               | `false` / `true` |                                                                                                                                                                             |
| `className` / `style`             | —                                       | —                | Applied to the root element, alongside `kerusi-seatmap`.                                                                                                                    |

**Sections**

| Prop               | Type                                   |                                                                                          |
| ------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `sectionIds`       | `readonly string[]`                    | Render only these, in this order. Default: all, by `Section.index`.                      |
| `sectionOverrides` | `Record<string, SectionRenderOptions>` | Per-section `hidden` and `label`. A hidden section leaves its space on the canvas empty. |

**Localization, validation, lifecycle**

| Prop               | Type                            | Default                      |                                                                                          |
| ------------------ | ------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| `locale`           | `string`                        | `KerusiMap.locale` ?? `'en'` | BCP-47. Resolves `Section.label` / `SeatType.label` locale maps.                         |
| `rtl`              | `boolean \| 'auto'`             | `'auto'`                     | Mirrors the whole canvas, and the arrow keys with it. `auto` derives it from the locale. |
| `ariaStrings`      | `SeatAriaStrings`               | English                      | Every announced phrase, for translation.                                                 |
| `validate`         | `'collect' \| 'throw' \| 'off'` | `'collect'`                  | `collect` reports through `onValidationIssues` and renders anyway.                       |
| `expireHolds`      | `boolean`                       | `false`                      | Revert a lapsed `holdExpires` to available on a ticker.                                  |
| `expiryIntervalMs` | `number`                        | `1000`                       |                                                                                          |

`validate="throw"` throws a `KerusiValidationError` **during render**, so an
error boundary catches it. `collect` never throws.

**Zoom, pan and maximize** (both off by default; see [Zoom, pan and maximize](#zoom-pan-and-maximize))

| Prop               | Type                            | Default |                                                                                        |
| ------------------ | ------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| `zoomable`         | `boolean`                       | `false` | Pinch, Ctrl/Cmd + wheel and drag to zoom and pan; `+` `-` `0` keys; on-screen buttons. |
| `maxZoom`          | `number`                        | `4`     | The zoom ceiling, relative to fit. The floor is always fit.                            |
| `showZoomControls` | `boolean`                       | `true`  | The built-in zoom buttons. Turn off to supply your own.                                |
| `maximizable`      | `boolean`                       | `false` | A button that fills the screen with the map.                                           |
| `controlStrings`   | `Partial<KerusiControlStrings>` | English | The names of the zoom and maximize buttons, for translation.                           |

### Callbacks

| Prop                              | Payload                      |                                                                                                        |
| --------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `onSelectionChange`               | `readonly string[]`          | The selection after the change.                                                                        |
| `onSeatSelect` / `onSeatDeselect` | `SeatInteraction`            | The `RenderSeat`, the resulting selection, and every seat that changed (companions included).          |
| `onSeatDisallowed`                | `SeatDisallowed`             | `reason` is `booked`, `held`, `blocked`, `not-selectable`, `max-selection` or `companion-unavailable`. |
| `onSeatFocus`                     | `RenderSeat`                 |                                                                                                        |
| `onSeatHover`                     | `RenderSeat \| null`         | The seat under the pointer, then `null` when it leaves. See [Hover and click](#hover-and-click).       |
| `onSeatClick`                     | `SeatClick`                  | Every seat activation: `{ seat, selected, source }`. Read-only; fires before the selection callbacks.  |
| `onValidationIssues`              | `readonly KerusiViolation[]` | Called whenever the documents change.                                                                  |
| `onViewportChange`                | `KerusiViewport`             | `{ zoom, x, y }`, whenever the zoom or pan changes. Only with `zoomable`.                              |
| `onMaximizedChange`               | `boolean`                    | When the map is maximized or restored. Only with `maximizable`.                                        |

### The `ref`

```tsx
const map = useRef<KerusiSeatmapHandle>(null);
// map.current.summary    -> { seats, total, unpriced }
// map.current.focusSeat('A12')
// map.current.openSeatCard('A12') / closeSeatCard() / openSeatCardId
// map.current.viewport    -> { zoom, x, y }
// map.current.zoomIn() / zoomOut() / resetZoom() / toggleMaximized()
// map.current.zoomToSection('balcony')
```

### Memoizing props

The render model is rebuilt whenever `map`, `state` or the interaction props
change identity. Object and function props declared inline get a new identity
every render, so hoist or memoize the ones that are not primitives:

```tsx
const seatSelectable = useCallback((seat: RenderSeat) => seat.price != null, []);
const colors = useMemo(() => ({ selectedBg: '#8b6ad6' }), []);
```

`map` and `state` are usually stable already if they come from state or a query
cache. `selectableStatuses` and `sectionOverrides` have stable defaults, so you
only need to think about them if you pass your own.

### The seat glyph

**Colour means seat type; shape means status.** A seat's fill is always its
`SeatType.color`, or the theme's `availableBg` when the type has none. It does
not change when the seat is held or booked. `selected` is the one
exception: it owns the seat's colour outright, so your own picks are never
ambiguous, and a purple fill on its own would in any case fail WCAG 1.4.1 (Use
of Colour) for anyone who cannot distinguish it, hence the shape cues. Held
seats take a wash and a hollow occupant figure; booked ones a wash and a solid
figure; selected ones a bright core inside a frame.

### Theming

Colors resolve through three tiers, highest first:

1. A `--kerusi-*` custom property in **your** stylesheet.
2. The **`colors` prop**: a partial `KerusiSeatmapColors`, merged over the defaults.
3. The library default.

The library never writes a `--kerusi-*` property onto its own root, which is
what keeps that order true: every fill is emitted as
`var(--kerusi-selected-bg, <the resolved prop value>)`. Use whichever tier fits:
the prop for values known at build time, CSS for anything that has to respond
to a media query or a theme class.

```css
.kerusi-seatmap {
  --kerusi-selected-bg: #8b6ad6;
  --kerusi-available-bg: #2f6b45;
}

@media (prefers-color-scheme: dark) {
  .kerusi-seatmap {
    --kerusi-element-bg: #232a36;
  }
}
```

Every key of `KerusiSeatmapColors` has a property, kebab-cased:

| Prop key                              | Custom property                                             |
| ------------------------------------- | ----------------------------------------------------------- |
| `availableBg` / `availableFg`         | `--kerusi-available-bg` / `--kerusi-available-fg`           |
| `selectedBg` / `selectedFg`           | `--kerusi-selected-bg` / `--kerusi-selected-fg`             |
| `heldBg` / `heldFg`                   | `--kerusi-held-bg` / `--kerusi-held-fg`                     |
| `bookedBg` / `bookedFg`               | `--kerusi-booked-bg` / `--kerusi-booked-fg`                 |
| `blockedBg` / `blockedFg`             | `--kerusi-blocked-bg` / `--kerusi-blocked-fg`               |
| `elementBg` / `elementFg`             | `--kerusi-element-bg` / `--kerusi-element-fg`               |
| `elementAccentBg` / `elementAccentFg` | `--kerusi-element-accent-bg` / `--kerusi-element-accent-fg` |
| `elementMutedBg` / `elementMutedFg`   | `--kerusi-element-muted-bg` / `--kerusi-element-muted-fg`   |
| `groupFill` / `groupStroke`           | `--kerusi-group-fill` / `--kerusi-group-stroke`             |
| `groupDetail`                         | `--kerusi-group-detail`                                     |
| `focusRing`                           | `--kerusi-focus-ring`                                       |
| `backdrop`                            | `--kerusi-backdrop`                                         |

A `SeatType.color` from the document has **no theme token**, because it is the
map's own value under §4.7. It can be overridden only seat by seat (or type by
type) with `--kerusi-seat-fill`; see
[Styling individual seats](#styling-individual-seats). Turn it off wholesale
with `typeColors={false}` if you want the theme to own every fill.

For anything the palette does not cover, each seat group carries the same class
hooks as the Angular binding (`.kerusi-seat`, `--available` / `--held` /
`--booked` / `--blocked`, `--selected`, `--unselectable`, `--wheelchair`,
`--companion`), and inside a seat: `.kerusi-seat__box`, `__wash`, `__core`,
`__occupant` (`__occupant--selected` / `--held` / `--booked`), `__label`,
`__wheelchair`, and, only while `renderSeat` is set, `__focus`.

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
.kerusi-seatmap :is(.kerusi-seat, .kerusi-legend__item)[data-seat-type='vip'] {
  --kerusi-seat-fill: #d4a017;
  --kerusi-seat-label: #000000;
}

.kerusi-seatmap .kerusi-seat[data-seat-attributes~='aisle'] {
  --kerusi-seat-fill: #2f6b45;
  --kerusi-seat-label: #ffffff;
}
```

- **Per seat, not global.** The library never sets these tokens and gives them
  no map-wide default. They are meant for a selector that picks seats out;
  setting one on the map itself would repaint every seat and hide the
  document's type colours, which is what `typeColors={false}` and `availableBg` are for.
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

#### From code

When the choice lives in TypeScript (a recommendation, a search result, the
document's own `Seat.metadata`), use `seatTypeStyles` for whole types and
`seatStyle` for single seats. Both take a `KerusiSeatStyle`:

| Field        | Type                          |                                                                                                                                      |
| ------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `fill`       | `string`                      | The seat's own colour, the same slot as `--kerusi-seat-fill`. Any CSS colour.                                                        |
| `labelColor` | `string`                      | The number's colour. Defaults to black or white for a hex `fill`; set it for any other kind of colour.                               |
| `className`  | `string \| readonly string[]` | Extra classes on the seat's `<g>`, for CSS that needs more than colour.                                                              |
| `shape`      | `KerusiSeatShape`             | The seat's outline: `'seat'` (default), `'square'`, `'rounded'`, `'circle'`, a seat form name, or a function. See [Shapes](#shapes). |

```tsx
import type { SeatStyleFn, SeatTypeStyles } from '@kerusiweb/core';

const typeStyles: SeatTypeStyles = { vip: { fill: '#d4a017', labelColor: '#000000' } };
const highlight: SeatStyleFn = (seat) =>
  seat.source.metadata?.['bestView'] ? { fill: '#2f6b45', className: 'best-view' } : undefined;

<KerusiSeatmap map={map} seatTypeStyles={typeStyles} seatStyle={highlight} />;
```

A seat's colour resolves in this order, first match wins:

| #   | Source                                    |                                                        |
| --- | ----------------------------------------- | ------------------------------------------------------ |
| 1   | Selected                                  | `selectedBg` frame and `selectedFg` core, always.      |
| 2   | Blocked                                   | `blockedBg`, always.                                   |
| 3   | `--kerusi-seat-fill` from your stylesheet | See above.                                             |
| 4   | `seatStyle(seat)`                         | Its `fill`.                                            |
| 5   | `seatTypeStyles[seat.type]`               | Its `fill`. Applies whether or not `typeColors` is on. |
| 6   | `SeatType.color`                          | When `typeColors` is on.                               |
| 7   | `availableBg`                             | The theme.                                             |

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
- The function runs for every seat on every render of the map, so keep it
  cheap. A new function or object each render is fine, since neither rebuilds the
  render model, but declaring them once outside the component is simplest.

#### Shapes

A style's `shape` changes the seat's outline. It works in `seatTypeStyles` (a
sofa type drawn rounded, say) and in `seatStyle`; for every seat at once, use
`seatStyle={() => ({ shape: 'circle' })}`.

| `shape`                    |                                                                                |
| -------------------------- | ------------------------------------------------------------------------------ |
| `'seat'`                   | The default: square-ish at the front, tapered at the back.                     |
| `'square'`                 | A square with the same slight corners as the seat's front.                     |
| `'rounded'`                | A square with soft corners.                                                    |
| `'circle'`                 | A circle filling the seat's box.                                               |
| `'armchair'`               | A tub chair seen from above: arms stand forward either side of a dipped front. |
| `'stool'`                  | A round top with no back.                                                      |
| `'recliner'`               | A narrow footrest at the front of a tapered body.                              |
| `'beanbag'`                | A slumped pear, narrow at the front and heavy at the back.                     |
| `'cushion'`                | A flat pillow with pinched corners.                                            |
| `'wheelchair-space'`       | An open rim with nothing in it: a space, not a chair.                          |
| `'sofa'`                   | One place on a sofa: a cushion between shoulders standing proud at the back.   |
| `'bench'`                  | One place on a pew: a low, square-cornered slab.                               |
| `(box: SeatBox) => string` | Your own closed path `d`, drawn inside `box` (`x`, `y`, `width`, `height`).    |

- **A document's `form` picks the default shape.** `SeatType.form` (§4.7.1) draws
  the preset of the same name, in the seat and in the legend, so an armchair
  type looks like one with no styling at all. `chair`, a missing `form` and a
  form this library does not know draw `'seat'`. A `shape` from `seatStyle` or
  `seatTypeStyles` always wins over the document's form.
- **Status marks follow the shape.** The wash, the selected frame and core, and
  a seat template's focus outline are all drawn in it, and the occupant figure
  and wheelchair marker sit inside every preset.
- **`'seat'` and the form presets show which way a seat faces.** `'square'`,
  `'rounded'` and `'circle'` are symmetric, so on rotated seats (a fanned
  theatre, a stadium bowl) that cue is lost. Every form is drawn facing up at
  `rotation` 0 and turns with its seat.
- **A function shape must draw relative to the box it is given.** It is called
  once for the seat and again for the selected core's smaller box. Leave room
  for the occupant figure (the middle 44% of the width, from 15% to 86% of the
  height) and keep the top-right corner filled for the wheelchair marker.
- **The legend draws a shaped type in its shape.** Types without a `shape`, and
  every status swatch, keep their usual swatches.

### Groups: tables, sofas and pews

A Kerusi section can name **groups** (§4.11): the chairs round a table, the
places on a sofa or pew, a booth. A group lists its seats, says what `kind` of
piece it is, and may give the piece a footprint, a `rect` or a `circle`, that
the map draws under its seats. Without one, a round table is a ring of chairs
with nothing in the middle.

```json
{
  "id": "table-3",
  "kind": "table",
  "label": "Table 3",
  "seats": ["T3-1", "T3-2", "T3-3", "T3-4"],
  "shape": { "circle": { "center": [300, 240], "radius": 48 } }
}
```

- **Drawn under the seats.** Each footprint is a
  `<g class="kerusi-group kerusi-group--{kind}" data-group-id data-group-kind>`
  inside its section's `<g>`. `table`, `sofa`, `loveseat`, `pew`, `bench` and
  `booth` have a look of their own (a cloth, a back and arms, slats); any other
  kind, `box` and `companion` included, draws as its plain shape. A group with
  no shape draws nothing extra. A `rect` is centred on its `x`/`y` and turned
  like an element, and its front is its top edge, so a sofa's back is its
  bottom edge.
- **Styled by tokens.** The footprint takes `--kerusi-group-fill`,
  `--kerusi-group-stroke` and `--kerusi-group-detail` (the cloth, back and arms),
  then `colors.groupFill`, `colors.groupStroke` and `colors.groupDetail`. A
  kind can override any of them: `--kerusi-group-table-fill`,
  `--kerusi-group-sofa-detail`, and so on. Keep them quiet next to the seats,
  because the held and booked wash, the figure and the selected frame are drawn
  over them.
- **Not interactive.** A footprint is decoration: it is hidden from assistive
  technology and takes no pointer, so a press on a tabletop selects nothing and
  a drag across it still pans. Seat hit-testing, the tab stop and the arrow keys
  are the same as without groups.
- **Announced.** A group with a `label` wraps its seats in a
  `<g class="kerusi-group-seats" role="group" aria-label="Table 3">`, and each
  of its seats is announced by it: "Table 3, seat 4, Guest, ...". Words come from
  `ariaStrings.groupSeat`, which is optional; leave it out and the English
  default is used. A group with no label has no name to give, so its seats are
  drawn like any other. A seat's hover and click card context carries its
  `group`.
- **Mirrors and hides with its section.** In right-to-left a footprint mirrors
  with the canvas (D3), and a hidden section hides its groups (D4).

This draws and names groups only. Booking a group whole is a separate release.

### Custom seat content

When the palette and the class hooks are not enough (an icon, a badge, a price
tag, a different shape), draw the inside of each seat yourself with
`renderSeat`. It returns SVG, in canvas units:

```tsx
import { KerusiSeatmap } from '@kerusiweb/react';
import type { SeatRenderContext } from '@kerusiweb/react';

function drawSeat({ seat, glyph, defaultContent }: SeatRenderContext) {
  return (
    <>
      {/* The stock seat, then a badge on top of it. */}
      {defaultContent}
      {seat.source.metadata?.['bestView'] ? (
        <circle cx={glyph.box.x + glyph.box.width} cy={glyph.box.y} r={4} fill="gold" />
      ) : null}
    </>
  );
}

<KerusiSeatmap map={map} state={state} renderSeat={drawSeat} />;
```

`renderSeat` receives a `SeatRenderContext`:

| Field            | Type         |                                                                                                    |
| ---------------- | ------------ | -------------------------------------------------------------------------------------------------- |
| `seat`           | `RenderSeat` | Status, type, price, accessibility, and the document's own `source.metadata`.                      |
| `selected`       | `boolean`    | Whether the seat is in the current selection.                                                      |
| `placed`         | `PlacedSeat` | The seat's box, centre, font size and rotation, in canvas units.                                   |
| `glyph`          | `SeatGlyph`  | The stock seat, resolved by `resolveSeatGlyph()` in core: every path, paint and position it draws. |
| `defaultContent` | `ReactNode`  | The stock drawing, as a fragment. Return it to keep the stock seat, or place it beside your marks. |

It runs for every seat on every render of the map. A new function each render
is fine, since it does not rebuild the render model, but declaring it once
outside the component is simplest.

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
too small to tap. `zoomable` lets the reader zoom in and pan; `maximizable` adds a button
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
`controlStrings`, for translation. They are one compact bar (32px buttons, 44px
on touch screens) coloured from the theme's existing tokens
(`--kerusi-element-bg`, `--kerusi-element-fg`, `--kerusi-element-muted-fg`,
`--kerusi-focus-ring`).

To restyle them, set any of these in your own stylesheet; each beats the theme
colours without `!important`:

| Token                          | Default                                            |
| ------------------------------ | -------------------------------------------------- |
| `--kerusi-control-size`        | `2rem` (`2.75rem` on touch screens)                |
| `--kerusi-control-icon-size`   | `1rem`                                             |
| `--kerusi-control-icon-stroke` | `1.75`                                             |
| `--kerusi-control-radius`      | `0.5rem`                                           |
| `--kerusi-control-shadow`      | `0 1px 3px rgb(0 0 0 / 0.14)`                      |
| `--kerusi-control-bg`          | `--kerusi-element-bg`                              |
| `--kerusi-control-fg`          | `--kerusi-element-fg`                              |
| `--kerusi-control-border`      | `--kerusi-element-muted-fg` at 40%                 |
| `--kerusi-control-hover-bg`    | the foreground mixed 10% (18% pressed) into the bg |

```css
.kerusi-seatmap {
  --kerusi-control-size: 2.5rem;
  --kerusi-control-radius: 999px;
  --kerusi-control-bg: #1b1f27;
  --kerusi-control-fg: #fff;
}
```

The classes `.kerusi-toolbar`, `.kerusi-control` and `.kerusi-control--zoom-in`,
`--zoom-out`, `--zoom-reset` and `--maximize` are there for anything the tokens
do not cover.

To put the controls somewhere else, turn the built-in ones off
(`showZoomControls={false}`) and drive the map yourself:

```tsx
const map = useRef<KerusiSeatmapHandle>(null);
// map.current.zoomIn(); map.current.zoomOut(); map.current.resetZoom(); map.current.toggleMaximized();
// map.current.zoomToSection('balcony');
// map.current.viewport   -> { zoom, x, y }
// map.current.maximized  -> boolean
```

`onViewportChange` reports `{ zoom, x, y }` whenever the view changes, for a host that wants
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

### Hover and click

What happens when the pointer **hovers** a seat, and what happens when a seat is **clicked**, are decided separately, and each is optional (D10). Nothing is on by default: a map with none of the props below renders and behaves exactly as it always did.

| Hover    | Click    | How                                                                     |
| -------- | -------- | ----------------------------------------------------------------------- |
| nothing  | nothing  | The default: no new markup, no new behaviour.                           |
| card     | nothing  | A read-only "who sits where" map: point at a seat to see who booked it. |
| nothing  | card     | A booking map: tap a seat to see its price and perks in a card.         |
| card     | card     | A short tooltip on hover, plus a fuller card with actions on click.     |
| callback | callback | Your own UI: the library only reports the events.                       |

Two layers ship, and each is useful without the other: **events**, which report the seat and nothing more (below), and optional [**seat cards**](#seat-cards), which show a card anchored to the seat.

```tsx
<KerusiSeatmap
  map={map}
  state={state}
  interactive={false}
  onSeatHover={(seat) => setHovered(seat?.id ?? null)} // RenderSeat | null
  onSeatClick={({ seat, selected, source }) => openDetail(seat.id)}
  onSeatFocus={(seat) => setHovered(seat.id)} // the same detail for a seat focused by keyboard
/>
```

**`onSeatHover(seat: RenderSeat | null)`**

- Called with the seat under the pointer when it enters a seat, and with `null` when it leaves the seat or the map. It is not called again while the pointer moves within the same seat.
- The payload is the `RenderSeat` that `onSeatDisallowed` gets: id, label, row label, section, status, type, price, accessibility and `source.metadata`.
- **Mouse and pen only.** Touch has no hover, and a tap behaves as it always did.
- **Not fired while the map is panned or zoomed.** The hovered seat is cleared (`null`) once when a drag, pinch or wheel zoom starts, and hover resumes on the next pointer move after it ends.
- Fires on a map with `interactive={false}` too, and with a custom `renderSeat`. It works at any zoom and in full screen.

**`onSeatClick({ seat, selected, source })`**

- Called on **every** activation of **any** seat, whether or not it can be selected: booked, held and blocked seats included. This is the supported way to react to a click on a booked seat, in place of catching `onSeatDisallowed`.
- `selected` is whether the seat was selected **before** the click. `source` is `'pointer'` (a click or tap) or `'keyboard'` (Enter or Space on a focused seat).
- It fires before the selection callbacks for the same click, and it is **read-only** (D13): it cannot cancel or change what the click does. `onSeatSelect`, `onSeatDeselect` and `onSeatDisallowed` fire exactly as they do without it.
- To show details _without_ selecting, turn selection off with props that already exist: `interactive={false}`, `selectableStatuses={[]}` or `seatSelectable`.
- A tap that turns into a pan is never a click.

**`interactive={false}` and clicks (D14).** `false` turns selection off. Seats still take clicks, and stay reachable by Tab and the arrow keys, while `onSeatClick` or `renderClickCard` is set: Enter and Space then activate the click behaviour, with no toggle and no `aria-pressed`. There is no extra prop: setting one of them turns this on, and removing both turns it off again, back to a read-only map's usual markup. A hover card that follows keyboard focus (`hoverCardOnFocus`) makes the seats reachable too.

### Seat cards

A floating card anchored to a seat: **one card element, two triggers**, and you choose which to use. The library handles positioning, dismissal, zoom, full screen, touch and accessibility. **What a card says is yours** (D10): with neither function set, nothing is rendered and the markup is unchanged.

```tsx
<KerusiSeatmap
  map={map}
  state={state}
  interactive={false}
  // Shown while a seat is hovered. Return null for no card on this seat.
  renderHoverCard={({ seat }) =>
    seat.status === 'booked' ? <span>{bookings[seat.id]?.name}</span> : null
  }
  // Opened on click, tap or Enter. Stays open until dismissed.
  renderClickCard={({ seat, close }) => <BookingDetail id={seat.id} onDone={close} />}
  seatCardPlacement="top" // 'top' | 'bottom' | 'left' | 'right' | 'auto'
  hoverCardDelay={{ open: 150, close: 100 }}
  hoverCardOnFocus // opt in: also show the hover card on keyboard focus
/>
```

Both functions are handed a `KerusiSeatCardContext`:

| Field      | Type                            |                                                                      |
| ---------- | ------------------------------- | -------------------------------------------------------------------- |
| `seat`     | `RenderSeat`                    | Everything the document knows about the seat, already resolved.      |
| `selected` | `boolean`                       | Whether the seat is in the current selection.                        |
| `trigger`  | `'hover' \| 'focus' \| 'click'` | What opened the card. `'focus'` only occurs with `hoverCardOnFocus`. |
| `close`    | `() => void`                    | Closes the card. Most useful for a click card's own buttons.         |

| Prop                 | Type                                               | Default                     |                                                                                 |
| -------------------- | -------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------- |
| `renderHoverCard`    | `(ctx: KerusiSeatCardContext) => ReactNode`        | —                           | The card shown on hover. Never shown for touch.                                 |
| `renderClickCard`    | `(ctx: KerusiSeatCardContext) => ReactNode`        | —                           | The card opened by a click, a tap or Enter/Space.                               |
| `seatCardPlacement`  | `'top' \| 'bottom' \| 'left' \| 'right' \| 'auto'` | `'top'`                     | The side it prefers. It flips when it would overflow the map.                   |
| `seatCardClassName`  | `string`                                           | —                           | Extra classes on the card element.                                              |
| `seatCardAppearance` | `'default' \| 'none'`                              | `'default'`                 | `none` drops the library's chrome.                                              |
| `hoverCardDelay`     | `{ open?: number; close?: number }`                | `{ open: 150, close: 100 }` | Milliseconds before a hover card opens, and after the pointer leaves it closes. |
| `hoverCardOnFocus`   | `boolean`                                          | `false`                     | Also show the hover card on keyboard focus (D12).                               |

|                              | Hover card                                                                                                                         | Click card                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Opens on**                 | The pointer entering a seat, after `hoverCardDelay.open`. Keyboard focus too, **only** with `hoverCardOnFocus`.                    | A click, a tap, or Enter/Space on a seat.                                                                                              |
| **Closes on**                | The pointer leaving both the seat and the card (after `hoverCardDelay.close`), focus leaving, `Escape`, or a pan or zoom starting. | `Escape`, a press outside the card and the seats, a second click on the same seat, `close()`, or another seat's click card opening.    |
| **Touch**                    | Never shown.                                                                                                                       | Shown: a tap is the trigger.                                                                                                           |
| **The pointer can enter it** | Yes. The close delay lets it travel in to select text or follow a link (WCAG 1.4.13).                                              | Yes.                                                                                                                                   |
| **ARIA**                     | `role="tooltip"`, wired to the seat with `aria-describedby`.                                                                       | A non-modal `role="dialog"` labelled by the seat. Focus moves into it when opened from the keyboard, and returns to the seat on close. |
| **With both set**            | While a seat's click card is open, its hover card is hidden.                                                                       |                                                                                                                                        |

- **A click on a selectable seat toggles it and opens the click card.** Neither the card nor `onSeatClick` can stop the toggle (D13).
- **Keyboard users and hover cards.** With `hoverCardOnFocus` off (the default), a hover card is pointer-only, so it must not be the only place important information lives. For keyboard parity use `hoverCardOnFocus`, a click card, or `onSeatFocus` beside `onSeatHover`.
- **Return `null` (or nothing) from a render function** for no card on that seat: show cards for booked seats only, for example.
- **Positioning.** The card is anchored to the seat's on-screen box and **follows zoom and pan**. It flips to the opposite side when it would overflow the map, and is clamped inside it. It is rendered inside `.kerusi-seatmap`, outside the clipped viewport, so it shows in full screen and inherits the `--kerusi-*` properties set on the map.
- **Live state.** If the seat's status changes while a card is open, the card re-renders with the new `RenderSeat`. If the seat disappears (a hidden section, say), the card closes.
- **`Escape`** closes a card before it does anything else: a second `Escape` then clears the selection, or leaves a maximized map.

`openSeatCard(seatId)`, `closeSeatCard()` and `openSeatCardId` are on the [`ref`](#the-ref), to open a click card from a search result, say.

### Styling seat cards

The library's stylesheet sets **structure only** (position, stacking, pointer events, the arrow's geometry), plus a plain default look built entirely from custom properties. The app owns the rest. From the smallest change to the largest:

1. **Tokens.** Set any of these on `.kerusi-seatmap` or any ancestor. The library never sets one on its own root, so a value you set always wins (the same precedence as [Theming](#theming)).

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

`--kerusi-seat-card-offset` and `--kerusi-seat-card-arrow-size` are read as numbers by the placement code, so give them `px`, `rem` or `em`. The card sits inside the map's root, which is itself the stacking context while maximized, so it is always above the map without touching `--kerusi-maximized-z-index`.

2. **Class and attribute hooks**, for anything the tokens don't cover: `.kerusi-seat-card`, `.kerusi-seat-card--hover` / `--click`, `.kerusi-seat-card__body`, `.kerusi-seat-card__arrow`; `data-placement="top|bottom|left|right"` (the side actually used, after any flip); and `data-seat-id`, `data-seat-status`, `data-seat-type` and `data-section-id`, mirroring the seat's own attributes. Every library rule has no specificity (it is wrapped in `:where()`), so a single class of yours wins without `!important`.

   ```css
   .kerusi-seat-card[data-seat-status='booked'] {
     --kerusi-seat-card-border: 2px solid #e5707e;
   }
   ```

3. **Your own classes**, for Tailwind or a design-system class: `seatCardClassName="my-seat-card"`.
4. **No chrome at all.** `seatCardAppearance="none"` drops the background, border, padding, shadow and arrow, leaving only positioning, so your content _is_ the card.
5. **The content is your own markup**, styled however your app styles markup. In React it is plain JSX.
6. **Motion.** A short fade and scale on open, removed under `prefers-reduced-motion: reduce`. Override it with `.kerusi-seat-card { transition: none; animation: none }`.

```tsx
<KerusiSeatmap
  map={map}
  seatCardClassName="rounded-xl shadow-lg"
  seatCardAppearance="none" // your content is the card
  renderClickCard={({ seat }) => <MyCard seat={seat} />}
/>
```

### Keyboard

Tab moves between sections; each section keeps its own tab stop. Within a
section, arrow keys follow §4.3.5 adjacency: along a row in `col` order, and
across an aisle (a `col` no seat occupies) rather than into it. Up and down move
to the next row and pick the seat nearest on the canvas. The arrows follow the
screen, so they swap along with a mirrored right-to-left map.

| Key                      |                                        |
| ------------------------ | -------------------------------------- |
| `←` `→`                  | Previous / next seat in the row        |
| `↑` `↓`                  | Nearest seat in the adjacent row       |
| `Home` / `End`           | First / last seat of the row           |
| `Ctrl+Home` / `Ctrl+End` | First / last seat of the section       |
| `PageUp` / `PageDown`    | First / last seat of the section       |
| `Enter` / `Space`        | Toggle, and open a click card          |
| `Escape`                 | Close a card; else clear the selection |

Each seat is a `role="button"` announcing its position, whether it is next to
an aisle, its type, price and status, every `Seat.accessibility` property and its
attributes. Each section is a `role="group"` named by its label. A polite live region
reports the running selection and any disallowed reason.

With `zoomable` on there are a few more keys: see [Zoom, pan and maximize](#zoom-pan-and-maximize).

---

## `<KerusiLegend>`

Rendered inline by `showLegend`, or placed anywhere yourself:

```tsx
<KerusiLegend legend={model.legend} locale="ms" showPrices />
```

It resolves swatches through the same path as the seat fills, so the two cannot
drift apart. Every availability swatch, not just **Selected**, draws the seat
glyph itself rather than a flat colour, because shape is the cue the map uses
for status.

---

## `useKerusiState`

Live availability, fed by deltas from whatever transport you use. The ordering,
gap detection and hold expiry all come from `@kerusiweb/core`; the hook only
holds them in React state.

```tsx
const availability = useKerusiState(initialState, { expiryIntervalMs: 1000 });

useEffect(() => {
  const socket = new WebSocket(url);
  socket.onmessage = (e) => {
    if (availability.apply(JSON.parse(e.data)).outcome === 'gap') {
      refetch().then(availability.reset);
    }
  };
  return () => socket.close();
}, [availability.apply, availability.reset]);

<KerusiSeatmap map={map} state={availability.state} />;
```

`apply`, `reset` and `tick` keep a stable identity across renders, so an effect
can subscribe once. It also exposes `needsRefetch` and `heldSeats`: every
currently-held seat with the time left on its hold, soonest first.

Deltas that are stale, duplicate or scoped to another session are discarded.

> **Gap detection needs a sequence.** §5.2 requires `updatedAt` to be strictly
> increasing but not contiguous, so it cannot by itself distinguish "a delta was
> lost" from "nothing happened for a while". The hook detects gaps when the
> transport supplies a monotonic sequence: `metadata.seq` by default, or your
> own `sequenceOf` reader. A gapped delta is still applied, so the map degrades
> rather than freezes while you re-fetch.

---

## Working with the format directly

All of this lives in `@kerusiweb/core` and is pure (no React import), so it can
run in a test, a build step, a server component or a route loader.

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

## Migrating from 2.x

3.0.0 follows Kerusi rev 15, where a map has **one canvas** and every seat its
own position on it. The full list of changes is in the
[CHANGELOG](https://github.com/ShadAhm/kerusiweb/blob/master/CHANGELOG.md#migrating-from-2x);
for this package:

- **Documents.** Give the map a `canvas` and a `seatSize`, and every seat and
  element an `x`/`y` in canvas units. Remove `Section.layout`,
  `Section.aspectRatio`, and an element's `row`/`col`. `row`/`col` on a seat now
  mean adjacency only.
- **Removed props.** `seatSize`, `seatGap` and `freeformBasis`, and
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
