import { describe, expect, it } from 'vitest';
import {
  IDLE_SEAT_HOVER,
  reduceSeatHover,
  type SeatHoverEvent,
  type SeatHoverResult,
  type SeatHoverState,
} from './seat-hover.js';
import { wholeUnitHoverKey } from './seat-card.js';

const DELAY = { open: 150, close: 100 };

/** Feeds events in order and collects what each asked the binding to do. */
function run(events: SeatHoverEvent[], delay = DELAY, from: SeatHoverState = IDLE_SEAT_HOVER) {
  let state = from;
  const reports: (string | null)[] = [];
  const timers: (SeatHoverResult['timer'] | undefined)[] = [];
  for (const event of events) {
    const result = reduceSeatHover(state, event, delay);
    state = result.state;
    if (result.report) {
      reports.push(result.report.seatId);
    }
    timers.push(result.timer);
  }
  return { state, reports, timers };
}

const enter = (seatId: string, pointerType = 'mouse'): SeatHoverEvent => ({
  type: 'enter',
  seatId,
  pointerType,
});
const leave = (seatId: string, pointerType = 'mouse'): SeatHoverEvent => ({
  type: 'leave',
  seatId,
  pointerType,
});
const move = (seatId: string, pointerType = 'mouse'): SeatHoverEvent => ({
  type: 'move',
  seatId,
  pointerType,
});

describe('reduceSeatHover: reporting', () => {
  it('reports the seat on enter and null on leave', () => {
    expect(run([enter('A1'), leave('A1')]).reports).toEqual(['A1', null]);
  });

  it('reports a pen as well as a mouse', () => {
    expect(run([enter('A1', 'pen'), leave('A1', 'pen')]).reports).toEqual(['A1', null]);
  });

  it('ignores touch entirely', () => {
    const { reports, state } = run([
      enter('A1', 'touch'),
      move('A1', 'touch'),
      leave('A1', 'touch'),
    ]);
    expect(reports).toEqual([]);
    expect(state).toBe(IDLE_SEAT_HOVER);
  });

  it('does not report again while the pointer moves within the same seat', () => {
    expect(run([enter('A1'), move('A1'), move('A1'), move('A1')]).reports).toEqual(['A1']);
  });

  it('reports a move between seats as leave then enter', () => {
    expect(run([enter('A1'), leave('A1'), enter('A2')]).reports).toEqual(['A1', null, 'A2']);
  });

  it('ignores a leave from a seat that is not the hovered one', () => {
    expect(run([enter('A1'), leave('A2')]).reports).toEqual(['A1']);
  });
});

describe('reduceSeatHover: pan and zoom', () => {
  it('clears the hover once when a gesture starts', () => {
    const { reports, state } = run([enter('A1'), { type: 'gesture' }, { type: 'gesture' }]);
    expect(reports).toEqual(['A1', null]);
    expect(state.suppressed).toBe(true);
  });

  it('reports nothing when a gesture starts over no seat', () => {
    expect(run([{ type: 'gesture' }]).reports).toEqual([]);
  });

  it('stays quiet until the next pointer move after the gesture', () => {
    const { reports } = run([enter('A1'), { type: 'gesture' }, leave('A1')]);
    expect(reports).toEqual(['A1', null]);
  });

  it('resumes on the first move over a seat', () => {
    const { reports, state } = run([enter('A1'), { type: 'gesture' }, move('A2')]);
    expect(reports).toEqual(['A1', null, 'A2']);
    expect(state.suppressed).toBe(false);
    expect(state.hoveredId).toBe('A2');
  });

  it('resumes over the very seat it was cleared from', () => {
    const { reports } = run([enter('A1'), { type: 'gesture' }, move('A1')]);
    expect(reports).toEqual(['A1', null, 'A1']);
  });
});

describe('reduceSeatHover: hover card', () => {
  it('starts the open timer on enter and opens when it fires', () => {
    const entered = run([enter('A1')]);
    expect(entered.timers).toEqual([{ action: 'start', kind: 'open', ms: 150 }]);
    expect(entered.state.cardId).toBeNull();

    const opened = run([{ type: 'timer', kind: 'open' }], DELAY, entered.state);
    expect(opened.state).toMatchObject({ cardId: 'A1', cardTrigger: 'hover', pendingId: null });
  });

  it('opens at once with no open delay', () => {
    const { state, timers } = run([enter('A1')], { open: 0, close: 100 });
    expect(state.cardId).toBe('A1');
    expect(timers).toEqual([{ action: 'clear' }]);
  });

  it('never opens if the pointer leaves first', () => {
    const left = run([enter('A1'), leave('A1')]);
    expect(left.state.pendingId).toBeNull();
    const late = run([{ type: 'timer', kind: 'open' }], DELAY, left.state);
    expect(late.state.cardId).toBeNull();
  });

  const open = (): SeatHoverState => run([enter('A1'), { type: 'timer', kind: 'open' }]).state;

  it('closes after the close delay once the pointer leaves', () => {
    const left = run([leave('A1')], DELAY, open());
    expect(left.timers).toEqual([{ action: 'start', kind: 'close', ms: 100 }]);
    expect(left.state.cardId).toBe('A1');
    expect(run([{ type: 'timer', kind: 'close' }], DELAY, left.state).state.cardId).toBeNull();
  });

  it('closes at once with no close delay', () => {
    expect(run([leave('A1')], { open: 150, close: 0 }, open()).state.cardId).toBeNull();
  });

  it('lets the pointer travel into the card (hoverable)', () => {
    const left = run([leave('A1'), { type: 'card-enter' }], DELAY, open());
    expect(left.state).toMatchObject({ overCard: true, closing: false, cardId: 'A1' });
    expect(left.timers[1]).toEqual({ action: 'clear' });
    // A close timer that was already running does nothing once the card is held.
    expect(run([{ type: 'timer', kind: 'close' }], DELAY, left.state).state.cardId).toBe('A1');
  });

  it('closes after the pointer leaves the card', () => {
    const inCard = run([leave('A1'), { type: 'card-enter' }], DELAY, open()).state;
    const out = run([{ type: 'card-leave' }], DELAY, inCard);
    expect(out.timers).toEqual([{ action: 'start', kind: 'close', ms: 100 }]);
    expect(run([{ type: 'timer', kind: 'close' }], DELAY, out.state).state.cardId).toBeNull();
  });

  it('stays open when the pointer goes from the card back onto the seat', () => {
    const inCard = run([leave('A1'), { type: 'card-enter' }], DELAY, open()).state;
    const back = run([enter('A1'), { type: 'card-leave' }], DELAY, inCard);
    expect(back.state.closing).toBe(false);
    expect(back.state.cardId).toBe('A1');
  });

  it('keeps the card when the pointer comes back during the close delay', () => {
    const back = run([leave('A1'), enter('A1')], DELAY, open());
    expect(back.state).toMatchObject({ cardId: 'A1', closing: false });
    expect(back.timers[1]).toEqual({ action: 'clear' });
  });

  it('moves the card straight to the next seat, with no open delay', () => {
    const next = run([leave('A1'), enter('A2')], DELAY, open());
    expect(next.state).toMatchObject({ cardId: 'A2', cardTrigger: 'hover', closing: false });
  });

  it('closes the card when a gesture starts', () => {
    const gone = run([{ type: 'gesture' }], DELAY, open());
    expect(gone.state.cardId).toBeNull();
    expect(gone.timers).toEqual([{ action: 'clear' }]);
  });

  it('is dismissed by Escape and stays dismissed until the pointer leaves the seat', () => {
    const dismissed = run([{ type: 'escape' }], DELAY, open());
    expect(dismissed.state).toMatchObject({ cardId: null, dismissedId: 'A1' });
    // Moving within the seat does not bring it back.
    expect(run([move('A1')], DELAY, dismissed.state).state.cardId).toBeNull();
    // Leaving and coming back does.
    const again = run([leave('A1'), enter('A1')], DELAY, dismissed.state);
    expect(again.state.dismissedId).toBeNull();
    expect(again.timers[1]).toEqual({ action: 'start', kind: 'open', ms: 150 });
  });

  it('does nothing on Escape with no card showing', () => {
    expect(run([{ type: 'escape' }]).state).toBe(IDLE_SEAT_HOVER);
  });

  it('cancels a card that has not opened yet on Escape', () => {
    const { state } = run([enter('A1'), { type: 'escape' }]);
    expect(state).toMatchObject({ pendingId: null, dismissedId: 'A1' });
  });

  it('resets everything, reporting a hover that was in progress', () => {
    const reset = run([{ type: 'reset' }], DELAY, open());
    expect(reset.state).toBe(IDLE_SEAT_HOVER);
    expect(reset.reports).toEqual([null]);
  });
});

describe('reduceSeatHover: keyboard focus', () => {
  it('shows the card at once on focus, with no delay', () => {
    const { state, timers } = run([{ type: 'focus', seatId: 'A1' }]);
    expect(state).toMatchObject({ cardId: 'A1', cardTrigger: 'focus' });
    expect(timers).toEqual([{ action: 'clear' }]);
  });

  it('closes it when focus leaves', () => {
    const { state } = run([
      { type: 'focus', seatId: 'A1' },
      { type: 'blur', seatId: 'A1' },
    ]);
    expect(state.cardId).toBeNull();
  });

  it('follows focus from seat to seat', () => {
    const { state } = run([
      { type: 'focus', seatId: 'A1' },
      { type: 'blur', seatId: 'A1' },
      { type: 'focus', seatId: 'A2' },
    ]);
    expect(state.cardId).toBe('A2');
  });

  it('does not reopen for a focused seat after Escape, until focus moves away', () => {
    const dismissed = run([{ type: 'focus', seatId: 'A1' }, { type: 'escape' }]).state;
    expect(run([{ type: 'focus', seatId: 'A1' }], DELAY, dismissed).state.cardId).toBeNull();
    const cycled = run(
      [
        { type: 'blur', seatId: 'A1' },
        { type: 'focus', seatId: 'A1' },
      ],
      DELAY,
      dismissed,
    );
    expect(cycled.state.cardId).toBe('A1');
  });

  it('keeps a pointer-opened card open under focus, and hands it to the pointer on blur', () => {
    const opened = run([enter('A1'), { type: 'timer', kind: 'open' }]).state;
    const focused = run([{ type: 'focus', seatId: 'A1' }], DELAY, opened).state;
    expect(focused.cardTrigger).toBe('hover');
    const blurred = run([{ type: 'blur', seatId: 'A1' }], DELAY, focused).state;
    expect(blurred.cardId).toBe('A1');
  });

  it('leaves a focus-opened card alone when the pointer passes over the seat', () => {
    const focused = run([{ type: 'focus', seatId: 'A1' }]).state;
    const passed = run([enter('A1'), leave('A1')], DELAY, focused).state;
    expect(passed.cardId).toBe('A1');
    expect(passed.cardTrigger).toBe('focus');
  });

  it('hands a focus card to the pointer when the pointer is on the seat at blur', () => {
    const state = run([
      { type: 'focus', seatId: 'A1' },
      enter('A1'),
      { type: 'blur', seatId: 'A1' },
    ]).state;
    expect(state).toMatchObject({ cardId: 'A1', cardTrigger: 'hover' });
  });
});

describe('reduceSeatHover: whole units (D25)', () => {
  const T3 = wholeUnitHoverKey('T3');

  it('opens a card on a whole unit’s control as on a seat', () => {
    const { state, timers } = run([enter(T3), { type: 'timer', kind: 'open' }]);
    expect(timers[0]).toEqual({ action: 'start', kind: 'open', ms: 150 });
    expect(state).toMatchObject({ cardId: T3, cardTrigger: 'hover' });
  });

  it('reports a control as no seat: nothing on its own, null when coming from a seat', () => {
    expect(run([enter(T3), leave(T3)]).reports).toEqual([]);
    expect(run([enter('T3-1'), leave('T3-1'), enter(T3), leave(T3)]).reports).toEqual([
      'T3-1',
      null,
    ]);
    // A pointer that lands on a seat from the tabletop reports the seat.
    expect(run([enter(T3), leave(T3), enter('T3-1')]).reports).toEqual(['T3-1']);
  });

  it('moves the one card between a seat and the control without the open delay', () => {
    const { state } = run([
      enter('T3-1'),
      { type: 'timer', kind: 'open' },
      leave('T3-1'),
      enter(T3),
    ]);
    expect(state).toMatchObject({ cardId: T3, closing: false });
  });

  it('follows focus, is dismissed by Escape, and reports nothing on a gesture or reset', () => {
    const focused = run([{ type: 'focus', seatId: T3 }]).state;
    expect(focused).toMatchObject({ cardId: T3, cardTrigger: 'focus' });
    expect(run([{ type: 'escape' }], DELAY, focused).state).toMatchObject({
      cardId: null,
      dismissedId: T3,
    });
    expect(run([enter(T3), { type: 'gesture' }]).reports).toEqual([]);
    expect(run([enter(T3), { type: 'reset' }]).reports).toEqual([]);
  });
});
