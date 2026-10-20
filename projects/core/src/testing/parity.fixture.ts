import { KerusiMap } from '../kerusi/kerusi-map.model.js';
import { KerusiState } from '../kerusi/kerusi-state.model.js';

/**
 * Shared by the Angular and React binding specs, so both can be held to
 * drawing the same SVG (#32 phase 3). Test-only: excluded from the core build.
 *
 * Each binding renders {@link PARITY_MAP} with {@link PARITY_STATE} and
 * {@link PARITY_SELECTION}, passes its map `<svg>` to {@link svgSignature}, and
 * compares the result with {@link PARITY_SIGNATURE}. When the drawing changes
 * on purpose, regenerate the signature from one binding and check the other
 * still matches it.
 */

/** The §6.7 town hall from the rev 15 corpus: two sections side by side, a curved row, a round table. */
export const PARITY_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'town-hall',
  name: 'Town Hall',
  canvas: { width: 1600, height: 900 },
  seatSize: 40,
  legend: [
    { id: 'std', label: 'Standard', defaultPriceTier: 'regular' },
    { id: 'wheelchair', label: 'Wheelchair space', defaultPriceTier: 'regular' },
  ],
  priceTiers: [{ id: 'regular', price: { amount: 2500, currency: 'MYR' } }],
  sections: [
    {
      id: 'stalls',
      label: 'Stalls',
      index: 0,
      bounds: { x: 280, y: 60, width: 1180, height: 680 },
      rows: [
        {
          id: 'A',
          label: 'A',
          shape: { line: { from: [320, 400], to: [1088, 400], cols: [1, 9] } },
        },
        {
          id: 'T1',
          label: 'Table 1',
          shape: { circle: { center: [1300, 300], radius: 70, start: -90, cols: [1, 4] } },
        },
      ],
      elements: [
        { id: 'stage', kind: 'stage', label: 'Stage', x: 800, y: 126, width: 800, height: 90 },
      ],
      seats: [
        { id: 'A1', row: 'A', col: 1, x: 320, y: 400, type: 'std' },
        { id: 'A2', row: 'A', col: 2, x: 416, y: 400, type: 'std' },
        { id: 'A3', row: 'A', col: 3, x: 512, y: 400, type: 'std' },
        { id: 'A4', row: 'A', col: 4, x: 608, y: 400, type: 'std' },
        { id: 'A6', row: 'A', col: 6, x: 800, y: 400, type: 'std' },
        { id: 'A7', row: 'A', col: 7, x: 896, y: 400, type: 'std' },
        { id: 'A8', row: 'A', col: 8, x: 992, y: 400, type: 'std' },
        { id: 'A9', row: 'A', col: 9, x: 1100, y: 440, type: 'std' },
        {
          id: 'T1-1',
          row: 'T1',
          col: 1,
          x: 1300,
          y: 230,
          type: 'std',
          companions: ['T1-2', 'T1-3', 'T1-4'],
        },
        {
          id: 'T1-2',
          row: 'T1',
          col: 2,
          x: 1370,
          y: 300,
          type: 'std',
          companions: ['T1-1', 'T1-3', 'T1-4'],
        },
        {
          id: 'T1-3',
          row: 'T1',
          col: 3,
          x: 1300,
          y: 370,
          type: 'std',
          companions: ['T1-1', 'T1-2', 'T1-4'],
        },
        {
          id: 'T1-4',
          row: 'T1',
          col: 4,
          x: 1230,
          y: 300,
          type: 'std',
          companions: ['T1-1', 'T1-2', 'T1-3'],
        },
        { id: 'S1', x: 1408, y: 702, type: 'wheelchair' },
      ],
    },
    {
      id: 'balcony',
      label: 'Balcony',
      index: 1,
      bounds: { x: 440, y: 580, width: 720, height: 220 },
      rows: [
        {
          id: 'L',
          label: 'L',
          shape: { arc: { center: [800, 60], radius: 640, start: 120, sweep: -60, cols: [1, 7] } },
        },
      ],
      seats: [
        { id: 'L1', row: 'L', col: 1, x: 480, y: 614, type: 'std' },
        { id: 'L2', row: 'L', col: 2, x: 581, y: 661, type: 'std' },
        { id: 'L3', row: 'L', col: 3, x: 689, y: 690, type: 'std' },
        { id: 'L4', row: 'L', col: 4, x: 800, y: 700, type: 'std' },
        { id: 'L5', row: 'L', col: 5, x: 930, y: 760, type: 'std' },
        { id: 'L6', row: 'L', col: 6, x: 1019, y: 661, type: 'std' },
        { id: 'L7', row: 'L', col: 7, x: 1120, y: 614, type: 'std' },
      ],
    },
  ],
};

/** A sold seat, a held one with no expiry, and a blocked one, so every status mark is drawn. */
export const PARITY_STATE: KerusiState = {
  kerusi: '1.0',
  mapId: 'town-hall',
  updatedAt: '2026-10-17T09:00:00Z',
  seats: {
    A2: { status: 'booked' },
    'T1-2': { status: 'held' },
    L7: { status: 'blocked' },
  },
};

export const PARITY_SELECTION: readonly string[] = ['A3', 'L4'];

/** Attributes a framework adds for its own bookkeeping, never part of the drawing. */
const FRAMEWORK_ATTRIBUTE = /^(_ng|ng-|kerusi-section$|kerusi-seat-card$|xmlns)/;

/**
 * A framework-neutral text form of an `<svg>` subtree: one line per element,
 * indented by depth, with its attributes sorted, its classes and style
 * declarations sorted, and its own trimmed text. Comments and the attributes
 * Angular adds for itself are dropped.
 */
export function svgSignature(root: Element): string {
  const lines: string[] = [];
  const walk = (el: Element, depth: number) => {
    const attrs = [...el.attributes]
      .filter((a) => !FRAMEWORK_ATTRIBUTE.test(a.name))
      .map((a) => `${a.name}="${normalizeAttribute(a.name, a.value)}"`)
      .sort();
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => (n.textContent ?? '').trim())
      .filter(Boolean)
      .join(' ');
    lines.push(
      `${'  '.repeat(depth)}<${el.tagName.toLowerCase()}${attrs.map((a) => ` ${a}`).join('')}>${text}`,
    );
    for (const child of el.children) {
      walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return lines.join('\n');
}

/** Ids a binding generates per instance differ by nature; only that one is present matters. */
const INSTANCE_ID_ATTRIBUTES = new Set(['id', 'aria-describedby']);

function normalizeAttribute(name: string, value: string): string {
  if (INSTANCE_ID_ATTRIBUTES.has(name)) {
    return '{instance id}';
  }
  if (name === 'class') {
    return value
      .split(/\s+/)
      .filter((c) => c && !c.startsWith('ng-'))
      .sort()
      .join(' ');
  }
  if (name === 'style') {
    return value
      .split(';')
      .map((d) => d.trim().replace(/\s*:\s*/, ': '))
      .filter(Boolean)
      .sort()
      .join('; ');
  }
  return value.trim();
}

/**
 * One open click card, for the booked seat A2 of {@link PARITY_MAP}, whose
 * content is `<span class="detail">Booked A2</span>`, in a jsdom that does no
 * layout (so every box is empty and the card sits at 0, 0). Both bindings hold
 * to it, so the markup a consumer styles is the same in either (D11).
 */
export const PARITY_CARD_SIGNATURE = `<div aria-label="Row A, seat A2, Standard, MYR 25.00, booked, unavailable." class="kerusi-seat-card kerusi-seat-card--click" data-placement="top" data-seat-id="A2" data-seat-status="booked" data-seat-type="std" data-section-id="stalls" id="{instance id}" role="dialog" style="--kerusi-seat-card-arrow-shift: 0px; left: 0px; top: 0px" tabindex="-1">
  <div class="kerusi-seat-card__body">
    <span class="detail">Booked A2
  <span aria-hidden="true" class="kerusi-seat-card__arrow">`;

/** The town hall as both bindings draw it. Regenerate when the drawing changes on purpose. */
export const PARITY_SIGNATURE = `<svg class="kerusi-seatmap__svg" focusable="false" preserveAspectRatio="xMidYMid meet" role="presentation" style="--kerusi-focus-ring-input: #1b1f27; max-width: 1600px" viewBox="0 0 1600 900">
  <rect height="900" style="fill: var(--kerusi-backdrop, transparent)" width="1600" x="0" y="0">
  <g aria-label="Stalls" class="kerusi-section" data-section-id="stalls" role="group">
    <text aria-hidden="true" class="kerusi-section-label" dominant-baseline="hanging" font-size="20" style="fill: var(--kerusi-element-fg, #3a4353)" text-anchor="start" x="280" y="30">Stalls
    <g class="kerusi-element kerusi-element--stage">
      <rect height="90" rx="2" style="fill: var(--kerusi-element-bg, #d7deea)" width="800" x="400" y="81">
      <text class="kerusi-element__label" dominant-baseline="central" font-size="45" style="fill: var(--kerusi-element-fg, #3a4353)" text-anchor="middle" x="800" y="126">Stage
    <g aria-disabled="false" aria-label="Row A, seat A1, Standard, MYR 25.00, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available" data-seat-id="A1" data-seat-row="A" data-seat-status="available" data-seat-type="std" data-section-id="stalls" role="button" tabindex="0">
      <path class="kerusi-seat__box" d="M 300.381 383.177 A 3.2 3.2 0 0 1 303.2 380 L 336.8 380 A 3.2 3.2 0 0 1 339.619 383.177 L 336.82 406.497 A 13.6 13.6 0 0 1 321.6 420 L 318.4 420 A 13.6 13.6 0 0 1 303.18 406.497 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="320" y="400">A1
    <g aria-disabled="true" aria-label="Row A, seat A2, Standard, MYR 25.00, booked, unavailable." aria-pressed="false" class="kerusi-seat kerusi-seat--booked kerusi-seat--unselectable" data-seat-id="A2" data-seat-row="A" data-seat-status="booked" data-seat-type="std" data-section-id="stalls" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 396.381 383.177 A 3.2 3.2 0 0 1 399.2 380 L 432.8 380 A 3.2 3.2 0 0 1 435.619 383.177 L 432.82 406.497 A 13.6 13.6 0 0 1 417.6 420 L 414.4 420 A 13.6 13.6 0 0 1 399.18 406.497 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <path class="kerusi-seat__wash" d="M 396.381 383.177 A 3.2 3.2 0 0 1 399.2 380 L 432.8 380 A 3.2 3.2 0 0 1 435.619 383.177 L 432.82 406.497 A 13.6 13.6 0 0 1 417.6 420 L 414.4 420 A 13.6 13.6 0 0 1 399.18 406.497 Z" style="fill: var(--kerusi-booked-bg, #5e0c17)">
      <path class="kerusi-seat__occupant kerusi-seat__occupant--booked" d="M 409.8 392 a 6.2 6.2 0 1 1 12.4 0 a 6.2 6.2 0 1 1 -12.4 0 Z M 407.2 414.4 C 407.2 403.2 410.4 400 416 400 C 421.6 400 424.8 403.2 424.8 414.4 Z" stroke-width="2" style="fill: var(--kerusi-booked-fg, #ffc9d0); stroke: none">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="416" y="400">A2
    <g aria-disabled="false" aria-label="Row A, seat A3, Standard, MYR 25.00, available." aria-pressed="true" class="kerusi-seat kerusi-seat--available kerusi-seat--selected" data-seat-id="A3" data-seat-row="A" data-seat-status="available" data-seat-type="std" data-section-id="stalls" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 492.381 383.177 A 3.2 3.2 0 0 1 495.2 380 L 528.8 380 A 3.2 3.2 0 0 1 531.619 383.177 L 528.82 406.497 A 13.6 13.6 0 0 1 513.6 420 L 510.4 420 A 13.6 13.6 0 0 1 495.18 406.497 Z" style="fill: var(--kerusi-selected-bg, #7854af)">
      <path class="kerusi-seat__core" d="M 496.305 386.542 A 2.56 2.56 0 0 1 498.56 384 L 525.44 384 A 2.56 2.56 0 0 1 527.695 386.542 L 525.456 405.197 A 10.88 10.88 0 0 1 513.28 416 L 510.72 416 A 10.88 10.88 0 0 1 498.544 405.197 Z" style="fill: var(--kerusi-selected-fg, #f3ecff)">
      <path class="kerusi-seat__occupant kerusi-seat__occupant--selected" d="M 507.04 393.6 a 4.96 4.96 0 1 1 9.92 0 a 4.96 4.96 0 1 1 -9.92 0 Z M 504.96 411.52 C 504.96 402.56 507.52 400 512 400 C 516.48 400 519.04 402.56 519.04 411.52 Z" stroke-width="1.6" style="fill: var(--kerusi-selected-bg, #7854af); stroke: none">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="3.52" style="fill: var(--kerusi-selected-bg, #7854af); stroke: var(--kerusi-selected-fg, #f3ecff)" text-anchor="middle" x="512" y="400">A3
    <g aria-disabled="false" aria-label="Row A, seat A4, next to an aisle, Standard, MYR 25.00, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available" data-seat-id="A4" data-seat-row="A" data-seat-status="available" data-seat-type="std" data-section-id="stalls" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 588.381 383.177 A 3.2 3.2 0 0 1 591.2 380 L 624.8 380 A 3.2 3.2 0 0 1 627.619 383.177 L 624.82 406.497 A 13.6 13.6 0 0 1 609.6 420 L 606.4 420 A 13.6 13.6 0 0 1 591.18 406.497 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="608" y="400">A4
    <g aria-disabled="false" aria-label="Row A, seat A6, next to an aisle, Standard, MYR 25.00, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available" data-seat-id="A6" data-seat-row="A" data-seat-status="available" data-seat-type="std" data-section-id="stalls" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 780.381 383.177 A 3.2 3.2 0 0 1 783.2 380 L 816.8 380 A 3.2 3.2 0 0 1 819.619 383.177 L 816.82 406.497 A 13.6 13.6 0 0 1 801.6 420 L 798.4 420 A 13.6 13.6 0 0 1 783.18 406.497 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="800" y="400">A6
    <g aria-disabled="false" aria-label="Row A, seat A7, Standard, MYR 25.00, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available" data-seat-id="A7" data-seat-row="A" data-seat-status="available" data-seat-type="std" data-section-id="stalls" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 876.381 383.177 A 3.2 3.2 0 0 1 879.2 380 L 912.8 380 A 3.2 3.2 0 0 1 915.619 383.177 L 912.82 406.497 A 13.6 13.6 0 0 1 897.6 420 L 894.4 420 A 13.6 13.6 0 0 1 879.18 406.497 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="896" y="400">A7
    <g aria-disabled="false" aria-label="Row A, seat A8, Standard, MYR 25.00, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available" data-seat-id="A8" data-seat-row="A" data-seat-status="available" data-seat-type="std" data-section-id="stalls" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 972.381 383.177 A 3.2 3.2 0 0 1 975.2 380 L 1008.8 380 A 3.2 3.2 0 0 1 1011.619 383.177 L 1008.82 406.497 A 13.6 13.6 0 0 1 993.6 420 L 990.4 420 A 13.6 13.6 0 0 1 975.18 406.497 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="992" y="400">A8
    <g aria-disabled="false" aria-label="Row A, seat A9, Standard, MYR 25.00, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available" data-seat-id="A9" data-seat-row="A" data-seat-status="available" data-seat-type="std" data-section-id="stalls" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 1080.381 423.177 A 3.2 3.2 0 0 1 1083.2 420 L 1116.8 420 A 3.2 3.2 0 0 1 1119.619 423.177 L 1116.82 446.497 A 13.6 13.6 0 0 1 1101.6 460 L 1098.4 460 A 13.6 13.6 0 0 1 1083.18 446.497 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="1100" y="440">A9
    <g aria-disabled="false" aria-label="Row Table 1, seat T1-1, Standard, MYR 25.00, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available kerusi-seat--companion" data-seat-id="T1-1" data-seat-row="T1" data-seat-status="available" data-seat-type="std" data-section-id="stalls" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 1280.381 213.177 A 3.2 3.2 0 0 1 1283.2 210 L 1316.8 210 A 3.2 3.2 0 0 1 1319.619 213.177 L 1316.82 236.497 A 13.6 13.6 0 0 1 1301.6 250 L 1298.4 250 A 13.6 13.6 0 0 1 1283.18 236.497 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="1300" y="230">T1-1
    <g aria-disabled="true" aria-label="Row Table 1, seat T1-2, Standard, MYR 25.00, on hold, unavailable." aria-pressed="false" class="kerusi-seat kerusi-seat--companion kerusi-seat--held kerusi-seat--unselectable" data-seat-id="T1-2" data-seat-row="T1" data-seat-status="held" data-seat-type="std" data-section-id="stalls" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 1350.381 283.177 A 3.2 3.2 0 0 1 1353.2 280 L 1386.8 280 A 3.2 3.2 0 0 1 1389.619 283.177 L 1386.82 306.497 A 13.6 13.6 0 0 1 1371.6 320 L 1368.4 320 A 13.6 13.6 0 0 1 1353.18 306.497 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <path class="kerusi-seat__wash" d="M 1350.381 283.177 A 3.2 3.2 0 0 1 1353.2 280 L 1386.8 280 A 3.2 3.2 0 0 1 1389.619 283.177 L 1386.82 306.497 A 13.6 13.6 0 0 1 1371.6 320 L 1368.4 320 A 13.6 13.6 0 0 1 1353.18 306.497 Z" style="fill: var(--kerusi-held-bg, #4a3500)">
      <path class="kerusi-seat__occupant kerusi-seat__occupant--held" d="M 1363.8 292 a 6.2 6.2 0 1 1 12.4 0 a 6.2 6.2 0 1 1 -12.4 0 Z M 1361.2 314.4 C 1361.2 303.2 1364.4 300 1370 300 C 1375.6 300 1378.8 303.2 1378.8 314.4 Z" stroke-width="2" style="fill: none; stroke: var(--kerusi-held-fg, #ffe1a8)">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="1370" y="300">T1-2
    <g aria-disabled="false" aria-label="Row Table 1, seat T1-3, Standard, MYR 25.00, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available kerusi-seat--companion" data-seat-id="T1-3" data-seat-row="T1" data-seat-status="available" data-seat-type="std" data-section-id="stalls" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 1280.381 353.177 A 3.2 3.2 0 0 1 1283.2 350 L 1316.8 350 A 3.2 3.2 0 0 1 1319.619 353.177 L 1316.82 376.497 A 13.6 13.6 0 0 1 1301.6 390 L 1298.4 390 A 13.6 13.6 0 0 1 1283.18 376.497 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="1300" y="370">T1-3
    <g aria-disabled="false" aria-label="Row Table 1, seat T1-4, Standard, MYR 25.00, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available kerusi-seat--companion" data-seat-id="T1-4" data-seat-row="T1" data-seat-status="available" data-seat-type="std" data-section-id="stalls" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 1210.381 283.177 A 3.2 3.2 0 0 1 1213.2 280 L 1246.8 280 A 3.2 3.2 0 0 1 1249.619 283.177 L 1246.82 306.497 A 13.6 13.6 0 0 1 1231.6 320 L 1228.4 320 A 13.6 13.6 0 0 1 1213.18 306.497 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="1230" y="300">T1-4
    <g aria-disabled="false" aria-label="Seat S1, Wheelchair space, MYR 25.00, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available" data-seat-id="S1" data-seat-status="available" data-seat-type="wheelchair" data-section-id="stalls" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 1388.381 685.177 A 3.2 3.2 0 0 1 1391.2 682 L 1424.8 682 A 3.2 3.2 0 0 1 1427.619 685.177 L 1424.82 708.497 A 13.6 13.6 0 0 1 1409.6 722 L 1406.4 722 A 13.6 13.6 0 0 1 1391.18 708.497 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="1408" y="702">S1
  <g aria-label="Balcony" class="kerusi-section" data-section-id="balcony" role="group">
    <text aria-hidden="true" class="kerusi-section-label" dominant-baseline="hanging" font-size="20" style="fill: var(--kerusi-element-fg, #3a4353)" text-anchor="start" x="440" y="550">Balcony
    <g aria-disabled="false" aria-label="Row L, seat L1, Standard, MYR 25.00, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available" data-seat-id="L1" data-seat-row="L" data-seat-status="available" data-seat-type="std" data-section-id="balcony" role="button" tabindex="0">
      <path class="kerusi-seat__box" d="M 460.381 597.177 A 3.2 3.2 0 0 1 463.2 594 L 496.8 594 A 3.2 3.2 0 0 1 499.619 597.177 L 496.82 620.497 A 13.6 13.6 0 0 1 481.6 634 L 478.4 634 A 13.6 13.6 0 0 1 463.18 620.497 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="480" y="614">L1
    <g aria-disabled="false" aria-label="Row L, seat L2, Standard, MYR 25.00, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available" data-seat-id="L2" data-seat-row="L" data-seat-status="available" data-seat-type="std" data-section-id="balcony" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 561.381 644.177 A 3.2 3.2 0 0 1 564.2 641 L 597.8 641 A 3.2 3.2 0 0 1 600.619 644.177 L 597.82 667.497 A 13.6 13.6 0 0 1 582.6 681 L 579.4 681 A 13.6 13.6 0 0 1 564.18 667.497 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="581" y="661">L2
    <g aria-disabled="false" aria-label="Row L, seat L3, Standard, MYR 25.00, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available" data-seat-id="L3" data-seat-row="L" data-seat-status="available" data-seat-type="std" data-section-id="balcony" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 669.381 673.177 A 3.2 3.2 0 0 1 672.2 670 L 705.8 670 A 3.2 3.2 0 0 1 708.619 673.177 L 705.82 696.497 A 13.6 13.6 0 0 1 690.6 710 L 687.4 710 A 13.6 13.6 0 0 1 672.18 696.497 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="689" y="690">L3
    <g aria-disabled="false" aria-label="Row L, seat L4, Standard, MYR 25.00, available." aria-pressed="true" class="kerusi-seat kerusi-seat--available kerusi-seat--selected" data-seat-id="L4" data-seat-row="L" data-seat-status="available" data-seat-type="std" data-section-id="balcony" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 780.381 683.177 A 3.2 3.2 0 0 1 783.2 680 L 816.8 680 A 3.2 3.2 0 0 1 819.619 683.177 L 816.82 706.497 A 13.6 13.6 0 0 1 801.6 720 L 798.4 720 A 13.6 13.6 0 0 1 783.18 706.497 Z" style="fill: var(--kerusi-selected-bg, #7854af)">
      <path class="kerusi-seat__core" d="M 784.305 686.542 A 2.56 2.56 0 0 1 786.56 684 L 813.44 684 A 2.56 2.56 0 0 1 815.695 686.542 L 813.456 705.197 A 10.88 10.88 0 0 1 801.28 716 L 798.72 716 A 10.88 10.88 0 0 1 786.544 705.197 Z" style="fill: var(--kerusi-selected-fg, #f3ecff)">
      <path class="kerusi-seat__occupant kerusi-seat__occupant--selected" d="M 795.04 693.6 a 4.96 4.96 0 1 1 9.92 0 a 4.96 4.96 0 1 1 -9.92 0 Z M 792.96 711.52 C 792.96 702.56 795.52 700 800 700 C 804.48 700 807.04 702.56 807.04 711.52 Z" stroke-width="1.6" style="fill: var(--kerusi-selected-bg, #7854af); stroke: none">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="3.52" style="fill: var(--kerusi-selected-bg, #7854af); stroke: var(--kerusi-selected-fg, #f3ecff)" text-anchor="middle" x="800" y="700">L4
    <g aria-disabled="false" aria-label="Row L, seat L5, Standard, MYR 25.00, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available" data-seat-id="L5" data-seat-row="L" data-seat-status="available" data-seat-type="std" data-section-id="balcony" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 910.381 743.177 A 3.2 3.2 0 0 1 913.2 740 L 946.8 740 A 3.2 3.2 0 0 1 949.619 743.177 L 946.82 766.497 A 13.6 13.6 0 0 1 931.6 780 L 928.4 780 A 13.6 13.6 0 0 1 913.18 766.497 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="930" y="760">L5
    <g aria-disabled="false" aria-label="Row L, seat L6, Standard, MYR 25.00, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available" data-seat-id="L6" data-seat-row="L" data-seat-status="available" data-seat-type="std" data-section-id="balcony" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 999.381 644.177 A 3.2 3.2 0 0 1 1002.2 641 L 1035.8 641 A 3.2 3.2 0 0 1 1038.619 644.177 L 1035.82 667.497 A 13.6 13.6 0 0 1 1020.6 681 L 1017.4 681 A 13.6 13.6 0 0 1 1002.18 667.497 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="1019" y="661">L6
    <g aria-disabled="true" aria-label="Row L, seat L7, Standard, MYR 25.00, blocked by the venue, unavailable." aria-pressed="false" class="kerusi-seat kerusi-seat--blocked kerusi-seat--unselectable" data-seat-id="L7" data-seat-row="L" data-seat-status="blocked" data-seat-type="std" data-section-id="balcony" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 1100.381 597.177 A 3.2 3.2 0 0 1 1103.2 594 L 1136.8 594 A 3.2 3.2 0 0 1 1139.619 597.177 L 1136.82 620.497 A 13.6 13.6 0 0 1 1121.6 634 L 1118.4 634 A 13.6 13.6 0 0 1 1103.18 620.497 Z" style="fill: var(--kerusi-blocked-bg, #5a616e)">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-blocked-fg, #d2d7df); stroke: none" text-anchor="middle" x="1120" y="614">L7`;

/**
 * One seat of each of four forms (§4.7.1), one of them turned a quarter, in all
 * four of the statuses a form's outline carries: so the bindings are held to
 * drawing the form outlines, and their washes, cores and markers, identically
 * (#51).
 */
export const PARITY_FORMS_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'forms',
  canvas: { width: 400, height: 200 },
  seatSize: 40,
  legend: [
    { id: 'arm', label: 'Armchair', form: 'armchair' },
    { id: 'stool', label: 'Stool', form: 'stool' },
    { id: 'space', label: 'Wheelchair space', form: 'wheelchair-space' },
    { id: 'sofa', label: 'Sofa place', form: 'sofa' },
  ],
  sections: [
    {
      id: 'lounge',
      seats: [
        { id: 'A1', x: 60, y: 60, type: 'arm' },
        { id: 'A2', x: 140, y: 60, type: 'stool' },
        {
          id: 'A3',
          x: 220,
          y: 60,
          type: 'space',
          accessibility: { wheelchairAccessible: true },
        },
        { id: 'A4', x: 300, y: 60, type: 'sofa', rotation: 90 },
        { id: 'B1', x: 60, y: 140, type: 'arm', rotation: 180 },
        { id: 'B2', x: 140, y: 140, type: 'stool' },
        { id: 'B3', x: 220, y: 140, type: 'space' },
        { id: 'B4', x: 300, y: 140, type: 'sofa' },
      ],
    },
  ],
};

export const PARITY_FORMS_STATE: KerusiState = {
  kerusi: '1.0',
  mapId: 'forms',
  updatedAt: '2026-10-20T09:00:00Z',
  seats: {
    A1: { status: 'booked' },
    A3: { status: 'held' },
    B2: { status: 'booked' },
  },
};

export const PARITY_FORMS_SELECTION: readonly string[] = ['A4', 'B3'];

/** What {@link svgSignature} gives for {@link PARITY_FORMS_MAP}; see the note at the top. */
export const PARITY_FORMS_SIGNATURE = `<svg class="kerusi-seatmap__svg" focusable="false" preserveAspectRatio="xMidYMid meet" role="presentation" style="--kerusi-focus-ring-input: #1b1f27; max-width: 400px" viewBox="0 0 400 200">
  <rect height="200" style="fill: var(--kerusi-backdrop, transparent)" width="400" x="0" y="0">
  <g aria-label="lounge" class="kerusi-section" data-section-id="lounge" role="group">
    <g aria-disabled="true" aria-label="Seat A1, Armchair, no price, booked, unavailable." aria-pressed="false" class="kerusi-seat kerusi-seat--booked kerusi-seat--unselectable" data-seat-id="A1" data-seat-status="booked" data-seat-type="arm" data-section-id="lounge" role="button" tabindex="0">
      <path class="kerusi-seat__box" d="M 40 44.8 A 4.8 4.8 0 0 1 44.8 40 L 47.2 40 A 2.4 2.4 0 0 1 49.6 42.4 L 49.6 42.8 A 2 2 0 0 0 51.6 44.8 L 68.4 44.8 A 2 2 0 0 0 70.4 42.8 L 70.4 42.4 A 2.4 2.4 0 0 1 72.8 40 L 75.2 40 A 4.8 4.8 0 0 1 80 44.8 L 80 72.8 A 7.2 7.2 0 0 1 72.8 80 L 47.2 80 A 7.2 7.2 0 0 1 40 72.8 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <path class="kerusi-seat__wash" d="M 40 44.8 A 4.8 4.8 0 0 1 44.8 40 L 47.2 40 A 2.4 2.4 0 0 1 49.6 42.4 L 49.6 42.8 A 2 2 0 0 0 51.6 44.8 L 68.4 44.8 A 2 2 0 0 0 70.4 42.8 L 70.4 42.4 A 2.4 2.4 0 0 1 72.8 40 L 75.2 40 A 4.8 4.8 0 0 1 80 44.8 L 80 72.8 A 7.2 7.2 0 0 1 72.8 80 L 47.2 80 A 7.2 7.2 0 0 1 40 72.8 Z" style="fill: var(--kerusi-booked-bg, #5e0c17)">
      <path class="kerusi-seat__occupant kerusi-seat__occupant--booked" d="M 53.8 52 a 6.2 6.2 0 1 1 12.4 0 a 6.2 6.2 0 1 1 -12.4 0 Z M 51.2 74.4 C 51.2 63.2 54.4 60 60 60 C 65.6 60 68.8 63.2 68.8 74.4 Z" stroke-width="2" style="fill: var(--kerusi-booked-fg, #ffc9d0); stroke: none">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="60" y="60">A1
    <g aria-disabled="false" aria-label="Seat B1, Armchair, no price, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available" data-seat-id="B1" data-seat-status="available" data-seat-type="arm" data-section-id="lounge" role="button" tabindex="-1" transform="rotate(180 60 140)">
      <path class="kerusi-seat__box" d="M 40 124.8 A 4.8 4.8 0 0 1 44.8 120 L 47.2 120 A 2.4 2.4 0 0 1 49.6 122.4 L 49.6 122.8 A 2 2 0 0 0 51.6 124.8 L 68.4 124.8 A 2 2 0 0 0 70.4 122.8 L 70.4 122.4 A 2.4 2.4 0 0 1 72.8 120 L 75.2 120 A 4.8 4.8 0 0 1 80 124.8 L 80 152.8 A 7.2 7.2 0 0 1 72.8 160 L 47.2 160 A 7.2 7.2 0 0 1 40 152.8 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" transform="rotate(-180 60 140)" x="60" y="140">B1
    <g aria-disabled="false" aria-label="Seat A2, Stool, no price, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available" data-seat-id="A2" data-seat-status="available" data-seat-type="stool" data-section-id="lounge" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 122.4 60 A 17.6 17.6 0 1 1 157.6 60 A 17.6 17.6 0 1 1 122.4 60 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="140" y="60">A2
    <g aria-disabled="true" aria-label="Seat B2, Stool, no price, booked, unavailable." aria-pressed="false" class="kerusi-seat kerusi-seat--booked kerusi-seat--unselectable" data-seat-id="B2" data-seat-status="booked" data-seat-type="stool" data-section-id="lounge" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 122.4 140 A 17.6 17.6 0 1 1 157.6 140 A 17.6 17.6 0 1 1 122.4 140 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <path class="kerusi-seat__wash" d="M 122.4 140 A 17.6 17.6 0 1 1 157.6 140 A 17.6 17.6 0 1 1 122.4 140 Z" style="fill: var(--kerusi-booked-bg, #5e0c17)">
      <path class="kerusi-seat__occupant kerusi-seat__occupant--booked" d="M 133.8 132 a 6.2 6.2 0 1 1 12.4 0 a 6.2 6.2 0 1 1 -12.4 0 Z M 131.2 154.4 C 131.2 143.2 134.4 140 140 140 C 145.6 140 148.8 143.2 148.8 154.4 Z" stroke-width="2" style="fill: var(--kerusi-booked-fg, #ffc9d0); stroke: none">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="140" y="140">B2
    <g aria-disabled="true" aria-label="Seat A3, Wheelchair space, no price, on hold, unavailable, wheelchair accessible." aria-pressed="false" class="kerusi-seat kerusi-seat--held kerusi-seat--unselectable kerusi-seat--wheelchair" data-seat-id="A3" data-seat-status="held" data-seat-type="space" data-section-id="lounge" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 200 45.6 A 5.6 5.6 0 0 1 205.6 40 L 234.4 40 A 5.6 5.6 0 0 1 240 45.6 L 240 74.4 A 5.6 5.6 0 0 1 234.4 80 L 205.6 80 A 5.6 5.6 0 0 1 200 74.4 Z M 211.2 48 A 3.2 3.2 0 0 0 208 51.2 L 208 68.8 A 3.2 3.2 0 0 0 211.2 72 L 228.8 72 A 3.2 3.2 0 0 0 232 68.8 L 232 51.2 A 3.2 3.2 0 0 0 228.8 48 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <path class="kerusi-seat__wash" d="M 200 45.6 A 5.6 5.6 0 0 1 205.6 40 L 234.4 40 A 5.6 5.6 0 0 1 240 45.6 L 240 74.4 A 5.6 5.6 0 0 1 234.4 80 L 205.6 80 A 5.6 5.6 0 0 1 200 74.4 Z M 211.2 48 A 3.2 3.2 0 0 0 208 51.2 L 208 68.8 A 3.2 3.2 0 0 0 211.2 72 L 228.8 72 A 3.2 3.2 0 0 0 232 68.8 L 232 51.2 A 3.2 3.2 0 0 0 228.8 48 Z" style="fill: var(--kerusi-held-bg, #4a3500)">
      <path class="kerusi-seat__occupant kerusi-seat__occupant--held" d="M 213.8 52 a 6.2 6.2 0 1 1 12.4 0 a 6.2 6.2 0 1 1 -12.4 0 Z M 211.2 74.4 C 211.2 63.2 214.4 60 220 60 C 225.6 60 228.8 63.2 228.8 74.4 Z" stroke-width="2" style="fill: none; stroke: var(--kerusi-held-fg, #ffe1a8)">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="220" y="60">A3
      <circle class="kerusi-seat__wheelchair" cx="233.6" cy="46.4" r="5.2" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08))">
    <g aria-disabled="false" aria-label="Seat B3, Wheelchair space, no price, available." aria-pressed="true" class="kerusi-seat kerusi-seat--available kerusi-seat--selected" data-seat-id="B3" data-seat-status="available" data-seat-type="space" data-section-id="lounge" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 200 125.6 A 5.6 5.6 0 0 1 205.6 120 L 234.4 120 A 5.6 5.6 0 0 1 240 125.6 L 240 154.4 A 5.6 5.6 0 0 1 234.4 160 L 205.6 160 A 5.6 5.6 0 0 1 200 154.4 Z M 211.2 128 A 3.2 3.2 0 0 0 208 131.2 L 208 148.8 A 3.2 3.2 0 0 0 211.2 152 L 228.8 152 A 3.2 3.2 0 0 0 232 148.8 L 232 131.2 A 3.2 3.2 0 0 0 228.8 128 Z" style="fill: var(--kerusi-selected-bg, #7854af)">
      <path class="kerusi-seat__core" d="M 204 128.48 A 4.48 4.48 0 0 1 208.48 124 L 231.52 124 A 4.48 4.48 0 0 1 236 128.48 L 236 151.52 A 4.48 4.48 0 0 1 231.52 156 L 208.48 156 A 4.48 4.48 0 0 1 204 151.52 Z M 212.96 130.4 A 2.56 2.56 0 0 0 210.4 132.96 L 210.4 147.04 A 2.56 2.56 0 0 0 212.96 149.6 L 227.04 149.6 A 2.56 2.56 0 0 0 229.6 147.04 L 229.6 132.96 A 2.56 2.56 0 0 0 227.04 130.4 Z" style="fill: var(--kerusi-selected-fg, #f3ecff)">
      <path class="kerusi-seat__occupant kerusi-seat__occupant--selected" d="M 215.04 133.6 a 4.96 4.96 0 1 1 9.92 0 a 4.96 4.96 0 1 1 -9.92 0 Z M 212.96 151.52 C 212.96 142.56 215.52 140 220 140 C 224.48 140 227.04 142.56 227.04 151.52 Z" stroke-width="1.6" style="fill: var(--kerusi-selected-bg, #7854af); stroke: none">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="3.52" style="fill: var(--kerusi-selected-bg, #7854af); stroke: var(--kerusi-selected-fg, #f3ecff)" text-anchor="middle" x="220" y="140">B3
    <g aria-disabled="false" aria-label="Seat A4, Sofa place, no price, available." aria-pressed="true" class="kerusi-seat kerusi-seat--available kerusi-seat--selected" data-seat-id="A4" data-seat-status="available" data-seat-type="sofa" data-section-id="lounge" role="button" tabindex="-1" transform="rotate(90 300 60)">
      <path class="kerusi-seat__box" d="M 282.4 44 A 3.2 3.2 0 0 1 285.6 40.8 L 314.4 40.8 A 3.2 3.2 0 0 1 317.6 44 L 317.6 63.6 A 1.2 1.2 0 0 0 318.8 64.8 L 318.8 64.8 A 1.2 1.2 0 0 1 320 66 L 320 76 A 4 4 0 0 1 316 80 L 284 80 A 4 4 0 0 1 280 76 L 280 66 A 1.2 1.2 0 0 1 281.2 64.8 L 281.2 64.8 A 1.2 1.2 0 0 0 282.4 63.6 Z" style="fill: var(--kerusi-selected-bg, #7854af)">
      <path class="kerusi-seat__core" d="M 285.92 47.2 A 2.56 2.56 0 0 1 288.48 44.64 L 311.52 44.64 A 2.56 2.56 0 0 1 314.08 47.2 L 314.08 62.88 A 0.96 0.96 0 0 0 315.04 63.84 L 315.04 63.84 A 0.96 0.96 0 0 1 316 64.8 L 316 72.8 A 3.2 3.2 0 0 1 312.8 76 L 287.2 76 A 3.2 3.2 0 0 1 284 72.8 L 284 64.8 A 0.96 0.96 0 0 1 284.96 63.84 L 284.96 63.84 A 0.96 0.96 0 0 0 285.92 62.88 Z" style="fill: var(--kerusi-selected-fg, #f3ecff)">
      <path class="kerusi-seat__occupant kerusi-seat__occupant--selected" d="M 295.04 53.6 a 4.96 4.96 0 1 1 9.92 0 a 4.96 4.96 0 1 1 -9.92 0 Z M 292.96 71.52 C 292.96 62.56 295.52 60 300 60 C 304.48 60 307.04 62.56 307.04 71.52 Z" stroke-width="1.6" style="fill: var(--kerusi-selected-bg, #7854af); stroke: none">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="3.52" style="fill: var(--kerusi-selected-bg, #7854af); stroke: var(--kerusi-selected-fg, #f3ecff)" text-anchor="middle" transform="rotate(-90 300 60)" x="300" y="60">A4
    <g aria-disabled="false" aria-label="Seat B4, Sofa place, no price, available." aria-pressed="false" class="kerusi-seat kerusi-seat--available" data-seat-id="B4" data-seat-status="available" data-seat-type="sofa" data-section-id="lounge" role="button" tabindex="-1">
      <path class="kerusi-seat__box" d="M 282.4 124 A 3.2 3.2 0 0 1 285.6 120.8 L 314.4 120.8 A 3.2 3.2 0 0 1 317.6 124 L 317.6 143.6 A 1.2 1.2 0 0 0 318.8 144.8 L 318.8 144.8 A 1.2 1.2 0 0 1 320 146 L 320 156 A 4 4 0 0 1 316 160 L 284 160 A 4 4 0 0 1 280 156 L 280 146 A 1.2 1.2 0 0 1 281.2 144.8 L 281.2 144.8 A 1.2 1.2 0 0 0 282.4 143.6 Z" style="fill: var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))">
      <text class="kerusi-seat__label" dominant-baseline="central" font-size="16" stroke-width="0" style="fill: var(--kerusi-seat-label, var(--kerusi-available-fg, #123a08)); stroke: none" text-anchor="middle" x="300" y="140">B4`;
