# Conformance corpus

`corpus/` is a verbatim copy of the example documents published with the Kerusi
standard, vendored so this library's verdict on each can be asserted in the test
suite rather than described in prose.

|          |                                                |
| -------- | ---------------------------------------------- |
| Source   | https://github.com/ShadAhm/kerusi, `examples/` |
| Spec     | v1.0.0-draft, rev 15 (`spec-1.0.0-draft.15`)   |
| Commit   | `d16fd99`                                      |
| Vendored | 2026-10-17                                     |

Three files come from a later tag. `seat-forms.map.kerusi.json`,
`seat-form-implementation-defined.map.kerusi.json` and
`invalid/seat-type-form-empty.map.kerusi.json` are vendored from
`spec-1.0.0-draft.17`, the revision that added `SeatType.form` (§4.7.1), because
this library draws seat forms before it adopts the rest of that revision (groups
and booking modes come with their own releases, D17 onwards). The rest of the
corpus stays at rev 15 until then.

To refresh after a spec revision: copy `examples/` over `corpus/`, run
`npm run test:core`, and reconcile `corpus.spec.ts`. Every file has an explicit
expectation there, and a coverage test fails on any file without one, so a new
or changed fixture shows up as a failure rather than passing silently.

## The three directories, and what this library owes each

- **`corpus/`**: conformant documents. Nothing here may be rejected, and none
  may produce a warning either (overlapping seats, seats outside their
  section's `bounds`).
- **`corpus/validator-only/`**: documents that satisfy the published JSON
  Schemas and violate a §7 semantic rule. These are the rules §7 requires of a
  validator, so each is asserted by rule id.
- **`corpus/invalid/`**: documents that fail the schemas. Most also fail here,
  but not all, and the difference is deliberate rather than a gap:

  - The published schemas are a **producer-side** gate and set
    `additionalProperties: false`. §2 and §7 tell a **consumer** to ignore
    members it does not recognize, so `map-unknown-toplevel-field` MUST be
    accepted by this library. Rejecting it would be the non-conformance.
  - The same rule covers the members rev 15 removed: a section's layout mode
    and aspect ratio, and an element's `row`/`col`. They are unknown members now,
    so `section-layout-removed`, `section-aspect-ratio-removed` and
    `element-grid-addressed` are accepted. That is safe: those fixtures also
    carry everything rev 15 requires, and a real rev 14 map is still rejected
    because it has no `canvas` or `seatSize`.
  - Some fixtures fail only a JSON Schema shape constraint: a currency's
    letter case, a price's integrality, a status enum. This library validates the §7 semantic rules and the structure it
    needs to render; it does not reimplement the schemas, and
    `docs/kerusi-conformance.md` records that it publishes none. Vendor the
    schemas from the spec repo alongside it when a producer-side gate is what
    you need.

  `corpus.spec.ts` says which of the two applies for every file it accepts.
