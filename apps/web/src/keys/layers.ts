/**
 * The app's one overlay stack: Escape (the "B button"), Tab trapping, and
 * focus give/restore for every sheet, dialog and popover. One document-level
 * capture keydown runs while any layer is open — the same capture idiom the
 * help sheet pioneered — and Escape pops only the topmost layer, so stacked
 * surfaces (the glossary popup over the help sheet) close one at a time.
 *
 * Components opt in with useDismissLayer and delete their ad-hoc Escape
 * handler in the same commit — a surface must never have both, or one
 * keystroke closes two things.
 */

import { useEffect, useRef, type RefObject } from 'react';
import { collectFocusables } from './focusables.js';

export interface LayerOptions {
  /** Wrap Tab inside the container — modal sheets only; popovers stay native. */
  readonly trap?: boolean;
  /** Give focus back to whatever opened the layer (default true). */
  readonly restoreFocus?: boolean;
  /** Element to focus on open; default = first focusable in the container. */
  readonly initialFocus?: () => HTMLElement | null;
  /** For always-mounted components that open and close: layer exists only while true (default true). */
  readonly enabled?: boolean;
}

export interface LayerInit {
  readonly container: () => HTMLElement | null;
  readonly onClose: () => void;
  readonly trap: boolean;
  readonly restoreFocus: boolean;
  readonly initialFocus?: (() => HTMLElement | null) | undefined;
}

/**
 * The init object is held by reference, never spread: callers pass live
 * getters so that a sheet which changes its mind about trapping (or about
 * what Escape does) is read as it is now, not as it was when it opened.
 */
interface Layer {
  readonly init: LayerInit;
  readonly opener: HTMLElement | null;
}

const stack: Layer[] = [];

/** True while any sheet/dialog/popover layer is open — Esc-as-back stands down. */
export function hasOpenLayers(): boolean {
  return stack.length > 0;
}

function onKeydown(e: KeyboardEvent): void {
  const top = stack[stack.length - 1];
  if (top === undefined) return;

  if (e.key === 'Escape') {
    // stopPropagation so a not-yet-migrated bubble handler under this capture
    // listener cannot close a second surface off the same keystroke.
    e.preventDefault();
    e.stopPropagation();
    top.init.onClose();
    return;
  }

  if (e.key === 'Tab' && top.init.trap) {
    const root = top.init.container();
    if (root === null) return;
    const focusables = collectFocusables(root);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (first === undefined || last === undefined) {
      e.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !root.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

/**
 * Core, hook-free entry (also the test seam): push a layer, get back its pop.
 * Installs the document listener with the first layer, removes it with the
 * last.
 */
export function pushLayer(init: LayerInit): () => void {
  const layer: Layer = {
    init,
    opener: document.activeElement instanceof HTMLElement ? document.activeElement : null,
  };
  if (stack.length === 0) {
    document.addEventListener('keydown', onKeydown, true);
  }
  stack.push(layer);

  const container = init.container();
  const target =
    init.initialFocus?.() ?? (container !== null ? collectFocusables(container)[0] : undefined);
  target?.focus();

  return function pop(): void {
    const at = stack.indexOf(layer);
    if (at !== -1) stack.splice(at, 1);
    if (stack.length === 0) {
      document.removeEventListener('keydown', onKeydown, true);
    }
    // Only take focus back if the closing layer still had it: a sheet that
    // handed focus somewhere deliberate on its way out keeps that.
    const active = document.activeElement;
    const held =
      active === null || active === document.body || container?.contains(active) === true;
    if (init.restoreFocus && held && layer.opener !== null && layer.opener.isConnected) {
      layer.opener.focus();
    }
  };
}

/**
 * Declare "this container is an open layer". Mount = take focus, unmount (or
 * enabled turning false) = restore it. `onClose` is what Escape should do —
 * usually the component's existing close/continue action.
 */
export function useDismissLayer(
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  opts: LayerOptions = {},
): void {
  // Options and onClose change identity every render; the layer reads the
  // latest through a ref so the stack entry never has to re-push.
  const latest = useRef({ onClose, opts });
  useEffect(() => {
    latest.current = { onClose, opts };
  });

  const enabled = opts.enabled ?? true;
  useEffect(() => {
    if (!enabled) return undefined;
    return pushLayer({
      container: () => containerRef.current,
      onClose: () => latest.current.onClose(),
      get trap() {
        return latest.current.opts.trap === true;
      },
      get restoreFocus() {
        return latest.current.opts.restoreFocus !== false;
      },
      get initialFocus() {
        return latest.current.opts.initialFocus;
      },
    });
  }, [enabled, containerRef]);
}
