import { describe, expect, it } from 'vitest';
import { elementStyle } from './element-shapes.js';

describe('elementStyle', () => {
  it('draws a label as text only, in the neutral tone', () => {
    expect(elementStyle('label')).toEqual({ shape: 'text', tone: 'neutral', showLabel: true });
  });

  it('looks kinds up case-insensitively', () => {
    expect(elementStyle('Label')).toEqual(elementStyle('label'));
    expect(elementStyle('LABEL')).toEqual(elementStyle('label'));
  });

  it('draws an unknown kind as a labelled rectangle', () => {
    expect(elementStyle('banner')).toEqual({ shape: 'rect', tone: 'neutral', showLabel: true });
  });

  it('leaves the other kinds as they were', () => {
    expect(elementStyle('stage').shape).toBe('stage');
    expect(elementStyle('screen').shape).toBe('screen');
    expect(elementStyle('exit')).toEqual({ shape: 'rect', tone: 'accent', showLabel: true });
    expect(elementStyle('gap').shape).toBe('void');
  });
});
