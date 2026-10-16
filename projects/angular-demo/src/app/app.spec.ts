import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './app';
import { SCENARIOS } from '@kerusi/demo-scenarios';

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
    fixture = TestBed.createComponent(App);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('names the library', () => {
    expect(el.querySelector('h1')?.textContent).toContain('@kerusiweb/angular');
  });

  it('offers a tab per scenario', () => {
    expect(el.querySelectorAll('.scenario-tab')).toHaveLength(SCENARIOS.length);
  });

  it('renders the first scenario, and reports it conformant', () => {
    expect(el.querySelector('kerusi-seatmap')).not.toBeNull();
    expect(el.querySelector('.ok')?.textContent).toContain('validates clean');
  });

  it('renders every scenario without a validation issue', () => {
    const tabs = [...el.querySelectorAll<HTMLButtonElement>('.scenario-tab')];
    for (const tab of tabs) {
      tab.click();
      fixture.detectChanges();
      expect(el.querySelectorAll('.issue')).toHaveLength(0);
      expect(el.querySelectorAll('g.kerusi-seat').length).toBeGreaterThan(0);
    }
  });

  it('swaps in the custom seat template when its toggle is on, and back off again', () => {
    const toggle = [...el.querySelectorAll<HTMLLabelElement>('label.toggle')]
      .find((label) => label.textContent?.includes('Custom seat template'))!
      .querySelector('input')!;
    const firstSeat = () => el.querySelector('g.kerusi-seat')!;
    expect(firstSeat().querySelector('.kerusi-seat__box')).not.toBeNull();

    toggle.click();
    fixture.detectChanges();
    expect(firstSeat().querySelector('.kerusi-seat__box')).toBeNull();
    expect(firstSeat().querySelector('circle')?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(firstSeat().querySelector('.kerusi-seat__focus')).not.toBeNull();

    toggle.click();
    fixture.detectChanges();
    expect(firstSeat().querySelector('.kerusi-seat__box')).not.toBeNull();
    expect(firstSeat().querySelector('.kerusi-seat__focus')).toBeNull();
  });

  it('renders one svg per section of the selected scenario', () => {
    const sectionCount = SCENARIOS[0].map.sections.length;
    expect(el.querySelectorAll('kerusi-section svg')).toHaveLength(sectionCount);
  });
});
