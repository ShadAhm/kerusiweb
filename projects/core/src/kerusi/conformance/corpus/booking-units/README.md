# Booking-units conformance corpus

Two conformant consumers MUST derive the same booking units and whole units
from the same map and session, and price a selection the same way (§4.9.1,
§4.12, §7 of [the spec](../../RFC/kerusi-standard_v1.0.0-draft.md)). A seat
picker and a booking engine are often written in different languages, so
they test against these files rather than against each other.
[`schema/booking.mjs`](../../schema/booking.mjs) is the reference
implementation, and `npm test` runs it over every file here.

Each `*.json` file is one map and a list of scenarios:

```jsonc
{
  "description": "…",
  "map": "../lounge.map.kerusi.json",       // a KerusiMap, inline or a path relative to this file
  "scenarios": [
    {
      "name": "…",
      "session": null,                       // a KerusiSession, inline, a path, or null
      "state": { … },                        // OPTIONAL. A KerusiState; when present, every unit carries "bookable"
      "units": [                             // every booking unit (§4.12.2); together they partition the map's seats
        { "level": "group", "id": "LS1", "seats": ["LS1-1", "LS1-2"] },
        { "level": "seat", "id": "SF1-1", "seats": ["SF1-1"] }
      ],
      "wholeUnits": [                        // every whole unit (§4.12.2)
        { "level": "map", "id": "lounge", "seats": ["…"] }
      ],
      "selections": [
        { "seats": ["LS1-1"], "valid": false },
        {
          "seats": ["T1-1", "T1-2", "T1-3", "T1-4"],
          "valid": true,
          "total": { "amount": 18000, "currency": "MYR" },   // null when nothing in it is priced
          "pricedWhole": [{ "level": "group", "id": "T1" }]  // the levels charged a whole price, outermost first
        }
      ]
    }
  ]
}
```

- `level` is `map`, `section`, `group`, or `seat` for a seat that is a
  booking unit on its own; `id` is that object's id.
- Compare `units` and `wholeUnits` as sets: neither the order of the units
  nor the order of the seats in each is significant.
- `bookable` (§4.12.3) is true only while every seat in the unit is
  `available` in the state.
- A selection is `valid` when it is a non-empty union of booking units
  (§4.12.3). An invalid one has no price to check.
- `pricedWhole` is ordered as §4.9.1 prices: the map, then the sections, then
  the groups, each in declaration order.

| File                         | What it covers                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`levels.json`](levels.json) | Each mode at each level, set by the document and by a session; an outer `whole` over an inner `either`; a whole price ignored while its level is `seats`; venue hire over a section booked whole |
| [`lounge.json`](lounge.json) | The §6.8 lounge: a table picked whole, picked seat by seat and picked partly; room hire; venue hire; the quiz-night session; a unit with one seat booked                                         |
