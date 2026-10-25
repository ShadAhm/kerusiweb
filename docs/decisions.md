# Decisions

Every design decision that shapes the library's behaviour or public surface,
numbered once, across the whole repository. Planning issues propose them; this
file is where they are kept once made.

Code comments, specs and the changelog cite a decision by its number, for
example `(D4)`. A number is never reused or renumbered, so a citation always
points at the same decision.

## How to read an entry

- **Status** is one of:
  - **Accepted**: decided, not shipped yet.
  - **Shipped** in a version.
  - **Superseded** by a later decision, which is named. The old entry stays, so
    old citations still resolve.
  - **Rejected**: considered and turned down. It is kept so the question isn't
    reopened without new information.
- **Source** is where the decision was made: an issue, a PR or a review thread.
- **Why** is the reason, as it stood when the decision was made. If the reason
  stops holding, add a new decision that supersedes this one. Don't edit the old
  reason.

To add one, use the `record-decision` skill
([`.claude/skills/record-decision/SKILL.md`](../.claude/skills/record-decision/SKILL.md)),
or follow its steps by hand.

## Index

| #                                                                    | Decision                                                   | Status        |
| -------------------------------------------------------------------- | ---------------------------------------------------------- | ------------- |
| [D1](#d1-one-svg-for-the-whole-map)                                  | One `<svg>` for the whole map                              | Shipped 3.0.0 |
| [D2](#d2-no-sizing-inputs-beyond-unitscale)                          | No sizing inputs beyond `unitScale`                        | Shipped 3.0.0 |
| [D3](#d3-rtl-mirrors-the-whole-canvas)                               | RTL mirrors the whole canvas                               | Shipped 3.0.0 |
| [D4](#d4-a-hidden-section-leaves-its-space-empty)                    | A hidden section leaves its space empty                    | Shipped 3.0.0 |
| [D5](#d5-section-labels-only-for-sections-with-bounds)               | Section labels only for sections with `bounds`             | Shipped 3.0.0 |
| [D6](#d6-keyboard-navigation-follows-adjacency)                      | Keyboard navigation follows adjacency                      | Shipped 3.0.0 |
| [D7](#d7-validator-rule-ids-match-the-reference)                     | Validator rule ids match the reference validator           | Shipped 3.0.0 |
| [D8](#d8-no-rev-14--15-upgrader)                                     | No rev 14 → 15 upgrader                                    | Shipped 3.0.0 |
| [D9](#d9-no-rows-view-in-300)                                        | No §4.5.1 rows view in 3.0.0                               | Shipped 3.0.0 |
| [D10](#d10-hover-and-click-are-independent-and-optional)             | Hover and click are independent and optional               | Accepted      |
| [D11](#d11-the-consuming-app-owns-seat-card-styling)                 | The consuming app owns seat card styling                   | Accepted      |
| [D12](#d12-hover-card-on-keyboard-focus-is-opt-in)                   | Hover card on keyboard focus is opt-in                     | Accepted      |
| [D13](#d13-the-click-event-is-read-only)                             | The click event is read-only                               | Accepted      |
| [D14](#d14-read-only-maps-infer-clicks)                              | Read-only maps infer clicks from a configured click action | Accepted      |
| [D15](#d15-events-and-seat-cards-ship-together)                      | Events and seat cards ship together                        | Accepted      |
| [D16](#d16-the-zoom-and-full-screen-controls-are-styled-by-tokens)   | The zoom and full-screen controls are styled by tokens     | Accepted      |
| [D17](#d17-a-seat-form-sets-the-default-outline-the-apps-shapes-win) | A seat form sets the default outline; the app's shapes win | Shipped 4.0.0 |
| [D18](#d18-group-footprints-are-drawn-by-core-and-styled-by-tokens)  | Group footprints are drawn by core and styled by tokens    | Shipped 4.0.0 |
| [D19](#d19-either-is-offered-on-the-shape-or-by-the-app)             | `either` is offered on the shape, or by the app            | Shipped 4.0.0 |
| [D20](#d20-selection-stays-a-list-of-seat-ids)                       | `selection` stays a list of seat ids                       | Shipped 4.0.0 |
| [D21](#d21-maxselection-counts-seats)                                | `maxSelection` counts seats                                | Shipped 4.0.0 |
| [D22](#d22-companionmode-becomes-unitmode)                           | `companionMode` becomes `unitMode`                         | Shipped 4.0.0 |
| [D23](#d23-new-validator-rules-use-the-reference-ids)                | New validator rules use the reference ids                  | Shipped 4.0.0 |
| [D24](#d24-seat-form-outlines-are-drawn-in-house)                    | Seat form outlines are drawn in-house                      | Shipped 4.0.0 |
| [D25](#d25-whole-unit-controls-get-cards-of-their-own)               | Whole-unit controls get cards of their own                 | Accepted      |
| [D26](#d26-a-visible-cue-on-the-whole-unit-control-is-separate)      | A visible cue on the whole-unit control is separate        | Accepted      |

---

## Kerusi rev 15 (v3.0.0)

Made in [#32](https://github.com/ShadAhm/kerusiweb/issues/32), 2026-10-17.

### D1. One SVG for the whole map

- **Status:** Shipped in 3.0.0
- **Source:** [#32](https://github.com/ShadAhm/kerusiweb/issues/32)

One `<svg>` for the whole map, `viewBox="0 0 canvas.width canvas.height"`, with
each section a `<g class="kerusi-section" data-section-id role="group">` inside
it.

**Why:** sections are zones on one canvas now, and two can sit side by side.
Stacking one SVG per section would draw a valid map wrongly.

### D2. No sizing inputs beyond unitScale

- **Status:** Shipped in 3.0.0
- **Source:** [#32](https://github.com/ShadAhm/kerusiweb/issues/32)

Remove the `seatSize`, `seatGap` and `freeformBasis` inputs/props, plus
`SectionRenderOptions.aspectRatio` and `SectionRenderOptions.seatSize`. Keep
`hidden` and `label`.

**Why:** the document now fixes seat size and position, and §4.5 forbids
resizing. `unitScale` (CSS px per canvas unit) remains the only sizing control.

### D3. RTL mirrors the whole canvas

- **Status:** Shipped in 3.0.0
- **Source:** [#32](https://github.com/ShadAhm/kerusiweb/issues/32)

RTL mirrors the whole drawing: `x' = canvas.width − x`, rotation negated, text
kept readable. Arrow keys keep following the screen.

**Why:** §2 and §4.5 allow mirroring the whole canvas, and only that. Mirroring
each section or row separately is now a reflow.

### D4. A hidden section leaves its space empty

- **Status:** Shipped in 3.0.0
- **Source:** [#32](https://github.com/ShadAhm/kerusiweb/issues/32)

`hidden` removes the section's `<g>` and the canvas does not shrink.

**Why:** closing the gap would move other sections, which is a reflow.

### D5. Section labels only for sections with bounds

- **Status:** Shipped in 3.0.0
- **Source:** [#32](https://github.com/ShadAhm/kerusiweb/issues/32)

Section labels are drawn inside the SVG only when the section declares
`bounds`, at the top-left of the bounds. Otherwise the label is only the group's
accessible name. `showSectionLabels` keeps its meaning.

**Why:** the old `<h3>` above each section SVG has nowhere to go on a shared
canvas. `bounds` is the one thing the spec gives a consumer for placing
per-section chrome.

### D6. Keyboard navigation follows adjacency

- **Status:** Shipped in 3.0.0
- **Source:** [#32](https://github.com/ShadAhm/kerusiweb/issues/32)

Left/right moves to the seat at `col ± 1` in the same row. At an aisle (a
skipped `col`) it jumps to the next seat in the row, and the seat's accessible
description says the aisle is there. Up/down moves to the next row in §4.2.1
order and picks the seat nearest on the canvas. Seats with no `row` keep the
freeform heuristic (banded by `y`, ordered by `x`).

**Why:** §4.3.5 makes `row`/`col` the source of truth for "next to", and the RFC
says adjacency is for keyboard and screen-reader navigation. Stopping at an
aisle would strand keyboard users.

### D7. Validator rule ids match the reference

- **Status:** Shipped in 3.0.0
- **Source:** [#32](https://github.com/ShadAhm/kerusiweb/issues/32)

Validator rule ids match the reference validator (`schema/semantic-rules.mjs`):
`seat-outside-canvas`, `element-outside-canvas`, `seat-row-col-duplicate`,
`row-shape-cols-reversed`, plus the schema-stage checks. Overlap and bounds
findings (`seat-overlap`, `seat-outside-section-bounds`) have severity
`warning`.

**Why:** `KerusiViolation` already has a `warning` severity, and matching ids
keeps the corpus spec a one-to-one check.

### D8. No rev 14 → 15 upgrader

- **Status:** Shipped in 3.0.0
- **Source:** [#32](https://github.com/ShadAhm/kerusiweb/issues/32)

No rev 14 → 15 upgrader ships in the library. Demo fixtures were migrated once
with a throwaway script.

**Why:** the spec calls itself a draft with only the editor's own consumers. A
shipped upgrader would keep the old layout code alive for a format nobody can
produce any more.

### D9. No rows view in 3.0.0

- **Status:** Shipped in 3.0.0 (as a deferral)
- **Source:** [#32](https://github.com/ShadAhm/kerusiweb/issues/32)

The §4.5.1 "rows view" (a reflowed grid for phones) is not part of 3.0.0. It
goes in a follow-up issue.

**Why:** it's optional (MAY), and 3.0.0 was already a large change. The render
model keeps everything that view would need.

---

## Seat hover and click (planned for 3.1.0)

Made in [#42](https://github.com/ShadAhm/kerusiweb/issues/42), 2026-10-18. The
issue has the full API and acceptance criteria.

### D10. Hover and click are independent and optional

- **Status:** Accepted
- **Source:** [#42](https://github.com/ShadAhm/kerusiweb/issues/42)

What happens on hover and what happens on click are configured separately, and
each may be nothing: hover only, click only, both or neither. Two layers ship:

- **Events**: `onSeatHover` / `seatHover` and `onSeatClick` / `seatClick`.
- **Optional seat cards**: `renderHoverCard` / `renderClickCard` in React, and
  `kerusiSeatHoverCard` / `kerusiSeatClickCard` templates in Angular.

The library never supplies card content. With nothing configured, the markup is
unchanged.

**Why:** consumers need hover detail on a read-only map (SeatMaps Easy's "Who
sits where") without reading kerusiweb's DOM. Other apps want click detail, or
their own UI. Two layers let an app take the events alone or let the library do
positioning, dismissal and accessibility.

### D11. The consuming app owns seat card styling

- **Status:** Accepted
- **Source:** [#42](https://github.com/ShadAhm/kerusiweb/issues/42)

The library's card CSS sets structure only (position, stacking, pointer events,
arrow geometry), plus a plain default look built from custom properties. The app
restyles it through:

- `--kerusi-seat-card-*` tokens
- class and `data-*` hooks, including `data-placement` and `data-seat-status`
- its own classes (`seatCardClassName` / `seatCardClass`)
- `seatCardAppearance="none"`, which drops the library's chrome entirely

The card's content is the app's own markup. The library never sets a
`--kerusi-seat-card-*` property on its own root.

**Why:** a popup has to match the host application's design system. Following
the existing theming tiers keeps one mental model, and keeps a consumer's
stylesheet winning without `!important`.

### D12. Hover card on keyboard focus is opt-in

- **Status:** Accepted
- **Source:** [#42](https://github.com/ShadAhm/kerusiweb/issues/42)

The hover card shows on pointer hover only, unless `hoverCardOnFocus` is set
(default `false`). The README warns that a pointer-only card must not be the
only place important information lives, and points to `hoverCardOnFocus`, a
click card or `onSeatFocus`.

**Why:** maintainer's call in #42. A card popping up on every arrow key is
noisy, so the consumer chooses.

### D13. The click event is read-only

- **Status:** Accepted
- **Source:** [#42](https://github.com/ShadAhm/kerusiweb/issues/42)

`onSeatClick` / `seatClick` reports a click on any seat, booked, held and
blocked ones included, and cannot cancel or change it: there is no
`preventDefault()`. Selection behaves as it does without it. A click on a
selectable seat selects it and also opens the click card if one is configured.
To show details without selecting, turn selection off with the existing props
(`interactive={false}`, `selectableStatuses`, `seatSelectable`).

**Why:** maintainer's call in #42. A notification-only event keeps selection
behaviour in one place and avoids a second way to configure what a click does.

### D14. Read-only maps infer clicks

- **Status:** Accepted
- **Source:** [#42](https://github.com/ShadAhm/kerusiweb/issues/42)

On an `interactive={false}` map, clicks and keyboard access (Tab, arrows,
Enter/Space) turn on whenever `onSeatClick` / `seatClick` or a click card is
set. Selection stays off. There is no separate prop. With neither set, the
markup is what it was before.

Angular's `output()` has no public way to tell whether `(seatClick)` is bound.
Check this before implementing. If there is no supported way, bring it back to
#42 rather than adding an Angular-only input.

**Why:** maintainer's call in #42. It keeps the API small, and anything
clickable must be keyboard-reachable (WCAG 2.1.1).

### D15. Events and seat cards ship together

- **Status:** Accepted
- **Source:** [#42](https://github.com/ShadAhm/kerusiweb/issues/42)

Both layers in D10 ship in one minor release, 3.1.0, rather than events first.

**Why:** maintainer's call in #42.

## Zoom and full-screen controls (planned for 3.1.0)

Made in a Claude Code session on 2026-10-18, at the maintainer's request that
the buttons be smaller and restylable. There is no planning issue.

### D16. The zoom and full-screen controls are styled by tokens

- **Status:** Accepted
- **Source:** maintainer's request in a Claude Code session, 2026-10-18

The default look is one compact grouped bar: 32px buttons with 16px icons, and
hover and pressed states. On `pointer: coarse` devices the buttons stay 44px.
The app restyles them with `--kerusi-control-*` tokens (`size`, `icon-size`,
`icon-stroke`, `radius`, `shadow`, `bg`, `fg`, `border`, `hover-bg`) and the
existing `.kerusi-toolbar` / `.kerusi-control` class hooks, as D11 does for seat
cards. There are no new props or inputs.

The buttons carry no inline colours. The component writes the `[colors]` palette
onto the toolbar as `--kerusi-control-*-input` properties, and the stylesheet
puts the tokens in front of them. The library never sets a `--kerusi-control-*`
property itself.

**Why:** inline colours beat any consumer rule, so the old buttons could not be
restyled without `!important`, and inline styles cannot express `:hover`. Tokens
keep one theming model across the library. 44px squares dominated the corner of
the map on desktop, where the large target is not needed.

## Furniture and booking units (4.0.0)

Made in [#50](https://github.com/ShadAhm/kerusiweb/issues/50), 2026-10-20. It
covers Kerusi's seat forms, groups, booking modes and whole prices
(ShadAhm/kerusi#15 to #18), delivered in three pieces: draw seat forms
([#51](https://github.com/ShadAhm/kerusiweb/issues/51), minor), draw groups
([#52](https://github.com/ShadAhm/kerusiweb/issues/52), minor) and select by
booking unit ([#53](https://github.com/ShadAhm/kerusiweb/issues/53), 4.0.0).
kerusiweb stays a renderer: no editor, no booking engine, and no pricing beyond
the §4.9 resolution it already does for announcements.

### D17. A seat form sets the default outline; the app's shapes win

- **Status:** Shipped in 4.0.0
- **Source:** [#50](https://github.com/ShadAhm/kerusiweb/issues/50)

`SeatType.form` sets a seat's default outline. A `shape` from `seatStyle` or
`seatTypeStyles` still wins over it, so the app keeps the last word, as in
[#26](https://github.com/ShadAhm/kerusiweb/issues/26). `chair`, an absent `form`
and an unknown `form` all draw today's `'seat'` outline.

**Why:** maintainer's call in #50. Existing maps and existing app overrides must
not change.

### D18. Group footprints are drawn by core and styled by tokens

- **Status:** Shipped in 4.0.0
- **Source:** [#50](https://github.com/ShadAhm/kerusiweb/issues/50)

Core draws a group's footprint under its seats as
`<g class="kerusi-group kerusi-group--{kind}">`. It is styled by CSS tokens and
the `colors` prop. Kerusi has no group colour, so the document does not style
groups.

**Why:** maintainer's call in #50. The document describes structure; looks stay
with the app, as in D11 and D16.

### D19. `either` is offered on the shape, or by the app

- **Status:** Shipped in 4.0.0
- **Source:** [#50](https://github.com/ShadAhm/kerusiweb/issues/50)

A tap on a seat takes its booking unit, as a tap takes a companion closure
today. A whole unit that has a shape (an `either` table or sofa) is offered on
the shape itself: the tabletop is a focusable control, announced as "Table 3,
book the whole table, 8 seats", placed in keyboard order before its seats. A
whole unit with no shape (a room, the venue, a shapeless group) has nothing to
tap, so core exports the units and the app offers its own button by setting
`selection`.

**Why:** maintainer's call in #50. A tap should never need an extra mode
switch, and anything clickable must be keyboard-reachable (WCAG 2.1.1).

### D20. `selection` stays a list of seat ids

- **Status:** Shipped in 4.0.0
- **Source:** [#50](https://github.com/ShadAhm/kerusiweb/issues/50)

The bindings' `selection` contract does not change. The change detail adds which
whole units are fully selected, so an app can say "Table 3 (whole table)".

**Why:** maintainer's call in #50. Apps keep one simple model for what is
selected.

### D21. `maxSelection` counts seats

- **Status:** Shipped in 4.0.0
- **Source:** [#50](https://github.com/ShadAhm/kerusiweb/issues/50)

A unit bigger than the limit is refused with a new reason, `unit-too-large`.

**Why:** maintainer's call in #50. It keeps the limit meaning what it means
today.

### D22. `companionMode` becomes `unitMode`

- **Status:** Shipped in 4.0.0
- **Source:** [#50](https://github.com/ShadAhm/kerusiweb/issues/50)

`companionMode` becomes `unitMode: 'auto' | 'seats'`, where `seats` is today's
`independent`, for admin views that block single seats. Together with the end of
`companions` in Kerusi, this makes kerusiweb 4.0.0.

**Why:** maintainer's call in #50. Booking modes retire `companions`.

### D23. New validator rules use the reference ids

- **Status:** Shipped in 4.0.0
- **Source:** [#50](https://github.com/ShadAhm/kerusiweb/issues/50)

Rules the validator gains for forms, groups and booking modes use the reference
validator's ids, as D7 requires.

**Why:** D7.

### D24. Seat form outlines are drawn in-house

- **Status:** Shipped in 4.0.0
- **Source:** [#51](https://github.com/ShadAhm/kerusiweb/issues/51)

Each registered seat form's outline is drawn in this repository, not taken from
an icon set.

**Why:** maintainer's call in #51. It avoids a licence dependency. The outlines
must also turn with the seat and stay readable at about 8 CSS px.

## Whole-unit controls (planned for 4.1.0)

From [#56](https://github.com/ShadAhm/kerusiweb/issues/56), 2026-10-25.

### D25. Whole-unit controls get cards of their own

- **Status:** Accepted
- **Source:** [#56](https://github.com/ShadAhm/kerusiweb/issues/56)

The control that books an `either` group whole (D19) gets what a seat already
has, through a surface of its own, so `KerusiSeatCardContext` is unchanged:

- **Cards.** `renderWholeUnitHoverCard` and `renderWholeUnitClickCard` in React,
  `<ng-template kerusiWholeUnitHoverCard>` and `<ng-template
kerusiWholeUnitClickCard>` in Angular, handed a `KerusiWholeUnitCardContext`
  (`unit`, `group`, `selected`, `trigger`, `close`). They share the seat cards'
  placement, appearance, delay, dismissal and `hoverCardOnFocus`, and the
  control points at its hover card with `aria-describedby`. A control goes by
  core's `wholeUnitHoverKey()` in `reduceSeatHover()`, so one hover card shows
  at a time across seats and controls, and `onSeatHover` / `seatHover` still
  reports seats only.
- **Refusals.** `onWholeUnitDisallowed` / `wholeUnitDisallowed` with `{ unit,
group, reason }` for a refused click, Enter or Space. The live-region
  announcement is made as before.
- **Price.** `wholeUnitPrice?: (unit) => string | undefined` gives the formatted
  price said in the control's name, in place of the map's `wholePrice`;
  `undefined` falls back to it.

**Why:** maintainer's call in this issue's planning: separate renderers keep the
seat card context exactly as it is, so the change is additive.

### D26. A visible cue on the whole-unit control is separate

- **Status:** Accepted
- **Source:** [#56](https://github.com/ShadAhm/kerusiweb/issues/56)

The open question from #53, a visible cue that a tabletop can be pressed, is not
part of the whole-unit cards. It is left for its own issue.

**Why:** maintainer's call in #56.
