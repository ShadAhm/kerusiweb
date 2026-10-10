import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export interface UseMaximizedOptions {
  /** The map's `maximizable` prop. Maximizing is refused, and undone, without it. */
  enabled: boolean;
  /** The map's root element: what goes full screen. */
  rootRef: RefObject<HTMLElement | null>;
  onChange?: (maximized: boolean) => void;
}

export interface Maximized {
  maximized: boolean;
  setMaximized(next: boolean): void;
  toggleMaximized(): void;
}

/**
 * Maximizing the map to fill the screen.
 *
 * The fixed-position layout is the whole feature on iPhone, which has no
 * element full screen. Where the browser offers one it is requested on top,
 * and followed: leaving it with the browser's own Esc un-maximizes the map, so
 * the two never disagree.
 */
export function useMaximized({ enabled, rootRef, onChange }: UseMaximizedOptions): Maximized {
  const [maximized, setMaximizedState] = useState(false);
  const maximizedRef = useRef(false);
  const nativeFullscreen = useRef(false);
  const settings = useRef({ enabled, onChange });
  settings.current = { enabled, onChange };

  const setMaximized = useCallback(
    (next: boolean) => {
      if (next === maximizedRef.current || (next && !settings.current.enabled)) {
        return;
      }
      maximizedRef.current = next;
      setMaximizedState(next);
      settings.current.onChange?.(next);

      // Native full screen is requested here, inside the click that got us
      // here, because browsers only grant it to a user gesture.
      const root = rootRef.current;
      const doc = root?.ownerDocument;
      if (root && doc) {
        if (next && !doc.fullscreenElement) {
          root.requestFullscreen?.()?.catch(() => undefined);
        } else if (!next && doc.fullscreenElement === root) {
          doc.exitFullscreen?.()?.catch(() => undefined);
        }
      }
    },
    [rootRef],
  );

  const toggleMaximized = useCallback(() => setMaximized(!maximizedRef.current), [setMaximized]);

  // `maximizable` switched off underneath a maximized map.
  useEffect(() => {
    if (!enabled && maximizedRef.current) {
      setMaximized(false);
    }
  }, [enabled, setMaximized]);

  // While maximized: freeze the page behind, and follow the browser leaving
  // native full screen.
  useEffect(() => {
    const root = rootRef.current;
    if (!maximized || !root) {
      return;
    }
    const doc = root.ownerDocument;
    const previousOverflow = doc.body.style.overflow;
    doc.body.style.overflow = 'hidden';

    const onFullscreenChange = () => {
      if (doc.fullscreenElement === root) {
        nativeFullscreen.current = true;
      } else if (nativeFullscreen.current) {
        nativeFullscreen.current = false;
        setMaximized(false);
      }
    };
    doc.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      doc.body.style.overflow = previousOverflow;
      doc.removeEventListener('fullscreenchange', onFullscreenChange);
      nativeFullscreen.current = false;
      if (doc.fullscreenElement === root) {
        doc.exitFullscreen?.()?.catch(() => undefined);
      }
    };
  }, [maximized, rootRef, setMaximized]);

  return { maximized, setMaximized, toggleMaximized };
}
