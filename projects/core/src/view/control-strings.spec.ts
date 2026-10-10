import { describe, expect, it } from 'vitest';
import {
  controlStyle,
  DEFAULT_KERUSI_CONTROL_STRINGS,
  resolveControlStrings,
} from './control-strings.js';
import { DEFAULT_KERUSI_COLORS } from './kerusi-seatmap-colors.js';

describe('resolveControlStrings', () => {
  it('fills the gaps with the English defaults', () => {
    expect(resolveControlStrings()).toEqual(DEFAULT_KERUSI_CONTROL_STRINGS);
    const merged = resolveControlStrings({ zoomIn: 'Zum masuk' });
    expect(merged.zoomIn).toBe('Zum masuk');
    expect(merged.zoomOut).toBe(DEFAULT_KERUSI_CONTROL_STRINGS.zoomOut);
  });

  it('names every control', () => {
    for (const text of Object.values(DEFAULT_KERUSI_CONTROL_STRINGS)) {
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('controlStyle', () => {
  it('goes through the --kerusi-* custom properties, with the palette as fallback', () => {
    const style = controlStyle({ elementBg: '#112233' });
    expect(style.buttonBackground).toBe('var(--kerusi-element-bg, #112233)');
    expect(style.buttonColor).toBe(`var(--kerusi-element-fg, ${DEFAULT_KERUSI_COLORS.elementFg})`);
    expect(style.buttonBorder).toBe(
      `var(--kerusi-element-muted-fg, ${DEFAULT_KERUSI_COLORS.elementMutedFg})`,
    );
  });

  it('falls back to the page canvas behind a maximized map when the backdrop is transparent', () => {
    expect(controlStyle().maximizedBackground).toBe('var(--kerusi-backdrop, Canvas)');
    expect(controlStyle({ backdrop: '#101820' }).maximizedBackground).toBe(
      'var(--kerusi-backdrop, #101820)',
    );
  });
});
