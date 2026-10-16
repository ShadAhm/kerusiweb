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

| Prop                 | Type                            | Default         |                                                                         |
| -------------------- | ------------------------------- | --------------- | ----------------------------------------------------------------------- |
| `selection`          | `readonly string[]`             | —               | Selected seat ids. Supplying this makes the component controlled.       |
| `defaultSelection`   | `readonly string[]`             | `[]`            | The initial selection when uncontrolled. Ignored if `selection` is set. |
| `onSelectionChange`  | `(selection) => void`           | —               | Fires on every change, controlled or not.                               |
| `selectableStatuses` | `SeatRenderStatus[]`            | `['available']` | Which statuses a seat may be picked in.                                 |
| `companionMode`      | `'auto' \| 'independent'`       | `'auto'`        | `auto` selects a seat's whole companion closure together (§4.6).        |
| `maxSelection`       | `number`                        | —               | Cap on selected seats. Counts a companion closure as its full size.     |
| `seatSelectable`     | `(seat: RenderSeat) => boolean` | —               | A final say, applied after the status test. **Memoize it** (see below). |
| `interactive`        | `boolean`                       | `true`          | `false` renders read-only.                                              |

Controlled and uncontrolled work the way they do for `<input>`: pass
`selection` + `onSelectionChange` to own it yourself, or pass neither and let
the component keep it. Passing `selection` without `onSelectionChange` renders a
selection the user cannot change. That is occasionally what you want, but
usually a mistake.

**Appearance**

| Prop                              | Type                                    | Default          |                                                                                                                                 |
| --------------------------------- | --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `colors`                          | `KerusiSeatmapColors`                   | theme defaults   | Per-status fills, element tones, focus ring, backdrop. See [Theming](#theming).                                                 |
| `typeColors`                      | `boolean`                               | `true`           | Let an available seat take its `SeatType.color` (§4.7).                                                                         |
| `renderSeat`                      | `(ctx: SeatRenderContext) => ReactNode` | —                | Draws the inside of every seat yourself. See [Custom seat content](#custom-seat-content).                                       |
| `seatSize`                        | `number`                                | `28`             | Grid cell edge, in viewBox units.                                                                                               |
| `seatGap`                         | `number`                                | `6`              | Gap between grid cells.                                                                                                         |
| `freeformBasis`                   | `number`                                | `1000`           | Freeform viewBox width; height follows the aspect ratio.                                                                        |
| `unitScale`                       | `number`                                | `1`              | CSS pixels per viewBox unit. Caps each section at its natural size so a narrow section and a wide one draw seats the same size. |
| `showSectionLabels`               | `boolean`                               | `true`           |                                                                                                                                 |
| `showLegend` / `showLegendPrices` | `boolean`                               | `false` / `true` |                                                                                                                                 |
| `className` / `style`             | —                                       | —                | Applied to the root element, alongside `kerusi-seatmap`.                                                                        |

**Sections**

| Prop               | Type                                   |                                                                     |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------- |
| `sectionIds`       | `readonly string[]`                    | Render only these, in this order. Default: all, by `Section.index`. |
| `sectionOverrides` | `Record<string, SectionRenderOptions>` | Per-section `hidden`, `aspectRatio`, `seatSize`, `label`.           |

**Localization, validation, lifecycle**

| Prop               | Type                            | Default                      |                                                                        |
| ------------------ | ------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `locale`           | `string`                        | `KerusiMap.locale` ?? `'en'` | BCP-47. Resolves `Section.label` / `SeatType.label` locale maps.       |
| `rtl`              | `boolean \| 'auto'`             | `'auto'`                     | Mirrors layout and arrow direction. `auto` derives it from the locale. |
| `ariaStrings`      | `SeatAriaStrings`               | English                      | Every announced phrase, for translation.                               |
| `validate`         | `'collect' \| 'throw' \| 'off'` | `'collect'`                  | `collect` reports through `onValidationIssues` and renders anyway.     |
| `expireHolds`      | `boolean`                       | `false`                      | Revert a lapsed `holdExpires` to available on a ticker.                |
| `expiryIntervalMs` | `number`                        | `1000`                       |                                                                        |

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
| `onValidationIssues`              | `readonly KerusiViolation[]` | Called whenever the documents change.                                                                  |
| `onViewportChange`                | `KerusiViewport`             | `{ zoom, x, y }`, whenever the zoom or pan changes. Only with `zoomable`.                              |
| `onMaximizedChange`               | `boolean`                    | When the map is maximized or restored. Only with `maximizable`.                                        |

### The `ref`

```tsx
const map = useRef<KerusiSeatmapHandle>(null);
// map.current.summary    -> { seats, total, unpriced }
// map.current.focusSeat('A12')
// map.current.viewport    -> { zoom, x, y }
// map.current.zoomIn() / zoomOut() / resetZoom() / toggleMaximized()
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

### Custom seat content

When the palette and the class hooks are not enough (an icon, a badge, a price
tag, a different shape), draw the inside of each seat yourself with
`renderSeat`. It returns SVG, in the section's viewBox units:

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
| `placed`         | `PlacedSeat` | The seat's box, centre, font size and rotation, in viewBox units.                                  |
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

**Coordinates.** Draw in the section's viewBox units, using `glyph.box` (or
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
more path in every seat, after your content: `.kerusi-seat__focus`, an outline of
the seat's body shown only on `:focus-visible`, so keyboard focus stays visible
whatever you draw (WCAG 2.4.7). It takes the same colour as the stock ring
(`--kerusi-focus-ring`, then `colors.focusRing`, then `currentColor`). It follows
the seat's body outline, not your drawing; if you draw your own focus indicator,
restyle or hide it with `.kerusi-seat:focus-visible .kerusi-seat__focus`. Without
a seat template it is not rendered at all, and the markup is unchanged.

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
`controlStrings`, for translation. They use the theme's existing tokens
(`--kerusi-element-bg`, `--kerusi-element-fg`, `--kerusi-element-muted-fg`,
`--kerusi-focus-ring`), so there is nothing new to theme.

To put the controls somewhere else, turn the built-in ones off
(`showZoomControls={false}`) and drive the map yourself:

```tsx
const map = useRef<KerusiSeatmapHandle>(null);
// map.current.zoomIn(); map.current.zoomOut(); map.current.resetZoom(); map.current.toggleMaximized();
// map.current.viewport   -> { zoom, x, y }
// map.current.maximized  -> boolean
```

`onViewportChange` reports `{ zoom, x, y }` whenever the view changes, for a host that wants
to display or persist it. (Restoring a saved view is not supported.)

**Maximize.** The button fills the screen with the map and its legend, freezes the
page behind it, and swaps to an "Exit full screen" button. The layout is a fixed
overlay, which is all iPhone Safari offers; where the browser has the Fullscreen
API it is requested on top, and leaving it with the browser's own Esc leaves the
map's maximized state too. `Escape` from the map also leaves, except that on a
seat with a non-empty selection the first `Escape` still clears the selection, as
it always has. The backdrop is `--kerusi-backdrop`, or the page's own canvas colour
while that is transparent; `--kerusi-maximized-z-index` (default `1000`) sets the
stacking. It is not a modal dialog: focus is not trapped, and an ancestor with a
`transform` or `filter` would anchor the fixed layout to itself instead of the
screen.

### Keyboard

Tab moves between sections; each section keeps its own tab stop. Within a
section, arrow keys follow the §4.3.1 `col` order, so an aisle, which is a
column no seat occupies, is stepped across rather than into.

| Key                      |                                    |
| ------------------------ | ---------------------------------- |
| `←` `→`                  | Previous / next seat in the row    |
| `↑` `↓`                  | Nearest column in the adjacent row |
| `Home` / `End`           | First / last seat of the row       |
| `Ctrl+Home` / `Ctrl+End` | First / last seat of the section   |
| `PageUp` / `PageDown`    | First / last seat of the section   |
| `Enter` / `Space`        | Toggle                             |
| `Escape`                 | Clear the selection                |

Each seat is a `role="button"` announcing its position, type, price, status,
every `Seat.accessibility` property and its attributes. A polite live region
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
  computeSectionLayout, // placed geometry for one section
  buildNavigationGraph, // per-seat keyboard neighbours
} from '@kerusiweb/core';
```

---

MIT © Arsyad "Shad Ahm" Ahmad
