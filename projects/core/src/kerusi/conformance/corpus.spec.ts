/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import {
  checkKerusiMap,
  checkKerusiSession,
  checkKerusiState,
  checkKerusiStateDelta,
  errorsOf,
} from '../kerusi-validator.js';
import { KerusiViolation } from '../kerusi-violation.js';

/**
 * The example corpus published with the standard, run through this library's
 * validator. See README.md in this folder for where it came from and why a few
 * of the schema-invalid documents are accepted here on purpose.
 *
 * Every file carries the document type it should be checked against in its
 * name, per §8: `*.map.kerusi.json`, `*.state.kerusi.json`,
 * `*.statedelta.kerusi.json`, `*.session.kerusi.json`.
 */

/** Every vendored document, keyed by its path under `corpus/`. */
const CORPUS: Record<string, unknown> = Object.fromEntries(
  Object.entries(
    import.meta.glob<unknown>('./corpus/**/*.kerusi.json', { eager: true, import: 'default' }),
  ).map(([path, doc]) => [path.replace('./corpus/', ''), doc]),
);

type Check = (doc: unknown) => readonly KerusiViolation[];

const CHECKS: Record<string, Check> = {
  map: checkKerusiMap,
  state: checkKerusiState,
  statedelta: checkKerusiStateDelta,
  session: checkKerusiSession,
};

const checkFor = (name: string): Check => {
  const type = name.split('.').at(-3);
  const check = type ? CHECKS[type] : undefined;
  if (!check) {
    throw new Error(`corpus file "${name}" does not name a document type (§8)`);
  }
  return check;
};

const docOf = (name: string): unknown => {
  if (!(name in CORPUS)) {
    throw new Error(`corpus file "${name}" is not vendored`);
  }
  return CORPUS[name];
};

const rulesFor = (name: string): string[] =>
  errorsOf(checkFor(name)(docOf(name))).map((v) => v.rule);

/** Conformant documents. Nothing here may be rejected, or even warned about. */
const VALID = [
  'bus-minimal.map.kerusi.json',
  'cinema-hallA.map.kerusi.json',
  'cinema-hallB.map.kerusi.json',
  'delta-heartbeat.statedelta.kerusi.json',
  'delta-release.statedelta.kerusi.json',
  'flight-b738.map.kerusi.json',
  'session-mh123.session.kerusi.json',
  'stadium-court1.map.kerusi.json',
  'stage-only-section.map.kerusi.json',
  'state-by-mapid.state.kerusi.json',
  'state-by-sessionid.state.kerusi.json',
  'state-empty.state.kerusi.json',
  'town-hall.map.kerusi.json',
];

/**
 * These satisfy the published JSON Schemas and violate a rule §7 requires a
 * validator to enforce. Asserted by rule id, so a fixture failing for the
 * wrong reason is a failure rather than a pass.
 */
const SEMANTIC: Record<string, string[]> = {
  'validator-only/asymmetric-companions.map.kerusi.json': ['companion-symmetry'],
  'validator-only/dangling-price-tier.map.kerusi.json': ['seat-pricetier-reference'],
  'validator-only/dangling-row.map.kerusi.json': ['seat-row-reference'],
  'validator-only/dangling-seat-type.map.kerusi.json': ['seat-type-reference'],
  'validator-only/duplicate-element-ids.map.kerusi.json': ['element-id-duplicate'],
  'validator-only/duplicate-price-tier-ids.map.kerusi.json': ['price-tier-id-duplicate'],
  'validator-only/duplicate-row-col.map.kerusi.json': ['seat-row-col-duplicate'],
  'validator-only/duplicate-row-ids.map.kerusi.json': ['row-id-duplicate'],
  'validator-only/duplicate-seat-ids.map.kerusi.json': ['seat-id-duplicate'],
  'validator-only/duplicate-seat-type-ids.map.kerusi.json': ['seat-type-id-duplicate'],
  'validator-only/duplicate-section-ids.map.kerusi.json': ['section-id-duplicate'],
  'validator-only/element-outside-canvas.map.kerusi.json': ['element-outside-canvas'],
  'validator-only/mixed-currencies.map.kerusi.json': ['single-currency'],
  'validator-only/row-shape-cols-reversed.map.kerusi.json': ['row-shape-cols-reversed'],
  'validator-only/seat-outside-canvas.map.kerusi.json': ['seat-outside-canvas'],
};

/** Schema-invalid documents this library also rejects, by rule id. */
const REJECTED: Record<string, string[]> = {
  'invalid/degenerate-canvas.map.kerusi.json': ['map-canvas-size'],
  'invalid/delta-both-scopes.statedelta.kerusi.json': ['state-scope'],
  'invalid/delta-missing-changes.statedelta.kerusi.json': ['delta-changes'],
  'invalid/element-no-position.map.kerusi.json': ['element-position'],
  'invalid/element-zero-width.map.kerusi.json': ['element-size-invalid'],
  'invalid/map-bad-version.map.kerusi.json': ['map-version-unsupported'],
  'invalid/map-missing-canvas.map.kerusi.json': ['map-canvas'],
  'invalid/map-missing-legend.map.kerusi.json': ['map-legend'],
  'invalid/map-missing-seat-size.map.kerusi.json': ['map-seat-size'],
  'invalid/row-shape-arc-no-sweep.map.kerusi.json': ['row-shape-invalid'],
  'invalid/row-shape-two-kinds.map.kerusi.json': ['row-shape-kind'],
  'invalid/row-shape-unknown-kind.map.kerusi.json': ['row-shape-kind'],
  'invalid/seat-col-without-row.map.kerusi.json': ['seat-col-without-row'],
  'invalid/seat-col-zero.map.kerusi.json': ['seat-col-invalid'],
  'invalid/seat-missing-y.map.kerusi.json': ['seat-position'],
  // Below the schema's `minimum: 0`, which is the canvas's lower edge.
  'invalid/seat-negative-x.map.kerusi.json': ['seat-outside-canvas'],
  'invalid/seat-no-position.map.kerusi.json': ['seat-position'],
  'invalid/section-seat-size-zero.map.kerusi.json': ['section-seat-size'],
  'invalid/session-missing-mapid.session.kerusi.json': ['session-mapid'],
  'invalid/state-bad-timestamp.state.kerusi.json': ['state-updatedat-format'],
  'invalid/state-both-scopes.state.kerusi.json': ['state-scope'],
  // The rev 13 case: ISO 8601, and not the RFC 3339 profile §5.1.1 narrows it
  // to. A consumer cannot reliably parse it, so it is rejected.
  'invalid/state-iso8601-no-seconds.state.kerusi.json': ['state-updatedat-format'],
  'invalid/state-no-scope.state.kerusi.json': ['state-scope'],
};

/**
 * The schema-invalid fixtures this library accepts, each for a stated reason.
 * See README.md: some are consumer tolerance the spec requires, the rest are
 * producer-side shape constraints the published schemas own and this library
 * does not reimplement.
 */
const ACCEPTED: Record<string, string> = {
  'invalid/map-unknown-toplevel-field.map.kerusi.json':
    '§2 and §7 require a consumer to ignore members it does not recognize; rejecting this would be the non-conformance',
  'invalid/section-layout-removed.map.kerusi.json':
    'a rev 14 "layout" is now an unknown member, ignored per §7; the seats carry everything rev 15 needs to draw them',
  'invalid/section-aspect-ratio-removed.map.kerusi.json':
    'a rev 14 "aspectRatio" is now an unknown member, ignored per §7; the canvas alone sets the proportions',
  'invalid/element-grid-addressed.map.kerusi.json':
    'an element\'s rev 14 "row"/"col" are now unknown members, ignored per §7; it is placed by its own x/y',
  'invalid/bad-currency.map.kerusi.json':
    'the ISO 4217 letter case is a schema pattern; §4.9 asks this library for one currency across the map, which holds here',
  'invalid/non-integer-amount.map.kerusi.json':
    'minor units being integral is a schema constraint (§4.8); nothing here re-derives the amount',
  'invalid/state-bad-status.state.kerusi.json':
    'the status enum is a schema constraint; an unknown status renders as its own class rather than corrupting the merge',
};

describe('conformance corpus — valid examples', () => {
  for (const name of VALID) {
    it(`accepts ${name} with no findings`, () => {
      // Reported in full rather than as a count: a conformant document that
      // trips a rule, warnings included, should say which one.
      expect(checkFor(name)(docOf(name))).toEqual([]);
    });
  }
});

describe('conformance corpus — §7 semantic rules', () => {
  for (const [name, rules] of Object.entries(SEMANTIC)) {
    it(`rejects ${name}`, () => {
      expect(rulesFor(name)).toEqual(rules);
    });
  }
});

describe('conformance corpus — schema-invalid documents', () => {
  for (const [name, rules] of Object.entries(REJECTED)) {
    it(`rejects ${name}`, () => {
      expect(rulesFor(name)).toEqual(rules);
    });
  }

  for (const [name, why] of Object.entries(ACCEPTED)) {
    it(`accepts ${name} — ${why}`, () => {
      expect(rulesFor(name)).toEqual([]);
    });
  }
});

describe('conformance corpus — coverage', () => {
  it('has an explicit expectation for every vendored file', () => {
    const expected = new Set([
      ...VALID,
      ...Object.keys(SEMANTIC),
      ...Object.keys(REJECTED),
      ...Object.keys(ACCEPTED),
    ]);
    expect(Object.keys(CORPUS).filter((name) => !expected.has(name))).toEqual([]);
    expect([...expected].filter((name) => !(name in CORPUS))).toEqual([]);
  });
});
