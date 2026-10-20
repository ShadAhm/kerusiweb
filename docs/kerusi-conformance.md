# Kerusi conformance report

Which parts of the **Kerusi Seat Map and Availability Format** this library
implements, and which it does not.

|               |                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Library       | `@kerusiweb/core` 3.0.0 (this repository)                                                                                 |
| Spec assessed | [Kerusi standard v1.0.0-draft](https://github.com/ShadAhm/kerusi/blob/master/RFC/kerusi-standard_v1.0.0-draft.md), rev 15 |
| Date          | 2026-10-17                                                                                                                |

**Summary:** the library is a conformant **consumer** and **validator** by the
spec's own §7 definition, on every one of the eight requirements §7 now lists.
It merges state by `Seat.id`; enforces §4.6 referential integrity, including
companion symmetry and identifier uniqueness; rejects any seat or element
without a position or off the canvas, and any two seats sharing a `row` and
`col`; draws every seat at its `x`/`y` with the §4.3.1 footprint and never
moves one because of its `row`, `col` or row shape; derives adjacency only as
§4.3.5 defines it; orders sections and rows as §4.1.1 and §4.2.1 define;
applies the §4.9 price-resolution order; and ignores unrecognized members.

Each claim above is asserted file by file against the corpus published with the
standard (rev 15), vendored under `projects/core/src/kerusi/conformance/`,
including the seven schema-invalid fixtures this library accepts on purpose,
which that folder's README explains. That every corpus seat is drawn at its
document position, size and rotation is asserted in core, and in both bindings
through a shared SVG parity test.

The remaining gaps are scope decisions rather than modelling limits: this is a
renderer, so it defines no transport, and it ships no JSON Schema.

Status key: ✅ supported · ⚠️ partial · ❌ not supported

---

## §3 Document types

| Type               | Status | Notes                                                                                                             |
| ------------------ | ------ | ----------------------------------------------------------------------------------------------------------------- |
| `KerusiMap`        | ✅     | Typed, validated, resolved, rendered.                                                                             |
| `KerusiState`      | ✅     | Typed, validated, merged by `Seat.id`; sparse rule honored.                                                       |
| `KerusiStateDelta` | ✅     | `KerusiStateStore` applies deltas with ordering and scope enforced. See §5.2 on gap detection.                    |
| `KerusiSession`    | ✅     | Typed, validated, and joined: `validateDocumentSet` checks a state's `sessionId` and a session's `mapId` resolve. |

## §4 KerusiMap

| Field                      | Status | Notes                                                                                                           |
| -------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| `kerusi`                   | ✅     | Presence **and value** checked. `1.x` accepted (a future minor must not break a parser); other majors rejected. |
| `id`, `sections`, `legend` | ✅     | Required-presence validated.                                                                                    |
| `canvas`, `seatSize`       | ✅     | Required, and both must be positive (§4.5). The canvas is the map's `viewBox`; `seatSize` sizes every seat.     |
| `name`                     | ✅     | The map's accessible name.                                                                                      |
| `domain`                   | ✅     | Correctly ignored for rendering and never used to reject; surfaced on `RenderMap.domain` as a hint only.        |
| `locale`                   | ✅     | Resolves localized labels; overridable via `[locale]`. Drives RTL when `[rtl]="'auto'"`.                        |
| `priceTiers`               | ✅     | Resolved, validated, rendered in the legend and the selection total.                                            |
| `metadata`                 | ⚠️     | Preserved on the input types and reachable via `RenderSeat.source`, but not surfaced as its own field.          |

## §4.1 Section / §4.2 RowMeta

| Feature                                | Status | Notes                                                                                                                       |
| -------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| `seats` as a flat list                 | ✅     | Grouped into render rows by `Seat.row`; seats never live inside rows.                                                       |
| **Sections are zones** (§4.1)          | ✅     | Every section is a `<g role="group">` on the map's one `<svg>`, named by its label. Sections may sit side by side.          |
| `Section.seatSize`                     | ✅     | Overrides the map's seat size for the section's seats and the default size of its elements.                                 |
| `Section.bounds`                       | ✅     | Never affects drawing. Used to zoom to a section and to place its drawn label; without it, the box around its content.      |
| `rows` (RowMeta) labels, `index`       | ✅     | Row naming and ordering. A free-text `row` with no `RowMeta` also works.                                                    |
| `rows` as a complete registry (§4.2)   | ✅     | Where `rows` is present the section's rows come from it, not from the seats that reference one.                             |
| **§4.2.1** row order                   | ✅     | Indexed rows first ascending, then unindexed in declaration order; `index` treated as a key, never as a position.           |
| **§4.2.2** empty rows                  | ✅     | A row no seat references is materialized and marked `RenderRow.empty`. It reserves nothing on the canvas.                   |
| **§4.2.3** row shapes                  | ✅     | Validated (one kind, positive radius, `cols` not reversed, `arc.sweep` required). Never read to draw. `isOnGuide` exported. |
| `directions` (§4.10)                   | ✅     | Localized onto `RenderSection.directions`. Informational: never validated against, never read to place anything.            |
| `Section.index` ordering (§4.1.1)      | ✅     |                                                                                                                             |
| Localized `Section.label`              | ✅     | BCP-47 chain resolution.                                                                                                    |
| Section subsetting / overrides         | ✅     | `sectionIds` and `sectionOverrides`. A hidden section leaves its space on the canvas empty.                                 |
| `Section.metadata`, `RowMeta.metadata` | ⚠️     | Reachable through `RenderSection.source`, not surfaced separately.                                                          |

## §4.3 Seat

| Field                             | Status | Notes                                                                                                         |
| --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| `id`, `label`, `row`              | ✅     | `label` defaults to `id`. Seat ids are checked for global uniqueness.                                         |
| `x` / `y`                         | ✅     | Required. The seat's centre in canvas units, drawn exactly there.                                             |
| `col`                             | ✅     | Adjacency only (§4.3.5). Never read to place a seat. Only with `row`, a positive integer, unique in its row.  |
| `rotation`                        | ✅     | SVG rotation about the seat centre.                                                                           |
| `type`                            | ✅     | Validated, resolved to the full `SeatType`, and **drives the seat's colour** via `SeatType.color`.            |
| `priceTier` / `price`             | ✅     | Resolved per §4.9 and displayed in the legend, the announcement and the selection total.                      |
| `companions`                      | ✅     | Validated for symmetry **and enforced in booking**: the transitive closure selects and deselects as one unit. |
| `attributes`                      | ✅     | Carried on `RenderSeat` and announced. Never affects price or fill (§4.3.3).                                  |
| **`accessibility`** (§4.3.4)      | ✅     | Typed, validated, announced in full, and `wheelchairAccessible` marks the seat visually.                      |
| `metadata`                        | ⚠️     | Reachable via `RenderSeat.source`.                                                                            |
| **§4.3.1** footprint              | ✅     | A `seatSize` square centred on `x`/`y`. Overlapping footprints are a `seat-overlap` warning; touching is not. |
| **§4.3.2** no filler objects      | ✅     | A skipped `col` is empty space. No spacer nodes are synthesized.                                              |
| **§4.3.3** `type` vs `attributes` | ✅     | Attributes influence neither price nor colour.                                                                |
| **§4.3.5** adjacency              | ✅     | Same `row`, `col`s one apart. Arrow keys and screen-reader order follow it, and cross aisles.                 |

## §4.4 Element

| Feature                             | Status | Notes                                                                                                                                                               |
| ----------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering elements                  | ✅     | Every element, in every section.                                                                                                                                    |
| `x`/`y`/`width`/`height`/`rotation` | ✅     | A `width` × `height` rectangle centred on `x`/`y`, in canvas units. A missing `width` or `height` is the section's seat size (§4.4.1).                              |
| `label`                             | ✅     | Drawn centered, except on kinds that read better unlabelled. A `label` kind draws nothing but this text.                                                            |
| `kind`                              | ✅     | Drives the shape: screen (arc), stage, exit (accent), lavatory/galley/table, aisle/gap (dashed), label (text only, no box). Unknown kinds get a labelled rectangle. |
| `id`                                | ✅     | Preserved on `RenderElement`.                                                                                                                                       |
| Validation                          | ✅     | `id`, `kind`, `x` and `y` required; positive sizes; on the canvas; duplicate ids rejected.                                                                          |

## §4.5 The canvas

| Feature                               | Status | Notes                                                                                                           |
| ------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| One canvas per map                    | ✅     | The map is one `<svg>` whose `viewBox` is `canvas`. No per-section SVGs, no per-section proportions.            |
| Same scale on both axes               | ✅     | The `viewBox` is drawn with `preserveAspectRatio="xMidYMid meet"`, so a circle stays a circle.                  |
| No layout arithmetic                  | ✅     | No cell sizes, no row spacing, no percentages. Placement copies the document: the top-left is `x − size/2`.     |
| Scale chosen by the renderer          | ✅     | `unitScale` CSS pixels per canvas unit, at most; the drawing shrinks to a narrower container.                   |
| Crop, zoom, pan                       | ✅     | Opt-in `zoomable`: pinch, wheel, drag, keys, buttons, and zoom to a section.                                    |
| Mirror the whole drawing              | ✅     | Right-to-left mirrors the whole canvas, `x' = canvas.width − x` with rotation negated. Nothing else moves.      |
| Never move, resize or reflow anything | ✅     | Asserted per seat in core and in both bindings. A hidden section leaves its space empty rather than closing it. |
| The §4.5.1 rows view                  | ❌     | Optional (MAY), and not in 3.0.0.                                                                               |

## §4.6 Referential integrity

| Rule                                                | Status                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| `Seat.type` resolves in `legend`                    | ✅                                                                   |
| `Seat.priceTier` resolves in `priceTiers`           | ✅                                                                   |
| `Seat.row` resolves in `Section.rows` when declared | ✅                                                                   |
| Every seat and element has a position on the canvas | ✅ `seat-outside-canvas`, `element-outside-canvas`, `seat-position`. |
| No two seats share a `row` and `col`                | ✅ `seat-row-col-duplicate`.                                         |
| `col` only with `row`                               | ✅ `seat-col-without-row`.                                           |
| `Seat.companions[]` resolve within the same section | ✅                                                                   |
| `companions` fully symmetric                        | ✅                                                                   |
| Errors identify the failing rule and id             | ✅ plus a `severity` and a document `path`.                          |
| Seat / section / element id uniqueness              | ✅                                                                   |

## §4.7–§4.9 Seat types and pricing

| Feature                    | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Price-resolution order     | ✅     | `price` → `priceTier` → `type.defaultPriceTier` → unpriced.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| One-currency-per-map rule  | ✅     | Validated across seats and tiers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Money in minor units       | ✅     | `formatMoney` reads the currency's exponent from `Intl`, so JPY (0) and KWD (3) render correctly.                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Displaying price**       | ✅     | In the legend, the accessible name, and `summarizeSelection`.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `SeatType.label`           | ✅     | Localized, rendered in the legend, announced per seat.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SeatType.color`           | ✅     | Applied to available seats, with a contrast-correct label colour. Availability outranks it.                                                                                                                                                                                                                                                                                                                                                                                                              |
| **§4.7.1** `SeatType.form` | ✅     | Each registered form (`armchair`, `stool`, `recliner`, `beanbag`, `cushion`, `wheelchair-space`, `sofa`, `bench`) is drawn as its own outline inside the seat's square, facing up at `rotation` 0, in the seat and the legend. `chair`, no `form` and an unknown `form` draw the stock seat, and nothing is rejected over one (D17). It changes no price, neighbour or footprint. This is from the revision after rev 15 (`spec-1.0.0-draft.17`); groups and booking modes follow in their own releases. |

## §5 State, deltas, sessions

| Feature                                       | Status | Notes                                                                                                                                           |
| --------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Merge by `Seat.id`                            | ✅     |                                                                                                                                                 |
| Sparse rule (absent ⇒ available)              | ✅     |                                                                                                                                                 |
| `available`/`booked`/`held`/`blocked`         | ✅     | Four distinct render states; only `available` is selectable by default, and the set is configurable.                                            |
| Exactly one of `sessionId`/`mapId`            | ✅     | Validated.                                                                                                                                      |
| `holdExpires`                                 | ✅     | Announced as a clock time, and `[expireHolds]` reverts a lapsed hold on a ticker.                                                               |
| **§5.1.1** RFC 3339 timestamps                | ✅     | Every timestamp is checked against the RFC 3339 profile, calendar included. An ISO 8601 form the profile excludes is rejected.                  |
| **§5.2** delta application                    | ✅     | Ordered by `updatedAt`; stale, duplicate and out-of-scope deltas discarded.                                                                     |
| **§5.2** gap detection                        | ⚠️     | Detected when the transport supplies a monotonic sequence. `updatedAt` alone cannot distinguish a lost message from a quiet period (see below). |
| Delta transport                               | ❌     | No WebSocket/SSE layer, by design. The spec defines a format, not a transport (§9).                                                             |
| **§5.3** sessions                             | ✅     | `validateDocumentSet` checks the map/session/state joins.                                                                                       |
| `KerusiState.metadata`, `SeatStatus.metadata` | ⚠️     | Carried on the input types; not surfaced on the render model.                                                                                   |

**On gap detection.** §5.2 requires `updatedAt` to be strictly increasing, not
contiguous. Two deltas an hour apart are indistinguishable from two deltas with
a lost message between them, so no consumer can detect a gap from `updatedAt`
alone. `KerusiStateStore` therefore detects gaps only when the transport
supplies a sequence (`metadata.seq` by default, or an injected `sequenceOf`
reader) and applies a gapped delta anyway, so the map degrades rather than
freezes while the consumer re-fetches, per the spec's "SHOULD discard and
re-fetch".

## §7 Conformance / §8 Interchange

| Requirement                                          | Status | Notes                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Merge state by `Seat.id`                             | ✅     |                                                                                                                                                                                                                                                                                                                                                                                  |
| Enforce §4.6 incl. companion symmetry and uniqueness | ✅     |                                                                                                                                                                                                                                                                                                                                                                                  |
| **Enforce positions and adjacency (§4.6)**           | ✅     | Required of validators at v1.0, and enforced: a seat or element with no position or off the canvas, and two seats sharing a `row` and `col`, are rejected.                                                                                                                                                                                                                       |
| **Draw the canonical view (§4.5)**                   | ✅     | Every seat at its `x`/`y` with the §4.3.1 footprint; never moved because of its `row`, `col` or row shape.                                                                                                                                                                                                                                                                       |
| **Derive adjacency only as §4.3.5 defines**          | ✅     |                                                                                                                                                                                                                                                                                                                                                                                  |
| Order sections (§4.1.1) and rows (§4.2.1)            | ✅     |                                                                                                                                                                                                                                                                                                                                                                                  |
| Apply §4.9 price order                               | ✅     |                                                                                                                                                                                                                                                                                                                                                                                  |
| Ignore unrecognized members                          | ✅     | Nothing is rejected for an unknown member, and a future `1.x` minor is accepted. That includes the members rev 15 removed from sections and elements; a rev 14 map is still rejected, because it has no `canvas` or `seatSize`.                                                                                                                                                  |
| Producer conformance                                 | n/a    | This library consumes documents; it does not emit them.                                                                                                                                                                                                                                                                                                                          |
| Published JSON Schema (§8)                           | ❌     | None shipped. Validation is the hand-written TypeScript validator, which does enforce every MUST-level rule of §7. A handful of producer-side shape constraints (a currency's letter case, a price's integrality, the status enum) belong to the schemas published with the spec and are not duplicated here; vendor those alongside when a producer-side gate is what you need. |
| `.kerusi.json` / `application/vnd.kerusi+json` (§8)  | ❌     | No loader or media-type handling; callers supply already-parsed objects.                                                                                                                                                                                                                                                                                                         |
| Version negotiation                                  | ✅     | The `kerusi` member's value is checked, accepting `1.x` and rejecting other majors.                                                                                                                                                                                                                                                                                              |

## Accessibility and rendering concerns

These are not spec requirements (the standard is renderer-agnostic), but §4.3.5
names keyboard and screen-reader navigation as a purpose of adjacency, and
§4.3.4 exists to be surfaced.

| Feature                      | Status | Notes                                                                                                               |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| Keyboard navigation          | ✅     | Per-section roving tabindex; arrows follow adjacency and cross aisles; Home/End/PageUp/PageDown/Enter/Space/Escape. |
| Screen-reader announcement   | ✅     | Position, "next to an aisle", type, price, status, hold expiry, every accessibility property, attributes.           |
| Live region                  | ✅     | Announces the running selection and the reason a seat could not be taken.                                           |
| Right-to-left                | ✅     | Derived from the locale; mirrors the whole canvas and the arrow keys with it, leaving `col` order intact.           |
| Focus visibility             | ✅     | A themed `:focus-visible` ring that follows a rotated seat.                                                         |
| Reduced motion               | ✅     | Transitions disabled under `prefers-reduced-motion`.                                                                |
| Multi-leg / multi-day (§5.4) | ❌     | Out of scope. The spec scopes itself to one configuration at a time and takes no position on correlating them.      |

---

## What is left

1. **A published JSON Schema (§8).** The TypeScript validator enforces every
   MUST-level rule, but a schema would let non-TypeScript producers validate.
2. **Loader and media-type conventions (§8).** `.kerusi.json` and
   `application/vnd.kerusi+json` have no handling; callers parse their own JSON.
3. **`metadata` on the render model.** It survives on `*.source`, but a
   dedicated field would save consumers a hop.
4. **Transport.** Left out on purpose. The spec defines a data format, and a
   renderer should not own the socket.
5. **The §4.5.1 rows view.** An optional reflowed grid for narrow screens, or
   a list for assistive technology. Everything it needs is on the render model.
