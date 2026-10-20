import { NgTemplateOutlet } from '@angular/common';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  KerusiMap,
  KerusiState,
  KerusiViolation,
  SeatStyleFn,
  SeatTypeStyles,
  seatBodyPath,
} from '@kerusiweb/core';
import {
  PARITY_FORMS_MAP,
  PARITY_FORMS_SELECTION,
  PARITY_FORMS_SIGNATURE,
  PARITY_FORMS_STATE,
  PARITY_MAP,
  PARITY_SELECTION,
  PARITY_SIGNATURE,
  PARITY_STATE,
  svgSignature,
} from '../../../../core/src/testing/parity.fixture';
import { KerusiSeatmapComponent, SeatDisallowed } from './kerusi-seatmap.component';
import { KerusiSeatTemplateDirective } from './kerusi-seat-template.directive';

/**
 * Two sections side by side on one canvas: stalls in a row with an aisle and
 * declared bounds, and a balcony with no rows or bounds holding a companion
 * pair, one seat of it turned.
 */
const VENUE: KerusiMap = {
  kerusi: '1.0',
  id: 'venue',
  name: 'Panggung Bandaraya',
  locale: 'en',
  canvas: { width: 400, height: 200 },
  seatSize: 28,
  legend: [
    { id: 'standard', label: { en: 'Standard', ms: 'Biasa' }, color: '#3a8f63' },
    { id: 'sofa', label: { en: 'Sofa' }, defaultPriceTier: 'top' },
  ],
  priceTiers: [{ id: 'top', price: { amount: 9000, currency: 'MYR' } }],
  sections: [
    {
      id: 'stalls',
      index: 1,
      label: { en: 'Stalls', ms: 'Bawah' },
      bounds: { x: 0, y: 0, width: 200, height: 200 },
      rows: [{ id: 'A', label: 'A', index: 0 }],
      seats: [
        { id: 'A1', label: '1', row: 'A', col: 1, x: 30, y: 120, type: 'standard' },
        { id: 'A2', label: '2', row: 'A', col: 2, x: 64, y: 120, type: 'standard' },
        // Col 3 is the aisle.
        { id: 'A4', label: '4', row: 'A', col: 4, x: 132, y: 120, type: 'standard' },
      ],
      elements: [{ id: 'exit-a', kind: 'exit', label: 'Exit', x: 180, y: 120 }],
    },
    {
      id: 'balcony',
      index: 2,
      label: { en: 'Balcony', ms: 'Balkoni' },
      seats: [
        { id: 'L1', label: 'L1', x: 260, y: 100, type: 'sofa', companions: ['L2'] },
        {
          id: 'L2',
          label: 'L2',
          x: 300,
          y: 100,
          rotation: 10,
          type: 'sofa',
          companions: ['L1'],
        },
      ],
    },
  ],
};

@Component({
  imports: [KerusiSeatmapComponent],
  template: `
    <kerusi-seatmap
      [map]="map()"
      [state]="state()"
      [(selection)]="selection"
      [locale]="locale()"
      [showLegend]="showLegend()"
      [maxSelection]="maxSelection()"
      [seatStyle]="seatStyle()"
      [seatTypeStyles]="seatTypeStyles()"
      (seatDisallowed)="disallowed.set($event)"
      (validationIssues)="issues.set($event)"
    />
  `,
})
class Host {
  readonly map = signal<KerusiMap>(VENUE);
  readonly state = signal<KerusiState | undefined>(undefined);
  readonly selection = signal<readonly string[]>([]);
  readonly locale = signal<string | undefined>(undefined);
  readonly showLegend = signal(false);
  readonly maxSelection = signal<number | undefined>(undefined);
  readonly seatStyle = signal<SeatStyleFn | undefined>(undefined);
  readonly seatTypeStyles = signal<SeatTypeStyles | undefined>(undefined);
  readonly disallowed = signal<SeatDisallowed | undefined>(undefined);
  readonly issues = signal<readonly KerusiViolation[]>([]);
}

/** Renders the map component alone, with the given inputs, for a one-off check. */
function renderAlone(inputs: Record<string, unknown>): HTMLElement {
  const fixture = TestBed.createComponent(KerusiSeatmapComponent);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('KerusiSeatmapComponent', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  const seats = () => [...el.querySelectorAll<SVGGElement>('g.kerusi-seat')];
  const seat = (id: string) => el.querySelector<SVGGElement>(`[data-seat-id="${id}"]`)!;
  const svgs = () => [...el.querySelectorAll<SVGSVGElement>('svg.kerusi-seatmap__svg')];
  const groups = () => [...el.querySelectorAll<SVGGElement>('g.kerusi-section')];
  const box = (id: string) => seat(id).querySelector<SVGPathElement>('.kerusi-seat__box')!;
  const core = (id: string) => seat(id).querySelector<SVGPathElement>('.kerusi-seat__core')!;
  const label = (id: string) => seat(id).querySelector<SVGTextElement>('.kerusi-seat__label')!;

  /**
   * Every on-curve point in a `d` string, as a flat `[x0, y0, x1, y1, ...]`
   * list — mirrors the helper in `seat-shapes.spec.ts`. Skips an `A`
   * command's `rx ry x-axis-rotation large-arc-flag sweep-flag` numbers,
   * which are not coordinates and are frequently 0 — indistinguishable from a
   * real minimum if left in.
   */
  const pathPoints = (d: string): number[] => {
    const out: number[] = [];
    const tokens = d.trim().split(/\s+/);
    let i = 0;
    while (i < tokens.length) {
      const cmd = tokens[i];
      if (cmd === 'M' || cmd === 'L') {
        out.push(Number(tokens[i + 1]), Number(tokens[i + 2]));
        i += 3;
      } else if (cmd === 'A') {
        out.push(Number(tokens[i + 6]), Number(tokens[i + 7]));
        i += 8;
      } else {
        i += 1;
      }
    }
    return out;
  };

  describe('one canvas (§4.5, D1)', () => {
    it('draws the whole map as one svg whose viewBox is the canvas', () => {
      expect(svgs()).toHaveLength(1);
      expect(svgs()[0].getAttribute('viewBox')).toBe('0 0 400 200');
    });

    it('makes each section a named group on it, in Section.index order', () => {
      expect(groups().map((g) => g.getAttribute('data-section-id'))).toEqual(['stalls', 'balcony']);
      expect(groups().map((g) => g.getAttribute('role'))).toEqual(['group', 'group']);
      expect(groups().map((g) => g.getAttribute('aria-label'))).toEqual(['Stalls', 'Balcony']);
    });

    it('creates the section groups and their marks in the SVG namespace', () => {
      expect(groups()[0].namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(box('A1').namespaceURI).toBe('http://www.w3.org/2000/svg');
    });

    it('draws every seat at its x/y, at the seat size, turned by its rotation', () => {
      for (const section of VENUE.sections) {
        for (const doc of section.seats) {
          const half = VENUE.seatSize / 2;
          const d = seatBodyPath(doc.x - half, doc.y - half, VENUE.seatSize, VENUE.seatSize);
          expect(box(doc.id).getAttribute('d')).toBe(d);
          expect(label(doc.id).getAttribute('x')).toBe(String(doc.x));
          expect(label(doc.id).getAttribute('y')).toBe(String(doc.y));
          expect(seat(doc.id).getAttribute('transform')).toBe(
            doc.rotation ? `rotate(${doc.rotation} ${doc.x} ${doc.y})` : null,
          );
        }
      }
    });

    it('caps the drawing at unitScale CSS pixels per canvas unit', () => {
      expect(svgs()[0].style.maxWidth).toBe('400px');
      const scaled = renderAlone({ map: VENUE, unitScale: 2 });
      expect(scaled.querySelector<SVGSVGElement>('svg')!.style.maxWidth).toBe('800px');
    });

    it('draws an element at its x/y, at the seat size when it gives none', () => {
      const exit = el.querySelector('.kerusi-element--exit rect')!;
      expect(['x', 'y', 'width', 'height'].map((a) => exit.getAttribute(a))).toEqual([
        '166',
        '106',
        '28',
        '28',
      ]);
    });

    it('emits no filler node for the skipped aisle col (§4.3.2)', () => {
      expect(seats()).toHaveLength(5);
    });

    it('leaves a hidden section’s space empty: the canvas keeps its size (D4)', () => {
      const hidden = renderAlone({ map: VENUE, sectionOverrides: { stalls: { hidden: true } } });
      expect(hidden.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 400 200');
      expect(hidden.querySelector('[data-section-id="stalls"]')).toBeNull();
      expect(
        hidden.querySelector('[data-seat-id="L1"] .kerusi-seat__label')!.getAttribute('x'),
      ).toBe('260');
    });
  });

  describe('section labels (D5)', () => {
    const drawn = (root: HTMLElement) =>
      [...root.querySelectorAll<SVGTextElement>('text.kerusi-section-label')].map((t) =>
        t.textContent?.trim(),
      );

    it('draws a label only for a section that declares bounds', () => {
      expect(drawn(el)).toEqual(['Stalls']);
    });

    it('puts it at the top-left of the bounds, hidden from assistive technology', () => {
      const text = el.querySelector<SVGTextElement>('text.kerusi-section-label')!;
      // Seat size 28: inset 7, font 14.
      expect(['x', 'y', 'font-size'].map((a) => text.getAttribute(a))).toEqual(['7', '7', '14']);
      expect(text.getAttribute('aria-hidden')).toBe('true');
      expect(text.closest('g.kerusi-section')!.getAttribute('aria-label')).toBe('Stalls');
    });

    it('draws none when showSectionLabels is off, and keeps the accessible names', () => {
      const plain = renderAlone({ map: VENUE, showSectionLabels: false });
      expect(drawn(plain)).toEqual([]);
      expect(plain.querySelector('g.kerusi-section')!.getAttribute('aria-label')).toBe('Stalls');
    });

    it('takes an overridden label', () => {
      const renamed = renderAlone({ map: VENUE, sectionOverrides: { stalls: { label: 'Floor' } } });
      expect(drawn(renamed)).toEqual(['Floor']);
    });
  });

  describe('right-to-left: the whole canvas mirrors (D3)', () => {
    const rtl = () => renderAlone({ map: VENUE, rtl: true });

    it('mirrors x about the canvas and negates rotation', () => {
      const root = rtl();
      const at = (id: string) =>
        root.querySelector(`[data-seat-id="${id}"] .kerusi-seat__label`)!.getAttribute('x');
      expect(at('A1')).toBe('370');
      expect(at('L1')).toBe('140');
      expect(root.querySelector('[data-seat-id="L2"]')!.getAttribute('transform')).toBe(
        'rotate(-10 100 100)',
      );
    });

    it('moves the section label to the top-right of its mirrored bounds', () => {
      const text = rtl().querySelector('text.kerusi-section-label')!;
      expect(text.getAttribute('x')).toBe('393');
    });
  });

  describe('text label elements', () => {
    const withLabels = (): KerusiMap => {
      const map: KerusiMap = JSON.parse(JSON.stringify(VENUE));
      map.sections[1].elements = [
        { id: 'heading', kind: 'Label', label: 'Balcony', x: 280, y: 30, width: 80, height: 20 },
        {
          id: 'turned',
          kind: 'label',
          label: 'Table 3',
          x: 240,
          y: 160,
          width: 30,
          height: 18,
          rotation: 90,
        },
        { id: 'blank', kind: 'label', x: 360, y: 160, width: 30, height: 18 },
      ];
      return map;
    };

    const labelEl = (id: string) =>
      [...el.querySelectorAll<SVGGElement>('.kerusi-element--label, .kerusi-element--Label')].find(
        (g) => g.textContent?.trim() === id,
      );

    beforeEach(() => {
      host.map.set(withLabels());
      fixture.detectChanges();
    });

    it('draws only the text, with no rect or path', () => {
      const g = labelEl('Balcony')!;
      expect(g).toBeDefined();
      expect(g.querySelectorAll('rect, path')).toHaveLength(0);
      const text = g.querySelector('text')!;
      expect(text.getAttribute('text-anchor')).toBe('middle');
      expect(g.getAttribute('transform')).toBeNull();
    });

    it('rotates the text about the box centre without counter-rotating it', () => {
      const g = labelEl('Table 3')!;
      expect(g.getAttribute('transform')).toMatch(/^rotate\(90 [\d.]+ [\d.]+\)$/);
      expect(g.querySelector('text')!.getAttribute('transform')).toBeNull();
    });

    it('draws nothing for an element with no label', () => {
      const labels = el.querySelectorAll('.kerusi-element--label, .kerusi-element--Label');
      expect(labels).toHaveLength(2);
    });

    it('leaves other element kinds drawn as before', () => {
      const exit = el.querySelector('.kerusi-element--exit')!;
      expect(exit.querySelector('rect')).not.toBeNull();
    });
  });

  describe('localization', () => {
    it('renders localized section labels for the map locale', () => {
      host.locale.set('ms');
      fixture.detectChanges();
      expect(groups().map((g) => g.getAttribute('aria-label'))).toEqual(['Bawah', 'Balkoni']);
    });
  });

  describe('selection', () => {
    it('round-trips through the two-way binding', () => {
      seat('A1').dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
      expect(host.selection()).toEqual(['A1']);
      expect(seat('A1').getAttribute('aria-pressed')).toBe('true');

      seat('A1').dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
      expect(host.selection()).toEqual([]);
    });

    it('honors a selection pushed in from the parent', () => {
      host.selection.set(['A2']);
      fixture.detectChanges();
      expect(seat('A2').getAttribute('aria-pressed')).toBe('true');
    });

    it('selects a companion pair together (§4.6)', () => {
      seat('L1').dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
      expect([...host.selection()].sort()).toEqual(['L1', 'L2']);
    });

    it('never mutates the seats — no in-place selected flag', () => {
      const before = host.map();
      seat('A1').dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
      expect(host.map()).toBe(before);
      expect(JSON.stringify(before.sections[0].seats)).not.toContain('selected');
    });
  });

  describe('disallowed reasons', () => {
    const withStatus = (id: string, status: 'booked' | 'held' | 'blocked') => {
      host.state.set({
        kerusi: '1.0',
        mapId: 'venue',
        updatedAt: '2026-08-19T10:00:00Z',
        seats: { [id]: { status } },
      });
      fixture.detectChanges();
    };

    it('reports the seat status as the reason', () => {
      for (const status of ['booked', 'held', 'blocked'] as const) {
        withStatus('A1', status);
        seat('A1').dispatchEvent(new MouseEvent('click'));
        fixture.detectChanges();
        expect(host.disallowed()!.reason).toBe(status);
        expect(host.selection()).toEqual([]);
      }
    });

    it('marks an unavailable seat aria-disabled', () => {
      withStatus('A1', 'booked');
      expect(seat('A1').getAttribute('aria-disabled')).toBe('true');
      expect(seat('A2').getAttribute('aria-disabled')).toBe('false');
    });

    it('reports max-selection, counting the companion closure', () => {
      host.maxSelection.set(1);
      fixture.detectChanges();
      seat('L1').dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
      expect(host.disallowed()!.reason).toBe('max-selection');
    });

    it('reports companion-unavailable when the pair cannot be completed', () => {
      withStatus('L2', 'booked');
      seat('L1').dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
      expect(host.disallowed()!.reason).toBe('companion-unavailable');
    });
  });

  describe('accessible names', () => {
    it('includes position, type, price, status and accessibility', () => {
      const withA11y: KerusiMap = JSON.parse(JSON.stringify(VENUE));
      withA11y.sections[0].seats[0].accessibility = {
        wheelchairAccessible: true,
        transferArmrest: 'left',
      };
      host.map.set(withA11y);
      fixture.detectChanges();

      const label = seat('A1').getAttribute('aria-label')!;
      expect(label).toContain('Row A, seat 1');
      expect(label).toContain('Standard');
      expect(label).toContain('available');
      expect(label).toContain('wheelchair accessible');
      expect(label).toContain('transfer armrest left');
    });

    it('announces the price for a priced seat', () => {
      expect(seat('L1').getAttribute('aria-label')).toContain('90.00');
    });

    it('marks the seat groups as buttons', () => {
      expect(seats().every((g) => g.getAttribute('role') === 'button')).toBe(true);
    });

    it('carries a polite live region for announcements', () => {
      expect(el.querySelector('[aria-live="polite"]')).not.toBeNull();
    });
  });

  describe('keyboard navigation', () => {
    const key = (id: string, init: KeyboardEventInit) =>
      seat(id).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));

    it('gives EACH section its own tab stop, so every section is reachable', () => {
      // A single map-wide tab stop would strand the balcony: arrow keys never
      // cross a section boundary, so Tab is the only way in.
      const stops = seats()
        .filter((g) => g.getAttribute('tabindex') === '0')
        .map((g) => g.getAttribute('data-seat-id'));
      expect(stops).toEqual(['A1', 'L1']);
    });

    it('moves only the tab stop of the section being navigated', () => {
      key('A1', { key: 'ArrowRight' });
      fixture.detectChanges();
      const stops = seats()
        .filter((g) => g.getAttribute('tabindex') === '0')
        .map((g) => g.getAttribute('data-seat-id'));
      expect(stops).toEqual(['A2', 'L1']);
    });

    it('moves the tab stop with the arrow keys, skipping the aisle column', () => {
      key('A1', { key: 'ArrowRight' });
      fixture.detectChanges();
      expect(seat('A2').getAttribute('tabindex')).toBe('0');

      // A2 is column 2 and A4 is column 4 — the aisle is stepped across.
      key('A2', { key: 'ArrowRight' });
      fixture.detectChanges();
      expect(seat('A4').getAttribute('tabindex')).toBe('0');
    });

    it('stops at the end of a row', () => {
      key('A1', { key: 'End' });
      fixture.detectChanges();
      expect(seat('A4').getAttribute('tabindex')).toBe('0');

      key('A4', { key: 'ArrowRight' });
      fixture.detectChanges();
      expect(seat('A4').getAttribute('tabindex')).toBe('0');
    });

    it('jumps to the row ends with Home and End', () => {
      key('A2', { key: 'End' });
      fixture.detectChanges();
      expect(seat('A4').getAttribute('tabindex')).toBe('0');

      key('A4', { key: 'Home' });
      fixture.detectChanges();
      expect(seat('A1').getAttribute('tabindex')).toBe('0');
    });

    it('toggles with Enter and Space', () => {
      key('A1', { key: 'Enter' });
      fixture.detectChanges();
      expect(host.selection()).toEqual(['A1']);

      key('A1', { key: ' ' });
      fixture.detectChanges();
      expect(host.selection()).toEqual([]);
    });

    it('clears the selection with Escape', () => {
      host.selection.set(['A1', 'A2']);
      fixture.detectChanges();
      key('A1', { key: 'Escape' });
      fixture.detectChanges();
      expect(host.selection()).toEqual([]);
    });
  });

  describe('validation', () => {
    it('emits no issues for a conformant document', () => {
      expect(host.issues()).toEqual([]);
    });

    it('reports violations and still renders, in collect mode', () => {
      const broken: KerusiMap = JSON.parse(JSON.stringify(VENUE));
      // A seat off the canvas — invalid under §4.3.1.
      broken.sections[0].seats[0].x = 900;
      host.map.set(broken);
      fixture.detectChanges();

      expect(host.issues().map((v) => v.rule)).toContain('seat-outside-canvas');
      expect(seats().length).toBeGreaterThan(0);
    });
  });

  describe('legend', () => {
    it('is off by default and renders on request', () => {
      expect(el.querySelector('kerusi-legend')).toBeNull();
      host.showLegend.set(true);
      fixture.detectChanges();

      const labels = [...el.querySelectorAll('.kerusi-legend__label')].map((n) =>
        n.textContent?.trim(),
      );
      expect(labels).toContain('Standard');
      expect(labels).toContain('Sofa');
      expect(labels).toContain('Available');
    });

    it('takes its swatch from SeatType.color, matching the seat fill', () => {
      host.showLegend.set(true);
      fixture.detectChanges();
      const swatch = el.querySelector<HTMLElement>('.kerusi-legend__swatch')!;
      expect(box('A1').style.fill).toBe('var(--kerusi-seat-fill, #3a8f63)');
      expect(swatch.style.background).toBe('var(--kerusi-seat-fill, #3a8f63)');
    });

    it('draws every availability swatch as the seat glyph, not a flat colour', () => {
      // Shape carries status now, so a flat swatch would teach a cue the map
      // itself no longer uses — every status row draws the glyph instead.
      host.showLegend.set(true);
      fixture.detectChanges();
      const glyphFor = (label: string) =>
        [...el.querySelectorAll('.kerusi-legend__item')]
          .find((li) => li.querySelector('.kerusi-legend__label')?.textContent?.trim() === label)!
          .querySelector('.kerusi-legend__swatch--glyph')!;

      expect(glyphFor('Available').tagName.toLowerCase()).toBe('svg');

      // Body only: nothing occupies an available or a blocked seat.
      expect(glyphFor('Available').querySelectorAll('path')).toHaveLength(1);
      expect(glyphFor('Blocked').querySelectorAll('path')).toHaveLength(1);

      // Frame + core + occupant: the one status drawn from two tones.
      expect(glyphFor('Selected').querySelectorAll('path')).toHaveLength(3);

      // Body + wash + occupant.
      expect(glyphFor('On hold').querySelectorAll('path')).toHaveLength(3);
      expect(glyphFor('On hold').querySelector('.kerusi-legend__occupant--held')).not.toBeNull();
      expect(glyphFor('Booked').querySelectorAll('path')).toHaveLength(3);
      expect(glyphFor('Booked').querySelector('.kerusi-legend__occupant--booked')).not.toBeNull();
    });
  });

  describe('seat fills', () => {
    it('colors an available seat from its SeatType.color (§4.7)', () => {
      expect(box('A1').style.fill).toBe('var(--kerusi-seat-fill, #3a8f63)');
    });

    it('routes theme colors through a CSS custom property, keeping the input as fallback', () => {
      // The sofa type declares no color, so L1's fill comes from the theme.
      expect(box('L1').style.fill).toBe(
        'var(--kerusi-seat-fill, var(--kerusi-available-bg, #76d75d))',
      );
    });

    it('publishes focusRing, so the focus ring is themable', () => {
      // Under `--kerusi-focus-ring`, which a stylesheet may set to win outright.
      expect(svgs()[0].style.getPropertyValue('--kerusi-focus-ring-input')).toBe('#1b1f27');
    });
  });

  describe('per-seat styling hooks', () => {
    it('tags each seat with data attributes CSS can select by', () => {
      const a1 = seat('A1');
      expect(a1.getAttribute('data-seat-type')).toBe('standard');
      expect(a1.getAttribute('data-seat-status')).toBe('available');
      expect(a1.getAttribute('data-section-id')).toBe('stalls');
      expect(a1.getAttribute('data-seat-row')).toBe('A');
      expect(a1.hasAttribute('data-seat-attributes')).toBe(false);

      const l1 = seat('L1');
      expect(l1.getAttribute('data-seat-type')).toBe('sofa');
      expect(l1.getAttribute('data-section-id')).toBe('balcony');
      expect(l1.hasAttribute('data-seat-row')).toBe(false);
    });

    it('lists a seat’s attributes space-separated, for a ~= selector', () => {
      const [stalls, balcony] = VENUE.sections;
      const seats = stalls.seats.map((s) =>
        s.id === 'A1' ? { ...s, attributes: ['aisle', 'extra-legroom'] } : s,
      );
      host.map.set({ ...VENUE, sections: [{ ...stalls, seats }, balcony] });
      fixture.detectChanges();
      expect(seat('A1').getAttribute('data-seat-attributes')).toBe('aisle extra-legroom');
      expect(el.querySelector('[data-seat-attributes~="aisle"]')).toBe(seat('A1'));
    });

    it('routes a seat’s own colour through --kerusi-seat-fill, but never a selected one', () => {
      expect(box('A1').style.fill).toBe('var(--kerusi-seat-fill, #3a8f63)');
      host.selection.set(['A1']);
      fixture.detectChanges();
      expect(box('A1').style.fill).toBe('var(--kerusi-selected-bg, #7854af)');
    });

    it('tags each legend type with data-seat-type, so one rule recolours seats and key', () => {
      host.showLegend.set(true);
      fixture.detectChanges();
      const item = el.querySelector('.kerusi-legend__item[data-seat-type="standard"]')!;
      expect(item).not.toBeNull();
      expect(item.querySelector<HTMLElement>('.kerusi-legend__swatch')!.style.background).toBe(
        box('A1').style.fill,
      );
    });
  });

  describe('seat styles from code', () => {
    /** Pushes host state in, mirroring the React spec's `set`. */
    const set = (patch: {
      seatStyle?: SeatStyleFn;
      seatTypeStyles?: SeatTypeStyles;
      selection?: readonly string[];
      state?: KerusiState;
      showLegend?: boolean;
    }) => {
      if (patch.seatStyle) host.seatStyle.set(patch.seatStyle);
      if (patch.seatTypeStyles) host.seatTypeStyles.set(patch.seatTypeStyles);
      if (patch.selection) host.selection.set(patch.selection);
      if (patch.state) host.state.set(patch.state);
      if (patch.showLegend !== undefined) host.showLegend.set(patch.showLegend);
      fixture.detectChanges();
    };

    it('paints every seat of a type from seatTypeStyles, and its legend swatch with it', () => {
      set({
        seatTypeStyles: { sofa: { fill: '#d4a017', className: 'sofa-gold' } },
        showLegend: true,
      });
      expect(box('L1').style.fill).toBe('var(--kerusi-seat-fill, #d4a017)');
      expect(seat('L1').classList).toContain('sofa-gold');
      expect(box('A1').style.fill).toBe('var(--kerusi-seat-fill, #3a8f63)');
      const swatch = el.querySelector<HTMLElement>(
        '.kerusi-legend__item[data-seat-type="sofa"] .kerusi-legend__swatch',
      )!;
      expect(swatch.style.background).toBe('var(--kerusi-seat-fill, #d4a017)');
    });

    it('lets seatStyle pick out single seats, over their type style', () => {
      set({
        seatTypeStyles: { standard: { fill: '#d4a017' } },
        seatStyle: (s) => (s.id === 'A2' ? { fill: '#101010', className: 'picked' } : undefined),
      });
      expect(box('A1').style.fill).toBe('var(--kerusi-seat-fill, #d4a017)');
      expect(box('A2').style.fill).toBe('var(--kerusi-seat-fill, #101010)');
      expect(seat('A2').classList).toContain('picked');
      // A readable label is derived from a hex fill.
      expect(label('A2').style.fill).toBe('var(--kerusi-seat-label, #ffffff)');
    });

    it('draws a seat in the shape its style names, frame and core alike', () => {
      set({ seatStyle: () => ({ shape: 'circle' }), selection: ['A1'] });
      const arcs = (d: string) => d.split(' A ').length - 1;
      // The stock outline has four rounded corners; a circle is two half arcs.
      expect(arcs(box('A2').getAttribute('d')!)).toBe(2);
      expect(arcs(box('A1').getAttribute('d')!)).toBe(2);
      expect(arcs(core('A1').getAttribute('d')!)).toBe(2);
    });

    it('keys a shaped type with its shape in the legend', () => {
      set({ seatTypeStyles: { sofa: { shape: 'circle', fill: '#d4a017' } }, showLegend: true });
      const sofa = el.querySelector('.kerusi-legend__item[data-seat-type="sofa"]')!;
      const path = sofa.querySelector<SVGPathElement>('svg.kerusi-legend__swatch path')!;
      expect(path.style.fill).toBe('var(--kerusi-seat-fill, #d4a017)');
      // A type without a shape keeps the flat square.
      const standard = el.querySelector('.kerusi-legend__item[data-seat-type="standard"]')!;
      expect(standard.querySelector('span.kerusi-legend__swatch')).not.toBeNull();
    });

    it('never restyles a selected or blocked seat, whose colour is the status cue', () => {
      set({
        seatStyle: () => ({ fill: '#101010', labelColor: '#ff0000' }),
        selection: ['A1'],
        state: {
          kerusi: '1.0',
          mapId: 'venue',
          updatedAt: 't',
          seats: { A2: { status: 'blocked' } },
        },
      });
      expect(box('A1').style.fill).toBe('var(--kerusi-selected-bg, #7854af)');
      expect(box('A2').style.fill).toBe('var(--kerusi-blocked-bg, #5a616e)');
      expect(label('A2').style.fill).toBe('var(--kerusi-blocked-fg, #d2d7df)');
    });
  });

  describe('status marks', () => {
    // Colour means seat type; shape means status (see the doc comment on
    // seatFill). A held or booked seat used to lose its type colour to a
    // status hue, exactly where a busy map needed the type colour most, so
    // these assert the opposite: the colour stays, and status is read from a
    // wash plus an occupant figure instead.

    it('keeps its type color when held, marking the hold with a wash and a hollow occupant', () => {
      host.state.set({
        kerusi: '1.0',
        mapId: 'venue',
        updatedAt: 't',
        seats: { A1: { status: 'held' } },
      });
      fixture.detectChanges();
      expect(box('A1').style.fill).toBe('var(--kerusi-seat-fill, #3a8f63)');
      expect(seat('A1').querySelector('.kerusi-seat__wash')).not.toBeNull();
      const occupant = seat('A1').querySelector<SVGPathElement>('.kerusi-seat__occupant--held')!;
      expect(occupant).not.toBeNull();
      expect(occupant.style.fill).toBe('none');
      expect(occupant.style.stroke).not.toBe('none');
    });

    it('keeps its type color when booked, marking the sale with a wash and a solid occupant', () => {
      host.state.set({
        kerusi: '1.0',
        mapId: 'venue',
        updatedAt: 't',
        seats: { A1: { status: 'booked' } },
      });
      fixture.detectChanges();
      expect(box('A1').style.fill).toBe('var(--kerusi-seat-fill, #3a8f63)');
      expect(seat('A1').querySelector('.kerusi-seat__wash')).not.toBeNull();
      const occupant = seat('A1').querySelector<SVGPathElement>('.kerusi-seat__occupant--booked')!;
      expect(occupant).not.toBeNull();
      expect(occupant.style.stroke).toBe('none');
      expect(occupant.style.fill).not.toBe('none');
    });

    it('draws no wash and no occupant for a blocked seat, since nobody is there', () => {
      host.state.set({
        kerusi: '1.0',
        mapId: 'venue',
        updatedAt: 't',
        seats: { A1: { status: 'blocked' } },
      });
      fixture.detectChanges();
      expect(seat('A1').querySelector('.kerusi-seat__wash')).toBeNull();
      expect(seat('A1').querySelector('.kerusi-seat__occupant')).toBeNull();
    });

    it('lets selection win the seat colour outright, the one deliberate exception', () => {
      host.selection.set(['A1']);
      fixture.detectChanges();
      expect(box('A1').style.fill).toBe('var(--kerusi-selected-bg, #7854af)');
      expect(core('A1').style.fill).toBe('var(--kerusi-selected-fg, #f3ecff)');
    });
  });

  describe('the seat glyph', () => {
    it('gives every seat a tapered body, so facing is visible on the shape', () => {
      const boxes = seats().map((g) => g.querySelector<SVGPathElement>('.kerusi-seat__box')!);
      expect(boxes).toHaveLength(seats().length);
      for (const b of boxes) {
        expect(b.tagName.toLowerCase()).toBe('path');
        // Four rounded corners: an L onto each incoming edge, an A arc onto each outgoing one.
        expect(b.getAttribute('d')?.match(/A /g)).toHaveLength(4);
      }
    });

    it('marks a selected seat by shape as well as color', () => {
      expect(seat('A1').querySelector('.kerusi-seat__occupant')).toBeNull();
      expect(seat('A1').querySelector('.kerusi-seat__core')).toBeNull();

      host.selection.set(['A1']);
      fixture.detectChanges();

      expect(seat('A1').querySelector('.kerusi-seat__occupant--selected')).not.toBeNull();
      expect(seat('A1').querySelector('.kerusi-seat__core')).not.toBeNull();
      expect(seat('A2').querySelector('.kerusi-seat__occupant')).toBeNull();
    });

    it('draws a selected seat from two tones, so one always separates from the page', () => {
      host.selection.set(['A1']);
      fixture.detectChanges();

      // The whole point of the treatment: a selected seat carries a light tone
      // and a dark one at once, so it never depends on which way the consumer
      // themed the page around it.
      const frame = box('A1').style.fill;
      const plate = core('A1').style.fill;
      expect(frame).toContain('--kerusi-selected-bg');
      expect(plate).toContain('--kerusi-selected-fg');
      expect(frame).not.toBe(plate);

      // Everything over the core takes the frame's colour, not the core's.
      const label = seat('A1').querySelector<SVGTextElement>('.kerusi-seat__label')!;
      expect(label.style.fill).toBe('var(--kerusi-selected-bg, #7854af)');
      expect(label.style.stroke).toBe('var(--kerusi-selected-fg, #f3ecff)');
    });

    it('draws no focus outline of its own, since the stock ring strokes the body', () => {
      expect(el.querySelector('.kerusi-seat__focus')).toBeNull();
    });

    it('leaves an unselected seat’s label unhaloed', () => {
      const label = seat('A1').querySelector<SVGTextElement>('.kerusi-seat__label')!;
      expect(label.style.stroke).toBe('none');
      expect(label.getAttribute('stroke-width')).toBe('0');
    });

    it('leans the occupant with the seat while the number stays upright', () => {
      host.selection.set(['A1']);
      fixture.detectChanges();
      const g = seat('A1');
      // The label cancels the group's rotation; the occupant inherits it.
      expect(g.querySelector('.kerusi-seat__occupant')!.getAttribute('transform')).toBeNull();
      expect(g.querySelector('.kerusi-seat__label')).not.toBeNull();
    });

    it('keeps the selected core strictly inside the frame', () => {
      host.selection.set(['A1']);
      fixture.detectChanges();
      const bodyPoints = pathPoints(box('A1').getAttribute('d')!);
      const corePoints = pathPoints(core('A1').getAttribute('d')!);
      expect(Math.min(...corePoints)).toBeGreaterThan(Math.min(...bodyPoints));
      expect(Math.max(...corePoints)).toBeLessThan(Math.max(...bodyPoints));
    });

    it('keeps a selected seat’s occupant on the core, not across the frame', () => {
      host.selection.set(['A1']);
      fixture.detectChanges();
      const corePoints = pathPoints(core('A1').getAttribute('d')!);
      const occupant = seat('A1').querySelector<SVGPathElement>('.kerusi-seat__occupant')!;
      const occupantPoints = pathPoints(occupant.getAttribute('d')!);
      // A figure tinted `selectedBg` that crossed onto a frame filled
      // `selectedBg` would read as a hard nub at the hips.
      expect(Math.min(...occupantPoints)).toBeGreaterThan(Math.min(...corePoints));
      expect(Math.max(...occupantPoints)).toBeLessThan(Math.max(...corePoints));
    });

    it('leaves a booked occupant on the seat’s own box, not inset like a selected one', () => {
      // Only a selected seat has a core to move its marks into. Collapsing that
      // conditional into an unconditional inset would silently shrink every
      // other status' figure.
      host.state.set({
        kerusi: '1.0',
        mapId: 'venue',
        updatedAt: 't',
        seats: { A1: { status: 'booked' } },
      });
      fixture.detectChanges();
      const booked = pathPoints(
        seat('A1').querySelector<SVGPathElement>('.kerusi-seat__occupant')!.getAttribute('d')!,
      );

      host.state.set({ kerusi: '1.0', mapId: 'venue', updatedAt: 't', seats: {} });
      host.selection.set(['A1']);
      fixture.detectChanges();
      const picked = pathPoints(
        seat('A1').querySelector<SVGPathElement>('.kerusi-seat__occupant')!.getAttribute('d')!,
      );

      const spread = (points: number[]) => Math.max(...points) - Math.min(...points);
      expect(spread(picked)).toBeLessThan(spread(booked));
    });
  });
});

/** Draws a status mark and a corner dot, over the stock seat or instead of it. */
@Component({
  imports: [KerusiSeatmapComponent, KerusiSeatTemplateDirective, NgTemplateOutlet],
  template: `
    <kerusi-seatmap [map]="map" [(selection)]="selection">
      <ng-template kerusiSeat let-seat>
        @if (keepStock()) {
          <ng-container *ngTemplateOutlet="seat.defaultContent; context: { $implicit: seat }" />
        }
        <svg:text class="custom-mark">
          {{ seat.seat.id }}:{{ seat.selected ? 'on' : 'off' }}
        </svg:text>
        <svg:circle
          class="custom-dot"
          [attr.cx]="seat.glyph.box.x"
          [attr.cy]="seat.glyph.box.y"
          r="2"
        />
      </ng-template>
    </kerusi-seatmap>
  `,
})
class CustomSeatHost {
  readonly map = VENUE;
  readonly selection = signal<readonly string[]>([]);
  readonly keepStock = signal(false);
}

describe('KerusiSeatmapComponent custom seat content', () => {
  let fixture: ComponentFixture<CustomSeatHost>;
  let host: CustomSeatHost;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CustomSeatHost] }).compileComponents();
    fixture = TestBed.createComponent(CustomSeatHost);
    host = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  const seat = (id: string) => el.querySelector<SVGGElement>(`[data-seat-id="${id}"]`)!;
  const mark = (id: string) => seat(id).querySelector<SVGTextElement>('.custom-mark')!;
  const key = (id: string, init: KeyboardEventInit) => {
    seat(id).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
    fixture.detectChanges();
  };

  it('draws the custom content inside the library’s own seat group', () => {
    const g = seat('A1');
    expect(g.getAttribute('role')).toBe('button');
    expect(g.getAttribute('aria-pressed')).toBe('false');
    expect(g.getAttribute('tabindex')).toBe('0');
    expect(g.getAttribute('aria-label')).toContain('Standard');
    expect(g.classList).toContain('kerusi-seat');
    expect(mark('A1').textContent?.trim()).toBe('A1:off');
  });

  it('creates the custom marks in the SVG namespace', () => {
    // Without the svg: prefix Angular would create an HTML element here,
    // which an SVG renderer silently ignores.
    expect(mark('A1').namespaceURI).toBe('http://www.w3.org/2000/svg');
  });

  it('hands the template the selection and the resolved glyph', () => {
    seat('A1').dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();
    expect(mark('A1').textContent?.trim()).toBe('A1:on');
    expect(mark('A2').textContent?.trim()).toBe('A2:off');

    // The glyph carries the placed box, so A2 sits to the right of A1.
    const cx = (id: string) => Number(seat(id).querySelector('.custom-dot')!.getAttribute('cx'));
    expect(cx('A2')).toBeGreaterThan(cx('A1'));
  });

  it('replaces the stock glyph unless the template renders defaultContent', () => {
    expect(seat('A1').querySelector('.kerusi-seat__box')).toBeNull();

    host.keepStock.set(true);
    fixture.detectChanges();
    const body = seat('A1').querySelector('.kerusi-seat__box')!;
    expect(body).not.toBeNull();
    expect(mark('A1')).not.toBeNull();
    expect(body.getAttribute('d')).toBe(
      seat('A1').querySelector('.kerusi-seat__focus')!.getAttribute('d'),
    );
  });

  it('still selects through the custom content, by pointer and by keyboard', () => {
    mark('A1').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(host.selection()).toEqual(['A1']);

    key('A1', { key: 'ArrowRight' });
    key('A2', { key: 'Enter' });
    expect(host.selection()).toEqual(['A1', 'A2']);
  });

  it('draws a focus outline of the body over the custom content', () => {
    const outline = seat('A1').lastElementChild!;
    expect(outline.classList).toContain('kerusi-seat__focus');
    expect(outline.getAttribute('d')).toMatch(/^M /);
  });
});

describe('KerusiSeatmapComponent SVG parity with the React binding', () => {
  it('draws the town hall exactly as the shared signature says', () => {
    const el = renderAlone({
      map: PARITY_MAP,
      state: PARITY_STATE,
      selection: PARITY_SELECTION,
    });
    expect(svgSignature(el.querySelector('svg.kerusi-seatmap__svg')!)).toBe(PARITY_SIGNATURE);
  });

  it('draws the seat forms exactly as the shared signature says', () => {
    const el = renderAlone({
      map: PARITY_FORMS_MAP,
      state: PARITY_FORMS_STATE,
      selection: PARITY_FORMS_SELECTION,
    });
    expect(svgSignature(el.querySelector('svg.kerusi-seatmap__svg')!)).toBe(PARITY_FORMS_SIGNATURE);
  });
});
