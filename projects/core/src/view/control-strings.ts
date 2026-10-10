import { cssVar, KerusiSeatmapColors, resolveColors } from './kerusi-seatmap-colors.js';

/**
 * The words on the zoom and maximize controls, for a translator to replace.
 *
 * Kept apart from `SeatAriaStrings` on purpose: that type is an object callers
 * build in full, so a new required field there would break every one of them.
 */
export interface KerusiControlStrings {
  /** The accessible name of the zoomable map's focusable viewport. */
  viewport: string;
  /** The accessible name of the group of zoom and maximize buttons. */
  toolbar: string;
  zoomIn: string;
  zoomOut: string;
  /** Back to fit-to-container. */
  zoomReset: string;
  /** The maximize button when the map is not maximized. */
  maximize: string;
  /** The maximize button when the map is maximized. */
  restore: string;
}

export const DEFAULT_KERUSI_CONTROL_STRINGS: KerusiControlStrings = {
  viewport: 'Zoomable seat map. Plus and minus zoom, zero resets, arrow keys pan.',
  toolbar: 'Map controls',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomReset: 'Reset zoom',
  maximize: 'Enter full screen',
  restore: 'Exit full screen',
};

/** Fills the gaps in a partial set of strings with the English defaults. */
export function resolveControlStrings(
  strings?: Partial<KerusiControlStrings>,
): KerusiControlStrings {
  return { ...DEFAULT_KERUSI_CONTROL_STRINGS, ...strings };
}

/**
 * Colours for the controls and the maximized backdrop, as CSS values.
 *
 * Nothing new for a theme to learn: the buttons borrow the fixture tokens
 * (`elementBg`, `elementFg`, `elementMutedFg`) and go through {@link cssVar}
 * like every other colour, so a `--kerusi-*` property in the consumer's
 * stylesheet still beats the `[colors]` input, which still beats the default.
 * The focus ring is the one exception, and is not here: a pseudo-class cannot
 * be set inline, so it reads `--kerusi-focus-ring-input` from the stylesheet,
 * the same way a seat's does.
 */
export interface KerusiControlStyle {
  buttonBackground: string;
  buttonColor: string;
  buttonBorder: string;
  /** Behind a maximized map. `backdrop`, or the page's own canvas if that is transparent. */
  maximizedBackground: string;
  maximizedColor: string;
}

export function controlStyle(colors?: KerusiSeatmapColors): KerusiControlStyle {
  const resolved = resolveColors(colors);
  return {
    buttonBackground: cssVar('elementBg', resolved.elementBg),
    buttonColor: cssVar('elementFg', resolved.elementFg),
    buttonBorder: cssVar('elementMutedFg', resolved.elementMutedFg),
    // A maximized map covers the page, so a transparent backdrop would show it
    // through. `Canvas` / `CanvasText` are the page's own background and text
    // colours, which keeps the pair legible in whichever scheme the host uses.
    maximizedBackground: cssVar(
      'backdrop',
      resolved.backdrop === 'transparent' ? 'Canvas' : resolved.backdrop,
    ),
    maximizedColor: 'CanvasText',
  };
}
