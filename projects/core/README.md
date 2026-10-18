# @kerusiweb/core

Framework-agnostic core for the **[Kerusi Seat Map & Availability
Format](https://github.com/ShadAhm/kerusi)**: the document types, a conformance
validator, and the render model and geometry a seat-map renderer consumes.

Pure TypeScript. No Angular, no React, no RxJS, no DOM, so it runs in a
browser, in a build step, or on a server.

```bash
npm install @kerusiweb/core
```

For a UI on top of it, add the binding for your framework:
[`@kerusiweb/angular`](https://www.npmjs.com/package/@kerusiweb/angular) or
[`@kerusiweb/react`](https://www.npmjs.com/package/@kerusiweb/react). Both
expose the same surface and emit the same SVG.

## What's in it

**`kerusi/`: the format.** `KerusiMap`, `KerusiState`, `KerusiSession`, `Seat`,
`Section`, `Money` and friends, plus the logic the standard defines over them:

```ts
import { validateDocumentSet, errorsOf, resolveSeatPrice, expireHolds } from '@kerusiweb/core';

const violations = validateDocumentSet({ map, state, session });
if (errorsOf(violations).length) throw new Error('non-conformant documents');
```

**`render/`: the resolved view and its geometry.** `buildRenderModel()` merges
a state onto a map and resolves prices, locale, row order, seat sizes and
section bounds into a `RenderMap`; `computeMapLayout()` places every seat and
element on the map's canvas, exactly where the document puts it, mirroring the
whole canvas for a right-to-left locale; `seatBodyPath()` and friends return
SVG path `d` strings.

```ts
import { buildRenderModel, computeMapLayout, seatBodyPath } from '@kerusiweb/core';

const model = buildRenderModel(map, state);
const layout = computeMapLayout(model, { rtl: false });
// layout.width / layout.height → the canvas: the map's one viewBox
// layout.sections[0].seats[0] → { seat, x, y, width, height, centerX, centerY, ... }
const { x, y, width, height } = layout.sections[0].seats[0];
const d = seatBodyPath(x, y, width, height); // → 'M4 8 …', ready for <path d>
```

**`view/`: presentation policy, still framework-free.** The colour system
(`DEFAULT_KERUSI_COLORS`, `seatFill`, `readableOn`), the ARIA strings
(`seatAriaLabel`, `disallowedAnnouncement`), the selection rules
(`toggleSeatSelection`, `summarizeSelection`, `DisallowedReason`), and the rules
behind seat hover and seat cards: `reduceSeatHover()` (the pointer-type filter,
the pause during a pan or zoom, the open and close delays) and `placeSeatCard()`
(side, position and arrow offset, with flip and clamp), both pure, plus the
`SeatClick` and `KerusiSeatCardContext` types.

## Server-side use

Core is `"type": "module"` and its emitted imports carry explicit extensions, so
it loads under plain Node ESM with no bundler:

```js
import { validateDocumentSet } from '@kerusiweb/core';
```

## Contributing

See [docs/architecture.md](../../docs/architecture.md) for what belongs here and
what belongs in a framework binding.

---

MIT © Arsyad "Shad Ahm" Ahmad
