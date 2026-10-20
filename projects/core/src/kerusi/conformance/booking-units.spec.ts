/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { bookingUnits, BookingUnit, checkSelection, priceSelection } from '../kerusi-booking.js';
import { KerusiMap } from '../kerusi-map.model.js';
import { KerusiSession, KerusiState } from '../kerusi-state.model.js';

/**
 * The standard's booking-units corpus (§4.9.1, §4.12, §7): two conformant
 * consumers MUST derive the same booking units and whole units from the same
 * map and session, and price a selection the same way. See
 * `corpus/booking-units/README.md` for the file format.
 */

/** Every vendored JSON document under `corpus/`, keyed by its path below it. */
const FILES: Record<string, unknown> = Object.fromEntries(
  Object.entries(
    import.meta.glob<unknown>('./corpus/**/*.json', { eager: true, import: 'default' }),
  ).map(([path, doc]) => [path.replace('./corpus/', ''), doc]),
);

interface ExpectedUnit {
  level: string;
  id: string;
  seats: string[];
  bookable?: boolean;
}

interface Scenario {
  name: string;
  session: KerusiSession | string | null;
  state?: KerusiState;
  units: ExpectedUnit[];
  wholeUnits: ExpectedUnit[];
  selections: {
    seats: string[];
    valid: boolean;
    total?: { amount: number; currency: string } | null;
    pricedWhole?: { level: string; id: string }[];
  }[];
}

interface CorpusFile {
  description: string;
  map: KerusiMap | string;
  scenarios: Scenario[];
}

/** A document inline, or by a path relative to `booking-units/`. */
function resolve<T>(value: T | string | null): T | undefined {
  if (value === null) return undefined;
  if (typeof value !== 'string') return value;
  const path = value.replace(/^\.\.\//, '');
  if (!(path in FILES))
    throw new Error(`booking-units refers to "${value}", which is not vendored`);
  return FILES[path] as T;
}

/** Compared as sets, as the corpus README says: neither unit nor seat order is significant. */
function normalise(units: readonly (BookingUnit | ExpectedUnit)[]) {
  return units
    .map((unit) => ({
      level: unit.level,
      id: unit.id,
      seats: [...unit.seats].sort(),
      ...(unit.bookable === undefined ? {} : { bookable: unit.bookable }),
    }))
    .sort((a, b) => `${a.level}\u0000${a.id}`.localeCompare(`${b.level}\u0000${b.id}`));
}

const corpusFiles = Object.entries(FILES).filter(([path]) =>
  /^booking-units\/[^/]+\.json$/.test(path),
);

describe('conformance corpus — booking units (§4.12)', () => {
  it('is vendored', () => {
    expect(corpusFiles.map(([path]) => path).sort()).toEqual([
      'booking-units/levels.json',
      'booking-units/lounge.json',
    ]);
  });

  for (const [path, doc] of corpusFiles) {
    const file = doc as CorpusFile;
    const map = resolve<KerusiMap>(file.map)!;

    describe(path, () => {
      for (const scenario of file.scenarios) {
        const session = resolve<KerusiSession>(scenario.session);

        describe(scenario.name, () => {
          const derived = bookingUnits(map, session, scenario.state);

          it('derives the booking units', () => {
            expect(normalise(derived.units)).toEqual(normalise(scenario.units));
          });

          it('derives the whole units', () => {
            expect(normalise(derived.wholeUnits)).toEqual(normalise(scenario.wholeUnits));
          });

          it('gives every seat exactly one booking unit', () => {
            const seats = derived.units.flatMap((unit) => unit.seats);
            expect(new Set(seats).size).toBe(seats.length);
            for (const unit of derived.units) {
              for (const id of unit.seats) expect(derived.unitOf.get(id)).toBe(unit);
            }
          });

          for (const selection of scenario.selections) {
            const label = `[${selection.seats.join(', ')}]`;
            it(`judges ${label} ${selection.valid ? 'valid' : 'invalid'}`, () => {
              expect(checkSelection(map, session, selection.seats).valid).toBe(selection.valid);
            });
            if (!selection.valid) continue;
            it(`prices ${label}`, () => {
              const price = priceSelection(map, session, selection.seats);
              expect(price.total ?? null).toEqual(selection.total ?? null);
              if (selection.pricedWhole) {
                expect(price.wholes.map(({ level, id }) => ({ level, id }))).toEqual(
                  selection.pricedWhole,
                );
              }
            });
          }
        });
      }
    });
  }
});
