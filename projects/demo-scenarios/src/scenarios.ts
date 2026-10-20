import { KerusiMap, KerusiSession, KerusiState } from '@kerusiweb/core';
import {
  AIRCRAFT_MAP,
  AIRCRAFT_SESSION,
  AIRCRAFT_STATE,
} from './fixtures/aircraft.kerusi.fixture.js';
import { CINEMA_MAP, CINEMA_SESSION, CINEMA_STATE } from './fixtures/cinema.kerusi.fixture.js';
import {
  LECTURE_THEATRE_MAP,
  LECTURE_THEATRE_STATE,
} from './fixtures/lecture-theatre.kerusi.fixture.js';
import { BANQUET_MAP, BANQUET_STATE } from './fixtures/banquet.kerusi.fixture.js';
import { LOUNGE_MAP, LOUNGE_STATE } from './fixtures/lounge.kerusi.fixture.js';
import { STADIUM_MAP, STADIUM_STATE } from './fixtures/stadium.kerusi.fixture.js';
import { TOWN_HALL_MAP, TOWN_HALL_STATE } from './fixtures/town-hall.kerusi.fixture.js';
import { TRAIN_MAP, TRAIN_SESSION, TRAIN_STATE } from './fixtures/train.kerusi.fixture.js';

/** One showcased venue: its documents, and what about the standard it shows. */
export interface Scenario {
  id: string;
  /** Tab label. */
  name: string;
  /** `KerusiMap.domain` — informational only; never used to branch rendering. */
  domain: string;
  /** One line on why this venue is here. */
  blurb: string;
  /** The specific spec features this document exercises. */
  highlights: readonly string[];
  map: KerusiMap;
  state: KerusiState;
  session?: KerusiSession;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'cinema',
    name: 'Cinema',
    domain: 'cinema',
    blurb:
      'A straight grid split by two aisles into a left wing, a center block, and a ' +
      'right wing — the classic printed seating chart.',
    highlights: [
      'Seats on a regular lattice, each placed by its own x/y on the canvas',
      'Two aisles as skipped cols split each row into three blocks (§4.3.5)',
      'Open space in front of row A holds the screen and its throw',
      'Screen and exits are non-bookable Elements',
      'Love seats are symmetric companions — they book as a pair',
      'A wheelchair bay declares accessibility, not an attribute tag',
    ],
    map: CINEMA_MAP,
    state: CINEMA_STATE,
    session: CINEMA_SESSION,
  },
  {
    id: 'aircraft',
    name: 'Aircraft',
    domain: 'flight',
    blurb:
      'A narrow-body cabin. Two classes are two Sections on one canvas; the aisle is ' +
      'a col no seat occupies, not a filler object.',
    highlights: [
      'Two sections, one above the other on one canvas',
      'The aisle is a skipped col (§4.3.2, no filler objects)',
      'Lavatories, galley and exit doors are Elements, seat-sized by default',
      'attributes: window, aisle, exit-row, extra-legroom',
      'Row 15 carries the full §4.3.4 accessibility object',
    ],
    map: AIRCRAFT_MAP,
    state: AIRCRAFT_STATE,
    session: AIRCRAFT_SESSION,
  },
  {
    id: 'train',
    name: 'Train',
    domain: 'train',
    blurb:
      'Two carriages, two Sections. Carriage B is table bays, where four seats face ' +
      'each other around a fixture that cannot be booked.',
    highlights: [
      'One Section per carriage',
      'Tables are Elements in the space the facing seats leave between them',
      'forward-facing / rear-facing as attributes',
      'An accessible bay with its required companion seat',
      'Its KerusiState is scoped by sessionId, not mapId',
    ],
    map: TRAIN_MAP,
    state: TRAIN_STATE,
    session: TRAIN_SESSION,
  },
  {
    id: 'lounge',
    name: 'Lounge',
    domain: 'lounge',
    blurb:
      'One place of every registered seat form, untouched and turned, so a customer can ' +
      'tell an armchair from a stool before choosing.',
    highlights: [
      'SeatType.form says what a place looks like (§4.7.1); chair is the default',
      'Armchair, stool, recliner, beanbag, floor cushion and a wheelchair space',
      'Sofa and bench describe one place: three sofa places, four on a pew',
      'The same forms again, turned, to show an outline turns with its seat',
      'A form is a drawing hint: it changes no price, neighbour or footprint',
      'The sofa and two pews are groups (§4.11): each names its places and draws the piece under them',
    ],
    map: LOUNGE_MAP,
    state: LOUNGE_STATE,
  },
  {
    id: 'banquet',
    name: 'Banquet',
    domain: 'banquet',
    blurb:
      'Six round tables of eight and a head table. Each table is a group with a ' +
      'footprint, so a tabletop sits under its chairs.',
    highlights: [
      "Section.groups names a table's seats and gives it a circle footprint (§4.11)",
      'The head table is a rect group, with its places along its front',
      'Every chair is rotated to face the middle of its table (§4.3.1)',
      'A seat is announced by its table: "Table 3, seat 4"',
      'The footprint is decoration: a press on a tabletop selects nothing',
    ],
    map: BANQUET_MAP,
    state: BANQUET_STATE,
  },
  {
    id: 'stadium',
    name: 'Stadium',
    domain: 'stadium',
    blurb:
      'Stands wrap the pitch. Coordinates place each seat on its arc; col still says ' +
      'which seat is next along.',
    highlights: [
      'Every seat has x/y to place it and row/col to say who its neighbours are',
      'x/y alone decide where a seat is drawn (§4.5)',
      'col is the adjacency ordinal for keyboard order (§4.3.5)',
      'Each stand rotated to face the pitch',
      'The pitch itself is an Element',
    ],
    map: STADIUM_MAP,
    state: STADIUM_STATE,
  },
  {
    id: 'lecture-theatre',
    name: 'Lecture Theatre',
    domain: 'theatre',
    blurb:
      'Rows are concentric arcs around a point above the screen, each seat rotated to ' +
      'face it — the fan widens toward the back the way a real raked hall does.',
    highlights: [
      'Per-seat rotation comes from real polar geometry, not a hand-tuned curve',
      'Each curved row records its arc as a RowMeta.shape (§4.2.3), for editors',
      'A constant seat pitch, not seat count, is what a row holds constant',
      'One scale on both axes (§4.5), so a circle is drawn as a circle',
      'An accessible pair sits at each end of the back row',
    ],
    map: LECTURE_THEATRE_MAP,
    state: LECTURE_THEATRE_STATE,
  },
  {
    id: 'town-hall',
    name: 'Town Hall',
    domain: 'event',
    blurb:
      'The standard\u2019s own example (§6.7): two sections sharing one canvas, a curved ' +
      'balcony, and a round table. Only one canvas per map can draw it.',
    highlights: [
      'Stalls and balcony are zones on one canvas, overlapping in height',
      'Declared Section.bounds, which zoom to a section uses',
      'A round table: four seats around it, neighbours by col, booked as a party',
      'Row shapes (line, arc, circle) record how an editor placed each row',
      'A9 and L5 sit off their guides and still draw exactly where the document says',
      'A seat with no row: the wheelchair space',
    ],
    map: TOWN_HALL_MAP,
    state: TOWN_HALL_STATE,
  },
];

/** Locales the demo can switch between, to show label resolution. */
export const DEMO_LOCALES = [
  { id: 'en', label: 'English' },
  { id: 'ms', label: 'Bahasa Melayu' },
] as const;
