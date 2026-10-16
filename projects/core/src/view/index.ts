/**
 * Presentation policy that is still framework-free: the colour system a
 * renderer resolves seat fills from, the ARIA strings it announces, the
 * selection rules that decide whether a seat may be toggled, and the zoom, pan
 * and gesture arithmetic behind a zoomable map.
 *
 * A binding turns these into markup; none of them know how.
 */

export * from './control-strings.js';
export * from './kerusi-seat-style.js';
export * from './kerusi-seatmap-colors.js';
export * from './rtl.js';
export * from './seat-glyph.js';
export * from './seat-aria.js';
export * from './selection.js';
export * from './viewport.js';
export * from './viewport-gesture.js';
